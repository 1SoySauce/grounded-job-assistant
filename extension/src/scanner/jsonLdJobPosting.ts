import {
  JOB_POSTING_LIMITS,
  type Compensation,
  type JobPosting,
} from '../types/jobPosting';
import {
  collectionObservation,
  conflicted,
  evidence,
  fallbackObservation,
  mapObservation,
  missing,
  resolved,
  scalarObservation,
  type Observation,
} from './structuredObservation';
import {
  compensationObservation,
  intervalValue,
  monetaryCompensation,
  numericValue,
  quantityObservation,
  structuredQuantity,
  type Quantity,
} from './structuredCompensation';
import { normalizeStructuredPosting } from './structuredPosting';
import { documentCanonicalUrl, normalizedHttpUrl } from './structuredUrl';

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

type Reader<T> = (value: unknown, path: string) => Observation<T>;

// Only one array level is supported. Nested arrays and JSON-LD expansion
// constructs are not interpreted as literals.
function observations<T>(
  value: unknown,
  path: string,
  read: Reader<T>,
): Observation<T>[] {
  return Array.isArray(value)
    ? value.map((item, index) => read(item, appendPath(path, index)))
    : [read(value, path)];
}

function scalar<T>(
  value: unknown,
  path: string,
  read: Reader<T>,
): Observation<T> {
  return scalarObservation(observations(value, path, read));
}

function literal<T>(
  value: unknown,
  path: string,
  normalize: (value: unknown) => T | null,
): Observation<T> {
  const normalized = normalize(value);
  return normalized === null
    ? missing()
    : resolved(normalized, [evidence('json_ld', path, String(value))]);
}

function text(value: unknown, path: string): Observation<string> {
  return scalar(value, path, (item, itemPath) =>
    literal(item, itemPath, cleanString),
  );
}

function company(value: unknown, path: string): Observation<string> {
  return scalar(value, path, (item, itemPath) =>
    isRecord(item) ? text(item.name, appendPath(itemPath, 'name')) : missing(),
  );
}

function addressCountry(value: unknown, path: string): Observation<string> {
  return scalar(value, path, (item, itemPath) =>
    isRecord(item)
      ? text(item.name, appendPath(itemPath, 'name'))
      : literal(item, itemPath, cleanString),
  );
}

function addressText(value: unknown, path: string): Observation<string> {
  return scalar(value, path, (item, itemPath) => {
    if (!isRecord(item)) return literal(item, itemPath, cleanString);
    return mapObservation(
      collectionObservation([
        text(item.streetAddress, appendPath(itemPath, 'streetAddress')),
        text(item.addressLocality, appendPath(itemPath, 'addressLocality')),
        text(item.addressRegion, appendPath(itemPath, 'addressRegion')),
        text(item.postalCode, appendPath(itemPath, 'postalCode')),
        addressCountry(
          item.addressCountry,
          appendPath(itemPath, 'addressCountry'),
        ),
      ]),
      (parts) => parts.join(', '),
    );
  });
}

function locationText(value: unknown, path: string): Observation<string> {
  if (!isRecord(value)) return literal(value, path, cleanString);
  return fallbackObservation(
    addressText(value.address, appendPath(path, 'address')),
    () => text(value.name, appendPath(path, 'name')),
  );
}

function locations(value: unknown, path: string): Observation<string[]> {
  return collectionObservation(
    observations(value, path, locationText),
    (value) => value,
  );
}

function number(value: unknown, path: string): Observation<number> {
  return scalar(value, path, (item, itemPath) =>
    literal(item, itemPath, numericValue),
  );
}

function interval(
  value: unknown,
  path: string,
): Observation<NonNullable<Compensation['interval']>> {
  return scalar(value, path, (item, itemPath) =>
    literal(item, itemPath, intervalValue),
  );
}

function quantity(value: unknown, path: string): Observation<Quantity> {
  return quantityObservation(
    observations(value, path, (item, itemPath) => {
      if (!isRecord(item)) {
        const numeric = literal(item, itemPath, numericValue);
        if (numeric.status === 'resolved') {
          return structuredQuantity(numeric, missing(), missing(), missing());
        }
        return mapObservation(
          literal(item, itemPath, cleanString),
          (rawText) => ({
            rawText,
            minimum: null,
            maximum: null,
            interval: null,
          }),
        );
      }
      return structuredQuantity(
        number(item.value, appendPath(itemPath, 'value')),
        number(item.minValue, appendPath(itemPath, 'minValue')),
        number(item.maxValue, appendPath(itemPath, 'maxValue')),
        interval(item.unitText, appendPath(itemPath, 'unitText')),
      );
    }),
  );
}

function compensation(value: unknown, path: string): Observation<Compensation> {
  return compensationObservation(
    observations(value, path, (item, itemPath) => {
      if (typeof item === 'string') {
        return mapObservation(
          literal(item, itemPath, cleanString),
          (rawText) => ({
            rawText,
            minimum: null,
            maximum: null,
            currency: null,
            interval: null,
          }),
        );
      }
      if (!isRecord(item)) {
        const amount = literal(item, itemPath, numericValue);
        return monetaryCompensation(
          structuredQuantity(amount, missing(), missing(), missing()),
          missing(),
          missing(),
        );
      }
      return monetaryCompensation(
        quantity(item.value, appendPath(itemPath, 'value')),
        scalar(
          item.currency,
          appendPath(itemPath, 'currency'),
          (raw, rawPath) =>
            literal(
              raw,
              rawPath,
              (currency) => cleanString(currency)?.toUpperCase() ?? null,
            ),
        ),
        interval(item.unitText, appendPath(itemPath, 'unitText')),
      );
    }),
  );
}

