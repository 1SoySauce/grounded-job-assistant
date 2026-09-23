import {
  JOB_POSTING_LIMITS,
  JobPostingSchema,
  type Compensation,
  type JobPosting,
  type Provenance,
} from '../types/jobPosting';

export const JSON_LD_LIMITS = {
  scriptTags: 20,
  totalTextCharacters: 1_000_000,
  traversalDepth: 20,
  traversedNodes: 10_000,
  candidateObjects: 100,
} as const;

interface JsonLdCandidate {
  value: Record<string, unknown>;
  scriptIndex: number;
  path: string;
}

interface JsonLdDiscovery {
  candidates: JsonLdCandidate[];
  complete: boolean;
}

export interface JsonLdJobPostingResult {
  hasJobPostingStructuredData: boolean;
  jobPosting: JobPosting | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const JOB_POSTING_TYPES = new Set([
  'JobPosting',
  'https://schema.org/JobPosting',
  'http://schema.org/JobPosting',
]);

function isJobPostingType(value: unknown): boolean {
  return typeof value === 'string' && JOB_POSTING_TYPES.has(value);
}

function hasJobPostingType(value: Record<string, unknown>): boolean {
  const type = value['@type'];
  return (
    isJobPostingType(type) ||
    (Array.isArray(type) && type.some(isJobPostingType))
  );
}

function appendPath(path: string, key: string | number): string {
  const segment =
    typeof key === 'number'
      ? `[${key}]`
      : /^[A-Za-z_$][\w$]*$/.test(key)
        ? `.${key}`
        : `[${JSON.stringify(key)}]`;
  return `${path}${segment}`.slice(0, JOB_POSTING_LIMITS.provenanceLocator);
}

function discoverJsonLdCandidates(document: Document): JsonLdDiscovery {
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]',
  );
  const candidates: JsonLdCandidate[] = [];
  let complete = scripts.length <= JSON_LD_LIMITS.scriptTags;
  let totalTextCharacters = 0;
  let traversedNodes = 0;

  const scriptCount = Math.min(scripts.length, JSON_LD_LIMITS.scriptTags);
  for (let scriptIndex = 0; scriptIndex < scriptCount; scriptIndex += 1) {
    const script = scripts.item(scriptIndex);
    const text = script.textContent ?? '';
    totalTextCharacters += text.length;
    if (totalTextCharacters > JSON_LD_LIMITS.totalTextCharacters) {
      complete = false;
      break;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }

    const pending: Array<{ value: unknown; depth: number; path: string }> = [
      { value: parsed, depth: 0, path: '$' },
    ];

    while (pending.length > 0) {
      const next = pending.pop();
      if (!next) {
        break;
      }
      if (traversedNodes >= JSON_LD_LIMITS.traversedNodes) {
        complete = false;
        pending.length = 0;
        break;
      }
      traversedNodes += 1;

      if (isRecord(next.value) && hasJobPostingType(next.value)) {
        if (candidates.length >= JSON_LD_LIMITS.candidateObjects) {
          complete = false;
          pending.length = 0;
          break;
        }
        candidates.push({
          value: next.value,
          scriptIndex,
          path: next.path,
        });
      }

      const arrayValue = Array.isArray(next.value) ? next.value : null;
      const objectValue = isRecord(next.value) ? next.value : null;
      const objectKeys = objectValue ? Object.keys(objectValue) : [];
      const childCount = arrayValue?.length ?? objectKeys.length;
      if (childCount === 0) {
        continue;
      }
      if (next.depth >= JSON_LD_LIMITS.traversalDepth) {
        complete = false;
        pending.length = 0;
        break;
      }
      const remainingNodes =
        JSON_LD_LIMITS.traversedNodes - traversedNodes - pending.length;
      if (childCount > remainingNodes) {
        complete = false;
        pending.length = 0;
        break;
      }

      for (let index = childCount - 1; index >= 0; index -= 1) {
        const key = arrayValue ? index : objectKeys[index];
        if (key !== undefined) {
          pending.push({
            value: arrayValue ? arrayValue[index] : objectValue?.[key],
            depth: next.depth + 1,
            path: appendPath(next.path, key),
          });
        }
      }
    }

    if (!complete) {
      break;
    }
  }

  return { candidates, complete };
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function excerpt(value: string): string {
  return value.slice(0, JOB_POSTING_LIMITS.provenanceExcerpt);
}

