import {
  JOB_POSTING_LIMITS,
  type Compensation,
  type JobPosting,
  type Requirement,
} from '../types/jobPosting';
import {
  collectionObservation,
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

const JOB_POSTING_ITEM_TYPES = new Set([
  'https://schema.org/JobPosting',
  'http://schema.org/JobPosting',
]);

function cleanString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function itemTypes(element: Element): string[] {
  return (element.getAttribute('itemtype') ?? '').split(/\s+/).filter(Boolean);
}

function itemProps(element: Element): string[] {
  return (element.getAttribute('itemprop') ?? '').split(/\s+/).filter(Boolean);
}

function isJobPostingRoot(element: Element): element is HTMLElement {
  return itemTypes(element).some((type) => JOB_POSTING_ITEM_TYPES.has(type));
}

function directPropertyElements(scope: Element, property: string): Element[] {
  return Array.from(scope.querySelectorAll<Element>('[itemprop]')).filter(
    (element) => {
      if (!itemProps(element).includes(property)) {
        return false;
      }

      let ancestor = element.parentElement;
      while (ancestor && ancestor !== scope) {
        if (ancestor.hasAttribute('itemscope')) {
          return false;
        }
        ancestor = ancestor.parentElement;
      }
      return ancestor === scope;
    },
  );
}

function readableText(element: Element): string | null {
  const clone = element.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      'script, style, noscript, template, iframe, object, embed',
    )
    .forEach((child) => child.remove());
  clone
    .querySelectorAll(
      'br, p, div, li, section, article, header, footer, h1, h2, h3, h4, h5, h6',
    )
    .forEach((child) => child.append(' '));
  return cleanString(clone.textContent);
}

function propertyValue(element: Element): string | null {
  const content = cleanString(element.getAttribute('content'));
  if (content) {
    return content;
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'meta') {
    return null;
  }
  if (tagName === 'link' || tagName === 'a') {
    return cleanString(element.getAttribute('href'));
  }
  if (tagName === 'data' || tagName === 'meter') {
    return cleanString(element.getAttribute('value'));
  }
  if (tagName === 'time') {
    return (
      cleanString(element.getAttribute('datetime')) ?? readableText(element)
    );
  }
  return readableText(element);
}

function semanticLocator(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && !isJobPostingRoot(current)) {
    const property = itemProps(current)[0];
    if (property) {
      const index = current.parentElement
        ? Array.from(current.parentElement.children).indexOf(current)
        : 0;
      segments.unshift(`[itemprop~="${property}"][${index}]`);
    }
    current = current.parentElement;
  }
  return `semantic[0] ${segments.join(' ')}`;
}

function readValue<T>(
  element: Element,
  normalize: (value: string) => T | null,
): Observation<T> {
  const raw = propertyValue(element);
  if (raw === null) return missing();
  const value = normalize(raw);
  return value === null
    ? missing()
    : resolved(value, [evidence('semantic', semanticLocator(element), raw)]);
}

function textValue(element: Element): Observation<string> {
  return readValue(element, cleanString);
}

function scalarProperty<T>(
  root: Element,
  property: string,
  reader: (element: Element) => Observation<T>,
): Observation<T> {
  return scalarObservation(directPropertyElements(root, property).map(reader));
}

function field(root: Element, property: string): Observation<string> {
  return scalarProperty(root, property, textValue);
}

function excerpt(value: string): string {
  return value.slice(0, JOB_POSTING_LIMITS.provenanceExcerpt);
}

function nestedName(element: Element): Observation<string> {
  return element.hasAttribute('itemscope')
    ? field(element, 'name')
    : textValue(element);
}

function company(root: Element): Observation<string> {
  return scalarProperty(root, 'hiringOrganization', nestedName);
}

function addressText(element: Element): Observation<string> {
  if (!element.hasAttribute('itemscope')) return textValue(element);
  return mapObservation(
    collectionObservation([
      field(element, 'streetAddress'),
      field(element, 'addressLocality'),
      field(element, 'addressRegion'),
      field(element, 'postalCode'),
      scalarProperty(element, 'addressCountry', nestedName),
    ]),
    (parts) => parts.join(', '),
  );
}

function locationText(element: Element): Observation<string> {
  if (!element.hasAttribute('itemscope')) return textValue(element);
  return fallbackObservation(
    scalarProperty(element, 'address', addressText),
    () => field(element, 'name'),
  );
}

function locations(root: Element): Observation<string[]> {
  return collectionObservation(
    directPropertyElements(root, 'jobLocation').map(locationText),
    (value) => value,
  );
}

function quantity(element: Element): Observation<Quantity> {
  if (!element.hasAttribute('itemscope')) {
    return structuredQuantity(
      readValue(element, numericValue),
      missing(),
      missing(),
      missing(),
    );
  }
  return structuredQuantity(
    scalarProperty(element, 'value', (child) => readValue(child, numericValue)),
    scalarProperty(element, 'minValue', (child) =>
      readValue(child, numericValue),
    ),
    scalarProperty(element, 'maxValue', (child) =>
      readValue(child, numericValue),
    ),
    scalarProperty(element, 'unitText', (child) =>
      readValue(child, intervalValue),
    ),
  );
}