function identifierLiteral(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : cleanString(value);
}

function identifier(value: unknown, path: string): Observation<string> {
  return scalar(value, path, (item, itemPath) =>
    isRecord(item)
      ? scalar(item.value, appendPath(itemPath, 'value'), (raw, rawPath) =>
          literal(raw, rawPath, identifierLiteral),
        )
      : literal(item, itemPath, identifierLiteral),
  );
}

function candidateUrlObservations(
  candidate: JsonLdCandidate,
  currentUrl: string,
): Observation<string>[] {
  return observations(
    candidate.value.url,
    candidatePath(candidate, 'url'),
    (value, path) =>
      literal(value, path, (raw) => normalizedHttpUrl(raw, currentUrl)),
  );
}

function candidateUrl(
  candidate: JsonLdCandidate,
  currentUrl: string,
): Observation<string> {
  return scalarObservation(candidateUrlObservations(candidate, currentUrl));
}

function candidatePath(candidate: JsonLdCandidate, field: string): string {
  return appendPath(
    `json-ld[${candidate.scriptIndex}]${candidate.path}`,
    field,
  );
}

function selectCandidate(
  candidates: JsonLdCandidate[],
  pageCanonical: Observation<string>,
  currentUrl: string,
): JsonLdCandidate | null {
  if (candidates.length === 1) return candidates[0] ?? null;
  if (candidates.length === 0) return null;

  const normalizedCurrentUrl = normalizedHttpUrl(currentUrl, currentUrl);
  const canonical =
    pageCanonical.status === 'resolved' ? pageCanonical.value : null;
  const scored = candidates.map((candidate) => {
    const url = candidateUrl(candidate, currentUrl);
    const value = url.status === 'resolved' ? url.value : null;
    const score =
      (value !== null && value === normalizedCurrentUrl ? 1 : 0) +
      (value !== null && value === canonical ? 2 : 0);
    return { candidate, score };
  });
  const bestScore = Math.max(...scored.map(({ score }) => score));
  if (bestScore === 0) return null;
  const best = scored.filter(({ score }) => score === bestScore);
  return best.length === 1 ? (best[0]?.candidate ?? null) : null;
}

function normalizeCandidate(
  candidate: JsonLdCandidate,
  document: Document,
  pageCanonical: Observation<string>,
  currentUrl: string,
  extractedAt: string,
): JobPosting | null {
  const value = candidate.value;
  const path = (field: string) => candidatePath(candidate, field);
  return normalizeStructuredPosting(
    {
      title: text(value.title, path('title')),
      company: company(value.hiringOrganization, path('hiringOrganization')),
      location: locations(value.jobLocation, path('jobLocation')),
      compensation: compensation(value.baseSalary, path('baseSalary')),
      description: scalar(
        value.description,
        path('description'),
        (raw, rawPath) =>
          literal(raw, rawPath, (description) =>
            inertText(document, description),
          ),
      ),
      requisitionId: identifier(value.identifier, path('identifier')),
      canonicalUrl: fallbackObservation(
        candidateUrl(candidate, currentUrl),
        () => pageCanonical,
      ),
    },
    { required: [], preferred: [], unknown: [] },
    currentUrl,
    extractedAt,
    0.95,
  );
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

  // Selection and output share the same conflict-aware page metadata.
  const pageCanonical = documentCanonicalUrl(document, currentUrl);
  const selected = selectCandidate(
    discovery.candidates,
    pageCanonical,
    currentUrl,
  );
  const jobPosting = selected
    ? normalizeCandidate(
        selected,
        document,
        pageCanonical,
        currentUrl,
        extractedAt,
      )
    : null;
  if (jobPosting) return { hasJobPostingStructuredData, jobPosting };

  // Preserve only selection-relevant URL conflicts when no valid posting remains,
  // including when the remaining URL match fails identity validation.
  const normalizedCurrentUrl = normalizedHttpUrl(currentUrl, currentUrl);
  const canonical =
    pageCanonical.status === 'resolved' ? pageCanonical.value : null;
  const conflicts = discovery.candidates.flatMap((candidate) => {
    const urls = candidateUrlObservations(candidate, currentUrl);
    const url = scalarObservation(urls);
    const relevant = urls.some(
      (item) =>
        item.status === 'resolved' &&
        (item.value === normalizedCurrentUrl || item.value === canonical),
    );
    return url.status === 'conflicted' && relevant ? [url.provenance] : [];
  });
  if (conflicts.length > 0) {
    return {
      hasJobPostingStructuredData,
      // No candidate's fields are safe to select here. Keep the URL witnesses
      // in a schema-valid posting so ambiguity cannot trigger weaker fallback.
      jobPosting: normalizeStructuredPosting(
        {
          title: missing(),
          company: missing(),
          location: missing(),
          compensation: missing(),
          description: missing(),
          requisitionId: missing(),
          canonicalUrl: conflicted(conflicts),
        },
        { required: [], preferred: [], unknown: [] },
        currentUrl,
        extractedAt,
        0.95,
      ),
    };
  }
  return { hasJobPostingStructuredData, jobPosting: null };
}