function locator(candidate: JsonLdCandidate, field: string): string {
  return `json-ld[${candidate.scriptIndex}]${candidate.path}.${field}`.slice(
    0,
    JOB_POSTING_LIMITS.provenanceLocator,
  );
}

function provenance(
  candidate: JsonLdCandidate,
  field: string,
  value: string,
): Provenance[] {
  return [
    {
      source: 'json_ld',
      locator: locator(candidate, field),
      excerpt: excerpt(value),
    },
  ];
}

function sourced<T>(
  value: T,
  candidate: JsonLdCandidate,
  field: string,
  evidence: string,
) {
  return {
    value,
    score: 0.95,
    confidence: 'high' as const,
    conflicted: false,
    provenance: provenance(candidate, field, evidence),
  };
}

function unknownValue() {
  return {
    value: null,
    score: 0,
    confidence: 'low' as const,
    conflicted: false,
    provenance: [],
  };
}

function inertText(document: Document, value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const template = document.createElement('template');
  template.innerHTML = value;
  template.content
    .querySelectorAll(
      'script, style, noscript, iframe, object, embed, template',
    )
    .forEach((element) => element.remove());
  template.content
    .querySelectorAll(
      'br, p, div, li, section, article, header, footer, h1, h2, h3, h4, h5, h6',
    )
    .forEach((element) => element.append(' '));

  return cleanString(template.content.textContent);
}

function addressCountry(value: unknown): string | null {
  if (isRecord(value)) {
    return cleanString(value.name);
  }
  return cleanString(value);
}

function locationText(value: unknown): string | null {
  if (typeof value === 'string') {
    return cleanString(value);
  }
  if (!isRecord(value)) {
    return null;
  }

  const address = value.address;
  if (typeof address === 'string') {
    return cleanString(address);
  }
  if (isRecord(address)) {
    const parts = [
      cleanString(address.streetAddress),
      cleanString(address.addressLocality),
      cleanString(address.addressRegion),
      cleanString(address.postalCode),
      addressCountry(address.addressCountry),
    ].filter((part): part is string => part !== null);
    if (parts.length > 0) {
      return parts.join(', ');
    }
  }

  return cleanString(value.name);
}

function locations(value: unknown): string[] | null {
  const rawLocations = Array.isArray(value) ? value : [value];
  const normalized = rawLocations
    .map(locationText)
    .filter((location): location is string => location !== null);
  const unique = [...new Set(normalized)];
  return unique.length > 0 ? unique : null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    return Number(value);
  }
  return null;
}

function compensationInterval(value: unknown): Compensation['interval'] {
  const normalized = cleanString(value)?.toLowerCase();
  if (!normalized) {
    return null;
  }
  const intervals = ['hour', 'day', 'week', 'month', 'year'] as const;
  return (
    intervals.find(
      (interval) => normalized === interval || normalized === `${interval}s`,
    ) ?? null
  );
}

function compensation(value: unknown): Compensation | null {
  if (typeof value === 'string') {
    const rawText = cleanString(value);
    return rawText
      ? {
          rawText,
          minimum: null,
          maximum: null,
          currency: null,
          interval: null,
        }
      : null;
  }

  const directAmount = numericValue(value);
  if (directAmount !== null) {
    return {
      rawText: String(value),
      minimum: directAmount,
      maximum: directAmount,
      currency: null,
      interval: null,
    };
  }
  if (!isRecord(value)) {
    return null;
  }

  const currency = cleanString(value.currency);
  const quantity = value.value;
  if (typeof quantity === 'string' && numericValue(quantity) === null) {
    const rawText = cleanString(quantity);
    return rawText
      ? {
          rawText,
          minimum: null,
          maximum: null,
          currency,
          interval: null,
        }
      : null;
  }

  const quantityRecord = isRecord(quantity) ? quantity : null;
  const single = numericValue(quantityRecord?.value ?? quantity);
  const minimum = numericValue(quantityRecord?.minValue) ?? single;
  const maximum = numericValue(quantityRecord?.maxValue) ?? single;
  const interval = compensationInterval(
    quantityRecord?.unitText ?? value.unitText,
  );

  if (minimum === null && maximum === null) {
    return null;
  }

  const amount =
    minimum !== null && maximum !== null && minimum !== maximum
      ? `${minimum}–${maximum}`
      : String(minimum ?? maximum);
  const rawText = [amount, currency, interval ? `per ${interval}` : null]
    .filter((part): part is string => part !== null)
    .join(' ');

  return { rawText, minimum, maximum, currency, interval };
}

