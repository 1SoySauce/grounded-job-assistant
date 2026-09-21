import type { AtsProvider, PageScanResult, PageType } from '../types/scanner';
import { extractJsonLdJobPosting } from './jsonLdJobPosting';
import { extractSemanticJobPosting } from './semanticJobPosting';

export interface PageSignals {
  url: string;
  title: string;
  text: string;
  fieldCount: number;
  formCount: number;
  hasJobPostingStructuredData: boolean;
}

const ATS_HOST_PATTERNS: ReadonlyArray<readonly [RegExp, AtsProvider]> = [
  [/boards\.greenhouse\.io|job-boards\.greenhouse\.io/i, 'greenhouse'],
  [/jobs\.lever\.co/i, 'lever'],
  [/jobs\.ashbyhq\.com/i, 'ashby'],
  [/myworkdayjobs\.com/i, 'workday'],
  [/smartrecruiters\.com/i, 'smartrecruiters'],
  [/icims\.com/i, 'icims'],
  [/jobvite\.com/i, 'jobvite'],
  [/taleo\.net/i, 'taleo'],
];

export function detectAtsProvider(url: string): AtsProvider {
  try {
    const hostname = new URL(url).hostname;
    return (
      ATS_HOST_PATTERNS.find(([pattern]) => pattern.test(hostname))?.[1] ??
      'generic'
    );
  } catch {
    return 'generic';
  }
}

function containsJobPostingType(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsJobPostingType);
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const type = record['@type'];

  if (type === 'JobPosting') {
    return true;
  }

  return Object.values(record).some(containsJobPostingType);
}

function hasJobPostingStructuredData(document: Document): boolean {
  return Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  ).some((element) => {
    try {
      const parsed: unknown = JSON.parse(element.textContent ?? 'null');
      return containsJobPostingType(parsed);
    } catch {
      return false;
    }
  });
}

export function classifyPage(signals: PageSignals): PageType {
  const normalizedText = signals.text.toLowerCase();
  const isConfirmation = [
    'thank you for applying',
    'application has been submitted',
    'application was submitted',
    'we received your application',
  ].some((phrase) => normalizedText.includes(phrase));

  if (isConfirmation) {
    return 'application_confirmation';
  }

  const hasApplicationLanguage = [
    'submit application',
    'apply for this job',
    'candidate information',
    'application questions',
  ].some((phrase) => normalizedText.includes(phrase));

  if (
    signals.formCount > 0 &&
    signals.fieldCount >= 2 &&
    hasApplicationLanguage
  ) {
    return 'application_form';
  }

  const hasJobDescriptionSections =
    normalizedText.includes('responsibilities') &&
    (normalizedText.includes('qualifications') ||
      normalizedText.includes('requirements'));

  if (signals.hasJobPostingStructuredData || hasJobDescriptionSections) {
    return 'job_posting';
  }

  return 'unrelated';
}

export function collectPageSignals(
  document: Document,
  url: string,
): PageSignals {
  const rawText = document.body?.innerText || document.body?.textContent || '';

  return {
    url,
    title: document.title.slice(0, 500),
    text: rawText.replace(/\s+/g, ' ').trim().slice(0, 80_000),
    fieldCount: document.querySelectorAll(
      'input, select, textarea, [role="combobox"]',
    ).length,
    formCount: document.forms.length,
    hasJobPostingStructuredData: hasJobPostingStructuredData(document),
  };
}

export function scanPage(document: Document, url: string): PageScanResult {
  const scannedAt = new Date().toISOString();
  const signals = collectPageSignals(document, url);
  const jsonLdJobPosting = extractJsonLdJobPosting(
    document,
    url,
    scannedAt,
  ).jobPosting;
  const jobPosting =
    jsonLdJobPosting ?? extractSemanticJobPosting(document, url, scannedAt);

  return {
    pageType: classifyPage(signals),
    ats: detectAtsProvider(signals.url),
    title: signals.title,
    url: signals.url,
    fieldCount: signals.fieldCount,
    formCount: signals.formCount,
    hasJobPostingStructuredData: signals.hasJobPostingStructuredData,
    jobPosting,
    scannedAt,
  };
}