function compensation(root: Element): Observation<Compensation> {
  return compensationObservation(
    directPropertyElements(root, 'baseSalary').map((element) => {
      if (!element.hasAttribute('itemscope')) {
        return mapObservation(textValue(element), (rawText) => ({
          rawText,
          minimum: null,
          maximum: null,
          currency: null,
          interval: null,
        }));
      }
      return monetaryCompensation(
        quantityObservation(
          directPropertyElements(element, 'value').map(quantity),
        ),
        scalarProperty(element, 'currency', (child) =>
          readValue(child, (text) => text.toUpperCase()),
        ),
        scalarProperty(element, 'unitText', (child) =>
          readValue(child, intervalValue),
        ),
      );
    }),
  );
}

function identifier(root: Element): Observation<string> {
  return scalarProperty(root, 'identifier', (element) =>
    element.hasAttribute('itemscope')
      ? field(element, 'value')
      : textValue(element),
  );
}

function canonicalUrl(
  root: Element,
  document: Document,
  currentUrl: string,
): Observation<string> {
  return fallbackObservation(
    scalarProperty(root, 'url', (element) =>
      readValue(element, (value) => normalizedHttpUrl(value, currentUrl)),
    ),
    () => documentCanonicalUrl(document, currentUrl),
  );
}

const REQUIREMENT_HEADINGS: Readonly<
  Record<Requirement['classification'], ReadonlySet<string>>
> = {
  required: new Set([
    'required qualifications',
    'minimum qualifications',
    'requirements',
  ]),
  preferred: new Set(['preferred qualifications', 'preferred requirements']),
  unknown: new Set(['qualifications']),
};

function requirementClassification(
  heading: string,
): Requirement['classification'] | null {
  const normalized = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const classifications = ['required', 'preferred', 'unknown'] as const;
  return (
    classifications.find((classification) =>
      REQUIREMENT_HEADINGS[classification].has(normalized),
    ) ?? null
  );
}

function sectionHeading(section: Element): string | null {
  const labelledBy = cleanString(section.getAttribute('aria-labelledby'));
  if (labelledBy) {
    const headings = labelledBy
      .split(/\s+/)
      .map((id) => section.ownerDocument.getElementById(id))
      .filter(
        (element): element is HTMLElement =>
          element !== null && section.contains(element),
      )
      .map(readableText)
      .filter((value): value is string => value !== null);
    if (headings.length > 0) {
      return headings.join(' ');
    }
  }

  const heading = section.querySelector(
    ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6',
  );
  return heading ? readableText(heading) : null;
}

function belongsToRoot(element: Element, root: Element): boolean {
  let ancestor = element.parentElement;
  while (ancestor && ancestor !== root) {
    if (ancestor.hasAttribute('itemscope')) {
      return false;
    }
    ancestor = ancestor.parentElement;
  }
  return ancestor === root;
}

function requirements(root: Element): JobPosting['requirements'] {
  const groups: JobPosting['requirements'] = {
    required: [],
    preferred: [],
    unknown: [],
  };
  const sections = Array.from(root.querySelectorAll('section, article')).filter(
    (section) => belongsToRoot(section, root),
  );

  for (const section of sections) {
    const heading = sectionHeading(section);
    const classification = heading ? requirementClassification(heading) : null;
    if (!classification) {
      continue;
    }

    const seen = new Set<string>();
    const entries = Array.from(section.querySelectorAll('li'))
      .filter(
        (entry) =>
          entry.closest('section, article') === section &&
          belongsToRoot(entry, root),
      )
      .map(readableText)
      .filter((text): text is string => text !== null);
    for (const text of entries) {
      if (seen.has(text)) {
        continue;
      }
      seen.add(text);
      groups[classification].push({
        text,
        classification,
        score: 0.9,
        confidence: 'high',
        provenance: [
          {
            source: 'semantic',
            locator: `semantic[0] requirements.${classification}[${groups[classification].length}]`,
            excerpt: excerpt(text),
          },
        ],
      });
    }
  }

  return groups;
}

function normalizeCandidate(
  root: HTMLElement,
  document: Document,
  currentUrl: string,
  extractedAt: string,
): JobPosting | null {
  return normalizeStructuredPosting(
    {
      title: field(root, 'title'),
      company: company(root),
      location: locations(root),
      description: field(root, 'description'),
      requisitionId: identifier(root),
      compensation: compensation(root),
      canonicalUrl: canonicalUrl(root, document, currentUrl),
    },
    requirements(root),
    currentUrl,
    extractedAt,
    0.9,
  );
}

export function extractSemanticJobPosting(
  document: Document,
  currentUrl: string,
  extractedAt = new Date().toISOString(),
): JobPosting | null {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('[itemscope][itemtype]'),
  ).filter(isJobPostingRoot);
  if (candidates.length !== 1) {
    return null;
  }

  const candidate = candidates[0];
  return candidate
    ? normalizeCandidate(candidate, document, currentUrl, extractedAt)
    : null;
}
