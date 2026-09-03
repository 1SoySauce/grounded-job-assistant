import { describe, expect, it } from 'vitest';
import { classifyPage, detectAtsProvider } from '../src/scanner/pageScanner';

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
});
