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

  it('excludes navigation, header, footer, and aside content', () => {
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
