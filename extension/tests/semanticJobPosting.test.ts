// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanPage } from '../src/scanner/pageScanner';
import { extractSemanticJobPosting } from '../src/scanner/semanticJobPosting';
import { JobPostingSchema } from '../src/types/jobPosting';

const semanticUrl = 'https://careers.example.test/jobs/systems-analyst';
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

describe('semantic JobPosting extraction', () => {
  it('normalizes the sanitized semantic HTML fixture', () => {
    loadFixture('semantic-html.html');

    const result = scanPage(document, semanticUrl);

    expect(result.hasJobPostingStructuredData).toBe(false);
    expect(result.jobPosting).toMatchObject({
      title: { value: 'Systems Analyst' },
      company: { value: 'Cedar Harbor Cooperative' },
      location: { value: ['Example Harbor, ME'] },
      description: {
        value: 'Improve internal systems using documented, testable processes.',
      },
      compensation: { value: null },
      canonicalUrl: { value: null },
      requisitionId: { value: null },
      requirements: {
        required: [
          {
            text: 'Experience documenting business processes.',
            classification: 'required',
          },
        ],
        preferred: [],
        unknown: [],
      },
    });
    expect(result.jobPosting?.title.provenance[0]?.source).toBe('semantic');
    expect(JobPostingSchema.safeParse(result.jobPosting).success).toBe(true);
  });

  it('keeps valid JSON-LD ahead of a conflicting semantic candidate', () => {
    loadFixture('strong-json-ld.html');
    const semantic = document.createElement('article');
    semantic.setAttribute('itemscope', '');
    semantic.setAttribute('itemtype', 'https://schema.org/JobPosting');
    semantic.innerHTML = '<h1 itemprop="title">Conflicting semantic role</h1>';
    document.body.append(semantic);

    const result = scanPage(
      document,
      'https://careers.example.test/jobs/platform-support-engineer',
    );

    expect(result.jobPosting?.title.value).toBe('Platform Support Engineer');
    expect(result.jobPosting?.title.provenance[0]?.source).toBe('json_ld');
  });

  it('returns null for multiple ambiguous semantic roots', () => {
    loadHtml(`
      <article itemscope itemtype="https://schema.org/JobPosting">
        <h1 itemprop="title">First role</h1>
      </article>
      <article itemscope itemtype="https://schema.org/JobPosting">
        <h1 itemprop="title">Second role</h1>
      </article>
    `);

    expect(
      extractSemanticJobPosting(document, semanticUrl, extractedAt),
    ).toBeNull();
  });

  it('keeps missing semantic fields unknown', () => {
    loadHtml(`
      <article itemscope itemtype="https://schema.org/JobPosting">
        <h1 itemprop="title">Sparse semantic role</h1>
      </article>
    `);

    const posting = extractSemanticJobPosting(
      document,
      semanticUrl,
      extractedAt,
    );

    expect(posting?.title.value).toBe('Sparse semantic role');
    expect(posting?.company.value).toBeNull();
    expect(posting?.location.value).toBeNull();
    expect(posting?.description.value).toBeNull();
    expect(posting?.compensation.value).toBeNull();
    expect(posting?.canonicalUrl.value).toBeNull();
    expect(posting?.requisitionId.value).toBeNull();
  });

  it('matches a property within a tokenized itemprop value', () => {
    loadHtml(`
      <article itemscope itemtype="https://schema.org/JobPosting">
        <h1 itemprop="name title">Tokenized title role</h1>
      </article>
    `);

    const posting = extractSemanticJobPosting(
      document,
      semanticUrl,
      extractedAt,
    );

    expect(posting?.title.value).toBe('Tokenized title role');
  });

  it('isolates properties inside a nested microdata scope', () => {
    loadHtml(`
      <article itemscope itemtype="https://schema.org/JobPosting">
        <h1 itemprop="title">Outer title</h1>
        <div itemprop="hiringOrganization" itemscope itemtype="https://schema.org/Organization">
          <span itemprop="name">Example Organization</span>
          <span itemprop="title">Nested conflicting title</span>
        </div>
      </article>
    `);

    const posting = extractSemanticJobPosting(
      document,
      semanticUrl,
      extractedAt,
    );

    expect(posting?.title.value).toBe('Outer title');
    expect(posting?.company.value).toBe('Example Organization');
  });

  it('keeps conflicting direct scalar properties unknown', () => {
    loadHtml(`
      <article itemscope itemtype="https://schema.org/JobPosting">
        <h1 itemprop="title">First direct title</h1>
        <meta itemprop="title" content="Second direct title">
      </article>
    `);

    const posting = extractSemanticJobPosting(
      document,
      semanticUrl,
      extractedAt,
    );

    expect(posting).not.toBeNull();
    expect(posting?.title.value).toBeNull();
  });

  it('classifies only explicitly headed requirement groups', () => {
    loadHtml(`
      <article itemscope itemtype="https://schema.org/JobPosting">
        <h1 itemprop="title">Grouped requirements role</h1>
        <section>
          <h2>Required qualifications</h2>
          <ul><li>Document production changes.</li></ul>
        </section>
        <section>
          <h2>Preferred qualifications</h2>
          <ul><li>Experience with observability tools.</li></ul>
        </section>
        <section>
          <h2>Qualifications</h2>
          <ul><li>Clear written communication.</li></ul>
        </section>
        <section>
          <h2>What you will do</h2>
          <ul><li>This is not a qualification.</li></ul>
        </section>
      </article>
    `);

    const requirements = extractSemanticJobPosting(
      document,
      semanticUrl,
      extractedAt,
    )?.requirements;

    expect(requirements?.required.map(({ text }) => text)).toEqual([
      'Document production changes.',
    ]);
    expect(requirements?.preferred.map(({ text }) => text)).toEqual([
      'Experience with observability tools.',
    ]);
    expect(requirements?.unknown.map(({ text }) => text)).toEqual([
      'Clear written communication.',
    ]);
  });

  it('maps explicitly structured identifier, compensation, and URL fields', () => {
    loadHtml(`
      <article itemscope itemtype="https://schema.org/JobPosting">
        <meta itemprop="title" content="Structured salary role">
        <meta itemprop="identifier" content="EX-2048">
        <link itemprop="url" href="/jobs/structured-salary-role">
        <div itemprop="baseSalary" itemscope itemtype="https://schema.org/MonetaryAmount">
          <meta itemprop="currency" content="USD">
          <div itemprop="value" itemscope itemtype="https://schema.org/QuantitativeValue">
            <meta itemprop="minValue" content="40">
            <meta itemprop="maxValue" content="55">
            <meta itemprop="unitText" content="HOUR">
          </div>
        </div>
      </article>
    `);
    const currentUrl =
      'https://careers.example.test/jobs/structured-salary-role';

    const posting = extractSemanticJobPosting(
      document,
      currentUrl,
      extractedAt,
    );

    expect(posting?.requisitionId.value).toBe('EX-2048');
    expect(posting?.canonicalUrl.value).toBe(currentUrl);
    expect(posting?.compensation.value).toMatchObject({
      minimum: 40,
      maximum: 55,
      currency: 'USD',
      interval: 'hour',
    });
  });

  it('does not normalize the non-job careers listing fixture', () => {
    loadFixture('non-job-careers-listing.html');

    expect(
      scanPage(document, 'https://careers.example.test/jobs').jobPosting,
    ).toBeNull();
  });

  it('does not fall back to arbitrary generic DOM text', () => {
    loadFixture('generic-dom-only.html');

    const result = extractSemanticJobPosting(
      document,
      'https://careers.example.test/jobs/operations-data-specialist',
      extractedAt,
    );

    expect(result).toBeNull();
  });
});