function identifier(value: unknown): string | null {
  const identifierValue = isRecord(value) ? value.value : value;
  if (typeof identifierValue === 'number' && Number.isFinite(identifierValue)) {
    return String(identifierValue);
  }
  return cleanString(identifierValue);
}

function normalizedHttpUrl(value: unknown, baseUrl: string): string | null {
  const rawUrl = cleanString(value);
  if (!rawUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl, baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function documentCanonicalUrl(document: Document, currentUrl: string) {
  const href = document
    .querySelector<HTMLLinkElement>('link[rel~="canonical"][href]')
    ?.getAttribute('href');
  return normalizedHttpUrl(href, currentUrl);
}

function selectCandidate(
  candidates: JsonLdCandidate[],
  document: Document,
  currentUrl: string,
): JsonLdCandidate | null {
  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }
  if (candidates.length === 0) {
    return null;
  }

  const normalizedCurrentUrl = normalizedHttpUrl(currentUrl, currentUrl);
  const canonicalUrl = documentCanonicalUrl(document, currentUrl);
  const scored = candidates.map((candidate) => {
    const candidateUrl = normalizedHttpUrl(candidate.value.url, currentUrl);
    const score =
      (candidateUrl !== null && candidateUrl === normalizedCurrentUrl ? 1 : 0) +
      (candidateUrl !== null && candidateUrl === canonicalUrl ? 2 : 0);
    return { candidate, score };
  });
  const bestScore = Math.max(...scored.map(({ score }) => score));
  if (bestScore === 0) {
    return null;
  }
  const best = scored.filter(({ score }) => score === bestScore);
  return best.length === 1 ? (best[0]?.candidate ?? null) : null;
}

function normalizeCandidate(
  candidate: JsonLdCandidate,
  document: Document,
  currentUrl: string,
  extractedAt: string,
): JobPosting | null {
  const value = candidate.value;
  const title = cleanString(value.title);
  const company = isRecord(value.hiringOrganization)
    ? cleanString(value.hiringOrganization.name)
    : null;
  const normalizedLocations = locations(value.jobLocation);
  const normalizedCompensation = compensation(value.baseSalary);
  const description = inertText(document, value.description);
  const requisitionId = identifier(value.identifier);
  const canonicalUrl = normalizedHttpUrl(value.url, currentUrl);

  const result = JobPostingSchema.safeParse({
    schemaVersion: 1,
    title: title ? sourced(title, candidate, 'title', title) : unknownValue(),
    company: company
      ? sourced(company, candidate, 'hiringOrganization.name', company)
      : unknownValue(),
    location: normalizedLocations
      ? sourced(
          normalizedLocations,
          candidate,
          'jobLocation',
          normalizedLocations.join(' | '),
        )
      : unknownValue(),
    compensation: normalizedCompensation
      ? sourced(
          normalizedCompensation,
          candidate,
          'baseSalary',
          normalizedCompensation.rawText,
        )
      : unknownValue(),
    description: description
      ? sourced(description, candidate, 'description', description)
      : unknownValue(),
    requirements: { required: [], preferred: [], unknown: [] },
    currentUrl,
    canonicalUrl: canonicalUrl
      ? sourced(canonicalUrl, candidate, 'url', canonicalUrl)
      : unknownValue(),
    requisitionId: requisitionId
      ? sourced(requisitionId, candidate, 'identifier', requisitionId)
      : unknownValue(),
    extractedAt,
  });

  return result.success ? result.data : null;
}

export function extractJsonLdJobPosting(
  document: Document,
  currentUrl: string,
  extractedAt = new Date().toISOString(),
): JsonLdJobPostingResult {
  const discovery = discoverJsonLdCandidates(document);
  const hasJobPostingStructuredData = discovery.candidates.length > 0;
  if (!discovery.complete) {
    return { hasJobPostingStructuredData, jobPosting: null };
  }

  const selected = selectCandidate(discovery.candidates, document, currentUrl);
  return {
    hasJobPostingStructuredData,
    jobPosting: selected
      ? normalizeCandidate(selected, document, currentUrl, extractedAt)
      : null,
  };
}
