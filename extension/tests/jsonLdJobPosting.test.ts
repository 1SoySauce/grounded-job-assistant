// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JSON_LD_LIMITS,
  extractJsonLdJobPosting,
} from '../src/scanner/jsonLdJobPosting';
import { scanPage } from '../src/scanner/pageScanner';
import { JobPostingSchema } from '../src/types/jobPosting';

const currentUrl =
  'https://careers.example.test/jobs/platform-support-engineer';
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

function addJsonLd(value: unknown): void {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(value);
  document.head.append(script);
}

function resetDocument(): void {
  loadHtml('<!doctype html><html><head></head><body></body></html>');
}

function posting(title: string, url = currentUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title,
    url,
  };
}

describe('JSON-LD JobPosting extraction', () => {
  it('normalizes the strong sanitized JSON-LD fixture', () => {
    loadFixture('strong-json-ld.html');

    const result = scanPage(document, currentUrl);

    expect(result.hasJobPostingStructuredData).toBe(true);
    expect(result.jobPosting).toMatchObject({
      schemaVersion: 1,
      title: { value: 'Platform Support Engineer' },
      company: { value: 'Northstar Lantern Labs' },
      location: { value: ['Example City, NY, US'] },
      compensation: {
        value: {
          minimum: 70_000,
          maximum: 90_000,
          currency: 'USD',
          interval: 'year',
        },
      },
      description: {
        value: 'Support reliable systems for fictional customers.',
      },
      canonicalUrl: { value: currentUrl },
      requisitionId: { value: 'NSL-ENG-1042' },
      requirements: { required: [], preferred: [], unknown: [] },
    });
    expect(result.jobPosting?.title.provenance[0]?.source).toBe('json_ld');
    expect(JobPostingSchema.safeParse(result.jobPosting).success).toBe(true);
  });

  it.each([
    ['compact type', 'JobPosting'],
    ['HTTPS expanded IRI', 'https://schema.org/JobPosting'],
    ['HTTP expanded IRI', 'http://schema.org/JobPosting'],
  ])('accepts a scalar %s', (_name, type) => {
    resetDocument();
    addJsonLd({ ...posting('Scalar type role'), '@type': type });

    const result = extractJsonLdJobPosting(document, currentUrl, extractedAt);

    expect(result.hasJobPostingStructuredData).toBe(true);
    expect(result.jobPosting?.title.value).toBe('Scalar type role');
  });

  it('accepts an array-valued type containing an expanded JobPosting IRI', () => {
    resetDocument();
    addJsonLd({
      ...posting('Expanded array type role'),
      '@type': ['Thing', 'https://schema.org/JobPosting'],
    });

    const result = extractJsonLdJobPosting(document, currentUrl, extractedAt);

    expect(result.hasJobPostingStructuredData).toBe(true);
    expect(result.jobPosting?.title.value).toBe('Expanded array type role');
  });

  it.each([
    ['an unrelated Schema.org type', 'https://schema.org/Organization'],
    [
      'an arbitrary IRI ending in JobPosting',
      'https://example.test/JobPosting',
    ],
  ])('rejects %s', (_name, type) => {
    resetDocument();
    addJsonLd({ ...posting('Unrelated type'), '@type': type });

    const result = extractJsonLdJobPosting(document, currentUrl, extractedAt);

    expect(result.hasJobPostingStructuredData).toBe(false);
    expect(result.jobPosting).toBeNull();
  });

  it.each([
    ['object', posting('Object role')],
    ['array', [{ '@type': 'Thing' }, posting('Array role')]],
    [
      '@graph',
      {
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'Organization', name: 'Example' },
          { ...posting('Graph role'), '@type': ['Thing', 'JobPosting'] },
        ],
      },
    ],
    [
      'nested object and array',
      { payload: { records: [posting('Nested role')] } },
    ],
  ])('finds a JobPosting in a %s structure', (_name, value) => {
    resetDocument();
    addJsonLd(value);

    const result = extractJsonLdJobPosting(document, currentUrl, extractedAt);

    expect(result.hasJobPostingStructuredData).toBe(true);
    expect(result.jobPosting?.title.value).toMatch(/ role$/);
  });

  it('selects the unique candidate with the strongest URL agreement', () => {
    resetDocument();
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = currentUrl;
    document.head.append(canonical);
    const trackedUrl = `${currentUrl}?source=board`;
    addJsonLd([
      posting('Current URL candidate', trackedUrl),
      posting('Canonical URL candidate', currentUrl),
    ]);

    const result = extractJsonLdJobPosting(document, trackedUrl, extractedAt);

    expect(result.jobPosting?.title.value).toBe('Canonical URL candidate');
  });

  it('returns null instead of guessing between ambiguous postings', () => {
    resetDocument();
    addJsonLd([
      posting('First role', 'https://careers.example.test/jobs/first'),
      posting('Second role', 'https://careers.example.test/jobs/second'),
    ]);

    const result = extractJsonLdJobPosting(document, currentUrl, extractedAt);

    expect(result.hasJobPostingStructuredData).toBe(true);
    expect(result.jobPosting).toBeNull();
  });

  it('returns null when positive URL scores are tied', () => {
    resetDocument();
    addJsonLd([
      posting('First matching role'),
      posting('Second matching role'),
    ]);

    const result = extractJsonLdJobPosting(document, currentUrl, extractedAt);

    expect(result.hasJobPostingStructuredData).toBe(true);
    expect(result.jobPosting).toBeNull();
  });

  it('ignores malformed JSON-LD safely', () => {
    resetDocument();
    const malformed = document.createElement('script');
    malformed.type = 'application/ld+json';
    malformed.textContent = '{ definitely not JSON';
    document.head.append(malformed);
    addJsonLd(posting('Valid role'));

    expect(
      extractJsonLdJobPosting(document, currentUrl, extractedAt).jobPosting
        ?.title.value,
    ).toBe('Valid role');
  });

  it('converts an HTML description to inert readable text', () => {
    resetDocument();
    addJsonLd({
      ...posting('Safe description role'),
      description:
        '<p>Build <strong>safely</strong> &amp; reliably.</p><script>danger()</script>',
    });

    const result = extractJsonLdJobPosting(document, currentUrl, extractedAt);

    expect(result.jobPosting?.description.value).toBe(
      'Build safely & reliably.',
    );
    expect(document.querySelector('strong')).toBeNull();
    expect(document.querySelector('script:not([type])')).toBeNull();
  });

  it('keeps missing optional fields unknown', () => {
    resetDocument();
    addJsonLd({ '@type': 'JobPosting', title: 'Sparse role' });

    const postingResult = extractJsonLdJobPosting(
      document,
      currentUrl,
      extractedAt,
    ).jobPosting;

    expect(postingResult).not.toBeNull();
    expect(postingResult?.company.value).toBeNull();
    expect(postingResult?.location.value).toBeNull();
    expect(postingResult?.compensation.value).toBeNull();
    expect(postingResult?.description.value).toBeNull();
    expect(postingResult?.canonicalUrl.value).toBeNull();
    expect(postingResult?.requisitionId.value).toBeNull();
  });

  it('rejects oversized and excessive JSON-LD discovery conservatively', () => {
    resetDocument();
    const oversized = document.createElement('script');
    oversized.type = 'application/ld+json';
    oversized.textContent = ' '.repeat(JSON_LD_LIMITS.totalTextCharacters + 1);
    document.head.append(oversized);

    expect(
      extractJsonLdJobPosting(document, currentUrl, extractedAt).jobPosting,
    ).toBeNull();

    resetDocument();
    addJsonLd(posting('Hidden by incomplete discovery'));
    for (let index = 0; index < JSON_LD_LIMITS.scriptTags; index += 1) {
      addJsonLd({ '@type': 'Thing', index });
    }

    const excessive = extractJsonLdJobPosting(
      document,
      currentUrl,
      extractedAt,
    );
    expect(excessive.hasJobPostingStructuredData).toBe(true);
    expect(excessive.jobPosting).toBeNull();
  });

  it('returns null when traversal exceeds the depth limit', () => {
    resetDocument();
    let nested: unknown = posting('Too-deep role');
    for (let depth = 0; depth <= JSON_LD_LIMITS.traversalDepth; depth += 1) {
      nested = { nested };
    }
    addJsonLd(nested);

    expect(
      extractJsonLdJobPosting(document, currentUrl, extractedAt).jobPosting,
    ).toBeNull();
  });

  it('returns null when traversal exceeds the node limit', () => {
    resetDocument();
    addJsonLd({
      candidate: posting('Candidate before wide branch'),
      nodes: Array.from(
        { length: JSON_LD_LIMITS.traversedNodes },
        (_, index) => index,
      ),
    });

    const result = extractJsonLdJobPosting(document, currentUrl, extractedAt);

    expect(result.hasJobPostingStructuredData).toBe(true);
    expect(result.jobPosting).toBeNull();
  });

  it('returns null when discovery exceeds the candidate limit', () => {
    resetDocument();
    addJsonLd(
      Array.from({ length: JSON_LD_LIMITS.candidateObjects + 1 }, (_, index) =>
        posting(
          `Candidate ${index}`,
          index === 0
            ? currentUrl
            : `https://careers.example.test/jobs/candidate-${index}`,
        ),
      ),
    );

    const result = extractJsonLdJobPosting(document, currentUrl, extractedAt);

    expect(result.hasJobPostingStructuredData).toBe(true);
    expect(result.jobPosting).toBeNull();
  });

  it('does not normalize the non-job careers listing fixture', () => {
    loadFixture('non-job-careers-listing.html');

    const result = scanPage(document, 'https://careers.example.test/jobs');

    expect(result.hasJobPostingStructuredData).toBe(false);
    expect(result.jobPosting).toBeNull();
  });
});
