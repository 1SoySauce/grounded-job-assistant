// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  classifyPage,
  detectAtsProvider,
  scanPage,
} from '../src/scanner/pageScanner';
import { PageScanResultSchema } from '../src/types/scanner';

describe('page scanner foundations', () => {
  it('detects known ATS hosts without relying on page CSS', () => {
    expect(
      detectAtsProvider('https://boards.greenhouse.io/example/jobs/123'),
    ).toBe('greenhouse');
    expect(detectAtsProvider('https://jobs.lever.co/example/abc')).toBe(
      'lever',
    );
    expect(detectAtsProvider('https://careers.example.com/jobs/123')).toBe(
      'generic',
    );
  });

  it('prioritizes a confirmation over other job-page signals', () => {
    expect(
      classifyPage({
        url: 'https://example.com/apply',
        title: 'Done',
        text: 'Thank you for applying. Your application has been submitted.',
        fieldCount: 5,
        formCount: 1,
        hasJobPostingStructuredData: true,
      }),
    ).toBe('application_confirmation');
  });

  it('detects a basic application form conservatively', () => {
    expect(
      classifyPage({
        url: 'https://example.com/apply',
        title: 'Apply',
        text: 'Candidate information — submit application',
        fieldCount: 4,
        formCount: 1,
        hasJobPostingStructuredData: false,
      }),
    ).toBe('application_form');
  });

  it('does not guess when there is insufficient evidence', () => {
    expect(
      classifyPage({
        url: 'https://example.com',
        title: 'Example',
        text: 'Welcome to our website.',
        fieldCount: 0,
        formCount: 0,
        hasJobPostingStructuredData: false,
      }),
    ).toBe('unrelated');
  });

  it('preserves the coarse scan and returns no normalized posting yet', () => {
    document.title = 'Example careers page';
    document.body.innerHTML = `
      <main>
        <h1>Example careers</h1>
        <form><input name="query"><select name="team"></select></form>
      </main>
    `;
    const result = scanPage(document, 'https://careers.example.test/jobs');

    expect(result).toMatchObject({
      pageType: 'unrelated',
      ats: 'generic',
      title: 'Example careers page',
      url: 'https://careers.example.test/jobs',
      fieldCount: 2,
      formCount: 1,
      hasJobPostingStructuredData: false,
      jobPosting: null,
    });
    expect(PageScanResultSchema.safeParse(result).success).toBe(true);
  });

  it('counts a native input inside a reachable open shadow root', () => {
    document.head.innerHTML = '';
    const host = document.createElement('x-field');
    document.body.replaceChildren(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '<input type="text">';

    expect(host.shadowRoot).toBe(shadowRoot);
    expect(shadowRoot.querySelectorAll('input')).toHaveLength(1);
    expect(document.querySelectorAll('input')).toHaveLength(0);

    const result = scanPage(document, 'https://careers.example.test/apply');

    expect(result.formCount).toBe(0);
    expect(result.fieldCount).toBe(1);
  });

  it('counts nested open-shadow fields and slotted fields exactly once', () => {
    document.head.innerHTML = '';
    const host = document.createElement('x-field');
    host.innerHTML = '<input type="text" role="combobox">';
    document.body.replaceChildren(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const nestedHost = document.createElement('x-field');
    shadowRoot.append(document.createElement('slot'), nestedHost);
    nestedHost.attachShadow({ mode: 'open' }).innerHTML =
      '<textarea></textarea>';

    const result = scanPage(document, 'https://careers.example.test/apply');

    expect(result.formCount).toBe(0);
    expect(result.fieldCount).toBe(2);
  });

  it('ignores controls in closed shadow roots and iframe documents', () => {
    document.head.innerHTML = '';
    const host = document.createElement('x-field');
    const iframe = document.createElement('iframe');
    document.body.replaceChildren(host, iframe);
    host.attachShadow({ mode: 'closed' }).innerHTML = '<input type="text">';
    iframe.contentDocument!.body.innerHTML = '<input type="text">';
    expect(host.shadowRoot).toBeNull();

    const result = scanPage(document, 'https://careers.example.test/apply');

    expect(result.formCount).toBe(0);
    expect(result.fieldCount).toBe(0);
  });

  it('keeps the coarse structured-data signal independent from extraction', () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      '@type': ['Thing', 'JobPosting'],
      title: 'Array-typed role',
      url: 'https://careers.example.test/jobs/array-typed-role',
    });
    document.head.append(script);

    const result = scanPage(
      document,
      'https://careers.example.test/jobs/array-typed-role',
    );

    expect(result.hasJobPostingStructuredData).toBe(false);
    expect(result.pageType).toBe('unrelated');
    expect(result.jobPosting?.title.value).toBe('Array-typed role');
  });
});
