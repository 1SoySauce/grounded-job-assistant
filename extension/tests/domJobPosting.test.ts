// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DOM_JOB_POSTING_LIMITS,
  extractDomJobPosting,
} from '../src/scanner/domJobPosting';
import { scanPage } from '../src/scanner/pageScanner';
import { JobPostingSchema } from '../src/types/jobPosting';

const extractedAt = '2026-09-21T12:00:00.000Z';

function loadHtml(html: string): void {
  document.open();
  document.write(html);
  document.close();
}

function loadFixture(name: string): void {
  loadHtml(
    readFileSync(resolve('tests', 'fixtures', 'job-postings', name), 'utf8'),
  );
}

describe('ARIA-assisted DOM JobPosting extraction', () => {
  it('normalizes the sanitized generic DOM fixture', () => {
    loadFixture('generic-dom-only.html');
    const url = 'https://careers.example.test/jobs/operations-data-specialist';

    const result = scanPage(document, url);

    expect(result.jobPosting).toMatchObject({
      title: { value: 'Operations Data Specialist' },
      company: { value: 'Fictional Orchard Systems' },
      location: { value: ['Example Springs, CO'] },
      description: {
        value:
          'Maintain accurate operational reports and documented data flows.',
      },
      compensation: { value: null },
      canonicalUrl: { value: null },
      requisitionId: { value: null },
      requirements: {
        required: [],
        preferred: [],
        unknown: [
          {
            text: 'Experience with spreadsheets and SQL.',
            classification: 'unknown',
          },
        ],
      },
    });
    expect(result.jobPosting?.title.provenance[0]?.source).toBe('dom_heading');
    expect(JobPostingSchema.safeParse(result.jobPosting).success).toBe(true);
  });

  it('keeps JSON-LD ahead of conflicting generic DOM content', () => {
    loadFixture('conflicting-sources.html');

    const result = scanPage(
      document,
      'https://careers.example.test/jobs/blue-elm-42',
    );

    expect(result.jobPosting?.title.value).toBe('Platform Support Engineer');
    expect(result.jobPosting?.company.value).toBe('Blue Elm Research');
    expect(result.jobPosting?.title.provenance[0]?.source).toBe('json_ld');
  });

  it('keeps semantic extraction ahead of conflicting generic DOM content', () => {
    loadFixture('semantic-html.html');
    document.body.insertAdjacentHTML(
      'beforeend',
      `
        <main>
          <h1>Conflicting generic role</h1>
          <h2>Responsibilities</h2><p>Generic responsibilities.</p>
          <h2>Requirements</h2><p>Generic requirements.</p>
        </main>
      `,
    );

    const result = scanPage(
      document,
      'https://careers.example.test/jobs/systems-analyst',
    );

    expect(result.jobPosting?.title.value).toBe('Systems Analyst');
    expect(result.jobPosting?.title.provenance[0]?.source).toBe('semantic');
  });

  it('returns null for the non-job careers listing fixture', () => {
    loadFixture('non-job-careers-listing.html');

    expect(
      scanPage(document, 'https://careers.example.test/jobs').jobPosting,
    ).toBeNull();
  });

  it('returns null for multiple plausible job-detail roots', () => {
    loadHtml(`
      <main>
        <h1>First role</h1>
        <h2>Responsibilities</h2><p>First responsibilities.</p>
        <h2>Requirements</h2><p>First requirements.</p>
      </main>
      <main>
        <h1>Second role</h1>
        <h2>Responsibilities</h2><p>Second responsibilities.</p>
        <h2>Requirements</h2><p>Second requirements.</p>
      </main>
    `);

    expect(
      extractDomJobPosting(
        document,
        'https://careers.example.test/jobs/ambiguous',
        extractedAt,
      ),
    ).toBeNull();
  });

  it('classifies explicit requirement groups conservatively', () => {
    loadFixture('requirement-groups.html');

    const requirements = scanPage(
      document,
      'https://careers.example.test/jobs/infrastructure-coordinator',
    ).jobPosting?.requirements;

    expect(requirements?.required.map(({ text }) => text)).toEqual([
      'Must be able to document incident timelines.',
    ]);
    expect(requirements?.preferred.map(({ text }) => text)).toEqual([
      'Experience with container platforms is preferred.',
    ]);
    expect(requirements?.unknown.map(({ text }) => text)).toEqual([
      'Familiarity with collaborative planning tools.',
    ]);
  });

  it('extracts only the clearly labeled compensation section', () => {
    loadFixture('compensation-variants.html');

    const compensation = scanPage(
      document,
      'https://careers.example.test/jobs/service-desk-specialist',
    ).jobPosting?.compensation.value;

    expect(compensation).toMatchObject({
      minimum: 28,
      maximum: 34,
      currency: 'USD',
      interval: 'hour',
    });
    expect(compensation?.rawText).not.toContain('62,000');
  });

  it.each([
    ['$70k–$90k', 70_000, 90_000],
    ['$70K - $90K', 70_000, 90_000],
    ['$70,000–$90,000 USD per year', 70_000, 90_000],
  ])('normalizes the compensation range %s', (rawText, minimum, maximum) => {
    loadHtml(`
        <main>
          <h1>Support Engineer</h1>
          <p>Example Company</p>
          <h2>Compensation</h2>
          <p>${rawText}</p>
          <h2>Responsibilities</h2>
          <p>Support documented production systems.</p>
          <h2>Requirements</h2>
          <p>Experience supporting production systems.</p>
        </main>
      `);

    const compensation = scanPage(
      document,
      'https://careers.example.test/jobs/support-engineer',
    ).jobPosting?.compensation.value;

    expect(compensation).toMatchObject({ minimum, maximum });
    if (rawText.includes('USD')) {
      expect(compensation).toMatchObject({
        currency: 'USD',
        interval: 'year',
      });
    }
  });

  it.each(['$70kk–$90k', '$70k–$90'])(
    'does not partially parse the malformed or ambiguous range %s',
    (rawText) => {
      loadHtml(`
        <main>
          <h1>Support Engineer</h1>
          <p>Example Company</p>
          <h2>Compensation</h2>
          <p>${rawText}</p>
          <h2>Responsibilities</h2>
          <p>Support documented production systems.</p>
          <h2>Requirements</h2>
          <p>Experience supporting production systems.</p>
        </main>
      `);

      const posting = scanPage(
        document,
        'https://careers.example.test/jobs/support-engineer',
      ).jobPosting;

      expect(posting?.title.value).toBe('Support Engineer');
      expect(posting?.compensation.value).toBeNull();
    },
  );

  it('requires an explicit requisition label and ignores unrelated numbers', () => {
    loadFixture('requisition-id-cases.html');

    const posting = scanPage(
      document,
      'https://jobs.example.test/openings/938475',
    ).jobPosting;

    expect(posting?.requisitionId.value).toBe('SVD-QA-2048');
    expect(posting?.requisitionId.value).not.toContain('938475');
    expect(posting?.canonicalUrl.value).toBe(
      'https://jobs.example.test/openings/938475',
    );
  });

  it.each([
    {
      name: 'one canonical',
      hrefs: ['/jobs/support-engineer'],
      resolved: true,
    },
    {
      name: 'equivalent repeated canonicals',
      hrefs: ['/jobs/support-engineer', '/jobs/support-engineer#details'],
      resolved: true,
    },
    {
      name: 'valid and unusable canonicals',
      hrefs: ['/jobs/support-engineer', 'javascript:alert(1)'],
      resolved: true,
    },
    {
      name: 'unusable canonicals only',
      hrefs: ['javascript:alert(1)', 'mailto:jobs@example.test'],
      resolved: false,
    },
    {
      name: 'conflicting canonicals',
      hrefs: ['/jobs/support-engineer', '/jobs/other'],
      resolved: false,
    },
    {
      name: 'conflicting canonicals in reverse order',
      hrefs: ['/jobs/other', '/jobs/support-engineer'],
      resolved: false,
    },
  ])('handles DOM canonical URLs: $name', ({ hrefs, resolved }) => {
    loadHtml(`
      <main>
        <h1>Support Engineer</h1>
        <h2>Responsibilities</h2><p>Support production systems.</p>
        <h2>Requirements</h2><p>Document changes.</p>
      </main>
    `);
    const url = 'https://careers.example.test/jobs/support-engineer';
    const original = extractDomJobPosting(document, url, extractedAt);
    expect(original?.title.value).toBe('Support Engineer');
    for (const href of hrefs) {
      const link = document.createElement('link');
      link.rel = 'canonical';
      link.setAttribute('href', href);
      document.head.append(link);
    }

    const posting = extractDomJobPosting(document, url, extractedAt);
    expect({ ...posting, canonicalUrl: original?.canonicalUrl }).toEqual(
      original,
    );
    if (resolved) {
      expect(posting?.canonicalUrl).toMatchObject({
        value: url,
        score: 0.75,
        confidence: 'medium',
        conflicted: false,
        provenance: [expect.objectContaining({ source: 'url' })],
      });
    } else {
      expect(posting?.canonicalUrl).toEqual({
        value: null,
        score: 0,
        confidence: 'low',
        conflicted: false,
        provenance: [],
      });
    }
    expect(JobPostingSchema.safeParse(posting).success).toBe(true);
  });

  describe('Checkpoint 2E unusable DOM canonical values', () => {
    it.each([
      {
        name: 'valid canonical then spaces',
        hrefs: ['/jobs/canonical', '   '],
        resolved: true,
      },
      {
        name: 'spaces then valid canonical',
        hrefs: ['   ', '/jobs/canonical'],
        resolved: true,
      },
      {
        name: 'valid canonical then mixed whitespace',
        hrefs: ['/jobs/canonical', ' \t\n '],
        resolved: true,
      },
      {
        name: 'mixed whitespace then valid canonical',
        hrefs: [' \t\n ', '/jobs/canonical'],
        resolved: true,
      },
      {
        name: 'spaces only',
        hrefs: ['   '],
        resolved: false,
      },
      {
        name: 'mixed whitespace only',
        hrefs: [' \t\n '],
        resolved: false,
      },
    ])(
      'ignores whitespace-only canonical hrefs: $name',
      ({ hrefs, resolved }) => {
        loadHtml(`
        <main>
          <h1>Support Engineer</h1>
          <h2>Responsibilities</h2><p>Support production systems.</p>
          <h2>Requirements</h2><p>Document changes.</p>
        </main>
      `);
        const url = 'https://careers.example.test/jobs/support-engineer';
        const original = extractDomJobPosting(document, url, extractedAt);
        expect(original?.title.value).toBe('Support Engineer');
        for (const href of hrefs) {
          const link = document.createElement('link');
          link.rel = 'canonical';
          link.setAttribute('href', href);
          document.head.append(link);
        }

        const posting = extractDomJobPosting(document, url, extractedAt);
        expect(posting).not.toBeNull();
        expect(posting?.canonicalUrl.value).toBe(
          resolved ? 'https://careers.example.test/jobs/canonical' : null,
        );
        expect({ ...posting, canonicalUrl: original?.canonicalUrl }).toEqual(
          original,
        );
        expect(JobPostingSchema.safeParse(posting).success).toBe(true);
      },
    );
  });

  it('leaves unsupported fields unknown in the missing-fields fixture', () => {
    loadFixture('missing-fields.html');

    const posting = scanPage(
      document,
      'https://careers.example.test/jobs/documentation-coordinator',
    ).jobPosting;

    expect(posting?.title.value).toBe('Documentation Coordinator');
    expect(posting?.company.value).toBe('Paper Kite Workshop');
    expect(posting?.location.value).toBeNull();
    expect(posting?.compensation.value).toBeNull();
    expect(posting?.canonicalUrl.value).toBeNull();
    expect(posting?.requisitionId.value).toBeNull();
  });

  it.each([
    {
      name: 'one plausible company',
      nearby: ['Blue Elm Research'],
      company: 'Blue Elm Research',
    },
    {
      name: 'equivalent repeated companies',
      nearby: ['Blue Elm Research', 'Blue Elm Research'],
      company: 'Blue Elm Research',
    },
    {
      name: 'conflicting companies',
      nearby: ['Blue Elm Research', 'Acme Systems'],
      company: null,
    },
    {
      name: 'conflicting companies in reverse order',
      nearby: ['Acme Systems', 'Blue Elm Research'],
      company: null,
    },
    {
      name: 'company followed by a location',
      nearby: ['Blue Elm Research', 'Example City, NY'],
      company: 'Blue Elm Research',
      location: 'Example City, NY',
    },
  ])(
    'handles nearby company ambiguity: $name',
    ({ nearby, company, location }) => {
      loadHtml(`
      <main>
        <h1>Support Engineer</h1>
        ${nearby.map((value) => `<p>${value}</p>`).join('')}
        <h2>Responsibilities</h2><p>Support production systems.</p>
        <h2>Requirements</h2><p>Document changes.</p>
      </main>
      `);
      const posting = extractDomJobPosting(
        document,
        'https://careers.example.test/jobs/support-engineer',
        extractedAt,
      );

      expect(posting).toMatchObject({
        title: { value: 'Support Engineer' },
        company: { value: company },
        location: { value: location ? [location] : null },
        description: { value: 'Support production systems.' },
        requirements: { required: [{ text: 'Document changes.' }] },
      });
      if (company === null) {
        expect(posting?.company).toEqual({
          value: null,
          score: 0,
          confidence: 'low',
          conflicted: false,
          provenance: [],
        });
      } else {
        expect(posting?.company).toMatchObject({
          score: 0.75,
          confidence: 'medium',
          conflicted: false,
          provenance: [expect.objectContaining({ source: 'visible_text' })],
        });
      }
      expect(JobPostingSchema.safeParse(posting).success).toBe(true);
    },
  );

  it('keeps company unknown when conflicting explicit ARIA companies accompany a plausible nearby company', () => {
    loadHtml(`
      <main>
        <h1>Support Engineer</h1>
        <p>Harbor Systems</p>
        <p>Example City, NY</p>
        <h2>Responsibilities</h2><p>Support production systems.</p>
        <h2>Requirements</h2><p>Document changes.</p>
      </main>
    `);
    const url = 'https://careers.example.test/jobs/support-engineer';
    const original = extractDomJobPosting(document, url, extractedAt);
    expect(original).toMatchObject({
      title: { value: 'Support Engineer' },
      company: { value: 'Harbor Systems' },
      location: { value: ['Example City, NY'] },
      description: { value: 'Support production systems.' },
      requirements: { required: [{ text: 'Document changes.' }] },
    });

    document.querySelector('main')!.insertAdjacentHTML(
      'afterbegin',
      `
        <p aria-label="Company">Blue Elm Research</p>
        <p aria-label="Company">Acme Systems</p>
      `,
    );

    const posting = extractDomJobPosting(document, url, extractedAt);
    expect({ ...posting, company: original?.company }).toEqual(original);
    expect(JobPostingSchema.safeParse(posting).success).toBe(true);
    expect(posting?.company.value).toBeNull();
  });

  it.each([
    {
      name: 'city then remote',
      locations: ['Example City, NY', 'Remote'],
    },
    {
      name: 'remote then city',
      locations: ['Remote', 'Example City, NY'],
    },
  ])(
    'keeps location unknown when conflicting nearby locations appear: $name',
    ({ locations }) => {
      loadHtml(`
        <main>
          <h1>Support Engineer</h1>
          <p>Harbor Systems</p>
          <h2>Responsibilities</h2><p>Support production systems.</p>
          <h2>Requirements</h2><p>Document changes.</p>
        </main>
      `);
      const url = 'https://careers.example.test/jobs/support-engineer';
      const original = extractDomJobPosting(document, url, extractedAt);
      expect(original).toMatchObject({
        title: { value: 'Support Engineer' },
        company: { value: 'Harbor Systems' },
        location: { value: null },
        description: { value: 'Support production systems.' },
        requirements: { required: [{ text: 'Document changes.' }] },
      });

      document
        .querySelector('main > p')!
        .insertAdjacentHTML(
          'afterend',
          locations.map((value) => `<p>${value}</p>`).join(''),
        );

      const posting = extractDomJobPosting(document, url, extractedAt);
      expect({ ...posting, location: original?.location }).toEqual(original);
      expect(JobPostingSchema.safeParse(posting).success).toBe(true);
      expect(posting?.location.value).toBeNull();
    },
  );

  it('keeps location unknown when conflicting explicit ARIA locations accompany a plausible nearby location', () => {
    loadHtml(`
      <main>
        <h1>Support Engineer</h1>
        <p>Harbor Systems</p>
        <p>Example City, NY</p>
        <h2>Responsibilities</h2><p>Support production systems.</p>
        <h2>Requirements</h2><p>Document changes.</p>
      </main>
    `);
    const url = 'https://careers.example.test/jobs/support-engineer';
    const original = extractDomJobPosting(document, url, extractedAt);
    expect(original).toMatchObject({
      title: { value: 'Support Engineer' },
      company: { value: 'Harbor Systems' },
      location: { value: ['Example City, NY'] },
      description: { value: 'Support production systems.' },
      requirements: { required: [{ text: 'Document changes.' }] },
    });

    document.querySelector('main')!.insertAdjacentHTML(
      'afterbegin',
      `
        <p aria-label="Location">Remote</p>
        <p aria-label="Location">Boston, MA</p>
      `,
    );

    const posting = extractDomJobPosting(document, url, extractedAt);
    expect({ ...posting, location: original?.location }).toEqual(original);
    expect(JobPostingSchema.safeParse(posting).success).toBe(true);
    expect(posting?.location.value).toBeNull();
  });

  describe('Checkpoint 2D nearby metadata boundary hardening', () => {
    it.each([
      {
        field: 'location' as const,
        name: 'contradiction after duplicates',
        nearby: ['Harbor Systems', 'Remote', 'Remote', 'Boston, MA'],
        duplicate: 'Remote',
        company: 'Harbor Systems',
        location: null,
      },
      {
        field: 'location' as const,
        name: 'contradiction before duplicates',
        nearby: ['Harbor Systems', 'Boston, MA', 'Remote', 'Remote'],
        duplicate: 'Remote',
        company: 'Harbor Systems',
        location: null,
      },
      {
        field: 'company' as const,
        name: 'contradiction after duplicates',
        nearby: ['Remote', 'Harbor Systems', 'Harbor Systems', 'Acme Systems'],
        duplicate: 'Harbor Systems',
        company: null,
        location: ['Remote'],
      },
      {
        field: 'company' as const,
        name: 'contradiction before duplicates',
        nearby: ['Remote', 'Acme Systems', 'Harbor Systems', 'Harbor Systems'],
        duplicate: 'Harbor Systems',
        company: null,
        location: ['Remote'],
      },
    ])(
      'keeps $field unknown when duplicate nearby observations cross the boundary: $name',
      ({ field, nearby, duplicate, company, location }) => {
        loadHtml(`
          <main>
            <h1>Support Engineer</h1>
            ${nearby.map((value) => `<p>${value}</p>`).join('')}
            <h2>Responsibilities</h2><p>Support production systems.</p>
            <h2>Requirements</h2><p>Document changes.</p>
          </main>
        `);
        const url = 'https://careers.example.test/jobs/support-engineer';
        const original = extractDomJobPosting(document, url, extractedAt);
        expect(original).toMatchObject({
          title: { value: 'Support Engineer' },
          company: { value: company },
          location: { value: location },
          description: { value: 'Support production systems.' },
          requirements: { required: [{ text: 'Document changes.' }] },
        });
        expect(original?.[field].value).toBeNull();

        document
          .querySelector('main > p:nth-of-type(3)')!
          .insertAdjacentHTML('beforebegin', `<p>${duplicate}</p>`);

        const posting = extractDomJobPosting(document, url, extractedAt);
        expect({ ...posting, [field]: original?.[field] }).toEqual(original);
        expect(JobPostingSchema.safeParse(posting).success).toBe(true);
        expect(posting?.[field].value).toBeNull();
      },
    );

    it.each([
      {
        field: 'location' as const,
        name: 'contradiction fifth',
        nearby: [
          'Harbor Systems',
          'Remote',
          'Full-time.',
          'Posted today.',
          'Boston, MA',
        ],
        preserved: { company: { value: 'Harbor Systems' } },
      },
      {
        field: 'location' as const,
        name: 'contradiction moved earlier',
        nearby: [
          'Harbor Systems',
          'Remote',
          'Full-time.',
          'Boston, MA',
          'Posted today.',
        ],
        preserved: { company: { value: 'Harbor Systems' } },
      },
      {
        field: 'company' as const,
        name: 'contradiction fifth',
        nearby: [
          'Remote',
          'Harbor Systems',
          'Full-time.',
          'Posted today.',
          'Acme Systems',
        ],
        preserved: { location: { value: ['Remote'] } },
      },
      {
        field: 'company' as const,
        name: 'contradiction moved earlier',
        nearby: [
          'Remote',
          'Harbor Systems',
          'Full-time.',
          'Acme Systems',
          'Posted today.',
        ],
        preserved: { location: { value: ['Remote'] } },
      },
    ])(
      'keeps $field unknown with five distinct nearby values: $name',
      ({ field, nearby, preserved }) => {
        loadHtml(`
          <main>
            <h1>Support Engineer</h1>
            ${nearby.map((value) => `<p>${value}</p>`).join('')}
            <h2>Responsibilities</h2><p>Support production systems.</p>
            <h2>Requirements</h2><p>Document changes.</p>
          </main>
        `);
        const posting = extractDomJobPosting(
          document,
          'https://careers.example.test/jobs/support-engineer',
          extractedAt,
        );

        expect(posting).toMatchObject({
          title: { value: 'Support Engineer' },
          description: { value: 'Support production systems.' },
          requirements: { required: [{ text: 'Document changes.' }] },
          ...preserved,
        });
        expect(JobPostingSchema.safeParse(posting).success).toBe(true);
        expect(posting?.[field].value).toBeNull();
      },
    );

    it('preserves nearby company when an explicit ARIA location resembles a company', () => {
      loadHtml(`
        <main>
          <h1>Support Engineer</h1>
          <p>Harbor Systems</p>
          <h2>Responsibilities</h2><p>Support production systems.</p>
          <h2>Requirements</h2><p>Document changes.</p>
        </main>
      `);
      const url = 'https://careers.example.test/jobs/support-engineer';
      const original = extractDomJobPosting(document, url, extractedAt);
      expect(original).toMatchObject({
        title: { value: 'Support Engineer' },
        company: { value: 'Harbor Systems' },
        location: { value: null },
        description: { value: 'Support production systems.' },
        requirements: { required: [{ text: 'Document changes.' }] },
      });

      document
        .querySelector('main > p')!
        .insertAdjacentHTML('afterend', '<p aria-label="Location">Berlin</p>');

      const posting = extractDomJobPosting(document, url, extractedAt);
      expect({
        ...posting,
        company: original?.company,
        location: original?.location,
      }).toEqual(original);
      expect(JobPostingSchema.safeParse(posting).success).toBe(true);
      expect(posting?.location).toMatchObject({
        value: ['Berlin'],
        provenance: [expect.objectContaining({ source: 'aria' })],
      });
      expect(posting?.company.value).toBe('Harbor Systems');
    });
  });

  describe('Checkpoint 2F nested explicit ARIA metadata isolation', () => {
    it.each([
      {
        name: 'nearby company plus nested explicit location',
        company: 'Harbor Systems',
      },
      {
        name: 'nested explicit location with no nearby company',
        company: null,
      },
    ])('isolates $name', ({ company }) => {
      loadHtml(`
        <main>
          <h1>Support Engineer</h1>
          ${company ? `<p>${company}</p>` : ''}
          <div><span aria-label="Location">Berlin</span></div>
          <h2>Responsibilities</h2><p>Support production systems.</p>
          <h2>Requirements</h2><p>Document changes.</p>
        </main>
      `);
      const posting = extractDomJobPosting(
        document,
        'https://careers.example.test/jobs/support-engineer',
        extractedAt,
      );

      expect(posting).toMatchObject({
        title: { value: 'Support Engineer' },
        location: {
          value: ['Berlin'],
          provenance: [expect.objectContaining({ source: 'aria' })],
        },
        description: { value: 'Support production systems.' },
        requirements: { required: [{ text: 'Document changes.' }] },
      });
      expect(JobPostingSchema.safeParse(posting).success).toBe(true);
      expect(posting?.company.value).toBe(company);
      if (company === null) {
        expect(posting?.company.provenance).toEqual([]);
      }
    });
  });

  describe('Checkpoint 2G referenced ARIA label isolation', () => {
    it.each([
      {
        name: 'nearby company plus aria-labelledby location',
        company: 'Harbor Systems',
      },
      {
        name: 'aria-labelledby location with no nearby company',
        company: null,
      },
    ])('isolates $name', ({ company }) => {
      loadHtml(`
        <main>
          <h1>Support Engineer</h1>
          ${company ? `<p>${company}</p>` : ''}
          <div>
            <span id="location-label">Location</span>
            <span aria-labelledby="location-label">Berlin</span>
          </div>
          <h2>Responsibilities</h2><p>Support production systems.</p>
          <h2>Requirements</h2><p>Document changes.</p>
        </main>
      `);
      const posting = extractDomJobPosting(
        document,
        'https://careers.example.test/jobs/support-engineer',
        extractedAt,
      );

      expect(posting).toMatchObject({
        title: { value: 'Support Engineer' },
        location: {
          value: ['Berlin'],
          provenance: [expect.objectContaining({ source: 'aria' })],
        },
        description: { value: 'Support production systems.' },
        requirements: { required: [{ text: 'Document changes.' }] },
      });
      expect(JobPostingSchema.safeParse(posting).success).toBe(true);
      expect(posting?.company.value).toBe(company);
      if (company === null) {
        expect(posting?.company.provenance).toEqual([]);
      }
    });
  });

  it.each([
    'London, England',
    'London, England, United Kingdom',
    'Toronto, Ontario, Canada',
  ])('recognizes the international location %s', (location) => {
    loadHtml(`
      <main>
        <h1>International Support Engineer</h1>
        <p>${location}</p>
        <h2>Responsibilities</h2><p>Support international systems.</p>
        <h2>Requirements</h2><p>Experience supporting production systems.</p>
      </main>
    `);

    const posting = extractDomJobPosting(
      document,
      'https://careers.example.test/jobs/international-support-engineer',
      extractedAt,
    );

    expect(posting?.company.value).toBeNull();
    expect(posting?.location.value).toEqual([location]);
  });

  it.each(['Example City, NY', 'Remote', 'Hybrid - London'])(
    'preserves existing location handling for %s',
    (location) => {
      loadHtml(`
        <main>
          <h1>Support Engineer</h1>
          <p>Example Company</p>
          <p>${location}</p>
          <h2>Responsibilities</h2><p>Support production systems.</p>
          <h2>Requirements</h2><p>Experience supporting production systems.</p>
        </main>
      `);

      const posting = extractDomJobPosting(
        document,
        'https://careers.example.test/jobs/support-engineer',
        extractedAt,
      );

      expect(posting?.company.value).toBe('Example Company');
      expect(posting?.location.value).toEqual([location]);
    },
  );

  it('preserves a comma-bearing company suffix as company metadata', () => {
    loadHtml(`
      <main>
        <h1>Support Engineer</h1>
        <p>Harbor Systems, Inc.</p>
        <p>London, England</p>
        <h2>Responsibilities</h2><p>Support production systems.</p>
        <h2>Requirements</h2><p>Experience supporting production systems.</p>
      </main>
    `);

    const posting = extractDomJobPosting(
      document,
      'https://careers.example.test/jobs/support-engineer',
      extractedAt,
    );

    expect(posting?.company.value).toBe('Harbor Systems, Inc.');
    expect(posting?.location.value).toEqual(['London, England']);
  });

  it('uses explicit ARIA heading, metadata, and section associations', () => {
    loadHtml(`
      <main role="main">
        <div role="heading" aria-level="1" aria-label="Accessibility Engineer"></div>
        <p aria-label="Company">Inclusive Systems</p>
        <p aria-label="Location">Remote</p>
        <section role="region" aria-labelledby="responsibilities-label">
          <h2 id="responsibilities-label">Responsibilities</h2>
          <p>Improve accessible platform components.</p>
        </section>
        <section role="region" aria-label="Required qualifications">
          <ul>
            <li>Experience testing accessible interfaces.</li>
            <li>Experience testing accessible interfaces.</li>
          </ul>
        </section>
      </main>
    `);

    const posting = extractDomJobPosting(
      document,
      'https://careers.example.test/jobs/accessibility-engineer',
      extractedAt,
    );

    expect(posting?.title.value).toBe('Accessibility Engineer');
    expect(posting?.title.provenance[0]?.source).toBe('aria');
    expect(posting?.company.value).toBe('Inclusive Systems');
    expect(posting?.location.value).toEqual(['Remote']);
    expect(posting?.description.value).toBe(
      'Improve accessible platform components.',
    );
    expect(posting?.requirements.required).toHaveLength(1);
    expect(posting?.requirements.required[0]?.provenance[0]?.source).toBe(
      'aria',
    );
  });

  it('extracts a title from a header nested in an article candidate', () => {
    loadHtml(`
      <article>
        <header>
          <h1>Platform Reliability Engineer</h1>
        </header>
        <h2>Responsibilities</h2>
        <p>Maintain reliable platform services.</p>
        <h2>Requirements</h2>
        <p>Experience operating production systems.</p>
      </article>
    `);

    const posting = extractDomJobPosting(
      document,
      'https://careers.example.test/jobs/platform-reliability-engineer',
      extractedAt,
    );

    expect(posting?.title.value).toBe('Platform Reliability Engineer');
    expect(posting?.title.provenance[0]?.source).toBe('dom_heading');
  });

  it('does not treat an article inside a page-level header as a candidate', () => {
    loadHtml(`
      <header>
        <article>
          <h1>Featured navigation role</h1>
          <h2>Responsibilities</h2><p>Navigate featured roles.</p>
          <h2>Requirements</h2><p>Browse available openings.</p>
        </article>
      </header>
      <main>
        <h1>Trusted root title</h1>
        <h2>Responsibilities</h2><p>Trusted responsibilities.</p>
        <h2>Requirements</h2><p>Trusted requirement.</p>
      </main>
    `);

    const posting = extractDomJobPosting(
      document,
      'https://careers.example.test/jobs/trusted-root',
      extractedAt,
    );

    expect(posting?.title.value).toBe('Trusted root title');
  });

  it('excludes page chrome and restricted nested regions', () => {
    loadHtml(`
      <header><h1>Header title</h1><p>Header company</p></header>
      <nav>Navigation company</nav>
      <main>
        <h1>Trusted root title</h1>
        <p>Trusted Company</p>
        <p>Example City, NY</p>
        <aside>
          <h1>Aside title</h1>
          <h2>Requirements</h2><p>Aside requirement.</p>
        </aside>
        <nav><h1>Navigation title</h1></nav>
        <footer><h1>Footer title</h1></footer>
        <form><h1>Form title</h1></form>
        <div hidden><h1>Hidden title</h1></div>
        <div aria-hidden="true"><h1>ARIA-hidden title</h1></div>
        <div role="dialog"><h1>Dialog title</h1></div>
        <div role="complementary"><h1>Complementary title</h1></div>
        <h2>Responsibilities</h2><p>Trusted responsibilities.</p>
        <h2>Requirements</h2><p>Trusted requirement.</p>
      </main>
      <footer>Footer company 99999</footer>
    `);

    const posting = extractDomJobPosting(
      document,
      'https://careers.example.test/jobs/trusted-root',
      extractedAt,
    );

    expect(posting?.title.value).toBe('Trusted root title');
    expect(posting?.company.value).toBe('Trusted Company');
    expect(posting?.location.value).toEqual(['Example City, NY']);
    expect(posting?.requirements.required.map(({ text }) => text)).toEqual([
      'Trusted requirement.',
    ]);
  });

  it('excludes nested restricted regions from requirement entries', () => {
    loadHtml(`
      <main>
        <h1>Scoped requirements role</h1>
        <h2>Responsibilities</h2><p>Maintain scoped extraction.</p>
        <h2>Requirements</h2>
        <div>
          <ul><li>Legitimate requirement.</li></ul>
          <nav><ul><li>Navigation contamination.</li></ul></nav>
        </div>
      </main>
    `);

    const posting = extractDomJobPosting(
      document,
      'https://careers.example.test/jobs/scoped-requirements',
      extractedAt,
    );

    expect(posting?.requirements.required.map(({ text }) => text)).toEqual([
      'Legitimate requirement.',
    ]);
  });

  it('returns null above the document element limit', () => {
    loadHtml(`
      <main>
        <h1>Oversized document role</h1>
        <h2>Responsibilities</h2><p>Maintain systems.</p>
        <h2>Requirements</h2><p>Document changes.</p>
      </main>
    `);
    const excess = document.createDocumentFragment();
    for (
      let index = 0;
      index < DOM_JOB_POSTING_LIMITS.documentElements + 1;
      index += 1
    ) {
      excess.append(document.createElement('span'));
    }
    document.body.append(excess);

    expect(
      extractDomJobPosting(
        document,
        'https://careers.example.test/jobs/oversized-document',
        extractedAt,
      ),
    ).toBeNull();
  });

  it('returns null above the candidate region limit', () => {
    loadHtml(
      Array.from(
        { length: DOM_JOB_POSTING_LIMITS.candidateRegions + 1 },
        (_, index) => `
          <main>
            <h1>Candidate ${index}</h1>
            <h2>Responsibilities</h2><p>Responsibility ${index}.</p>
            <h2>Requirements</h2><p>Requirement ${index}.</p>
          </main>
        `,
      ).join(''),
    );

    expect(
      extractDomJobPosting(
        document,
        'https://careers.example.test/jobs/excess-candidates',
        extractedAt,
      ),
    ).toBeNull();
  });

  it('returns null above the heading limit', () => {
    const sections = [
      '<h2>Responsibilities</h2><p>Maintain systems.</p>',
      ...Array.from(
        { length: DOM_JOB_POSTING_LIMITS.headingsPerRegion },
        (_, index) => `<h2>Requirements</h2><p>Requirement ${index}.</p>`,
      ),
    ].join('');
    loadHtml(`<main><h1>Excess headings role</h1>${sections}</main>`);

    expect(
      extractDomJobPosting(
        document,
        'https://careers.example.test/jobs/excess-headings',
        extractedAt,
      ),
    ).toBeNull();
  });
});
