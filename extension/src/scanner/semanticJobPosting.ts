import {
  JOB_POSTING_LIMITS,
  JobPostingSchema,
  type Compensation,
  type ExtractionSource,
  type JobPosting,
  type Requirement,
} from '../types/jobPosting';

interface SemanticField<T> {
  value: T;
  evidence: string;
}

type SemanticScalarField<T> =
  | {
      value: T;
      evidence: [string];
      conflicted: false;
    }
  | {
      value: null;
      evidence: string[];
      conflicted: true;
    };

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

function singleValue(
  elements: Element[],
  reader: (element: Element) => string | null = propertyValue,
): SemanticScalarField<string> | null {
  const values = elements
    .map((element) => ({ element, value: reader(element) }))
    .filter(
      (entry): entry is { element: Element; value: string } =>
        entry.value !== null,
    );
  const uniqueValues = [...new Set(values.map(({ value }) => value))];
  if (uniqueValues.length === 0) {
    return null;
  }
  if (uniqueValues.length > 1) {
    return { value: null, evidence: uniqueValues, conflicted: true };
  }
  const value = uniqueValues[0];
  return value ? { value, evidence: [value], conflicted: false } : null;
}

function field(
  root: Element,
  property: string,
): SemanticScalarField<string> | null {
  return singleValue(directPropertyElements(root, property));
}

function excerpt(value: string): string {
  return value.slice(0, JOB_POSTING_LIMITS.provenanceExcerpt);
}

function sourced<T>(
  value: T,
  fieldName: string,
  evidence: string,
  source: ExtractionSource = 'semantic',
) {
  return {
    value,
    score: 0.9,
    confidence: 'high' as const,
    conflicted: false,
    provenance: [
      {
        source,
        locator: `semantic[0] ${fieldName}`.slice(
          0,
          JOB_POSTING_LIMITS.provenanceLocator,
        ),
        excerpt: excerpt(evidence),
      },
    ],
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

function normalizedScalar<T>(
  field: SemanticScalarField<T> | null,
  fieldName: string,
  source: ExtractionSource = 'semantic',
) {
  if (!field) {
    return unknownValue();
  }
  if (!field.conflicted) {
    return sourced(field.value, fieldName, field.evidence[0], source);
  }

  return {
    value: null,
    score: 0,
    confidence: 'low' as const,
    conflicted: true,
    provenance: field.evidence
      .slice(0, JOB_POSTING_LIMITS.provenancePerValue)
      .map((evidence, index) => ({
        source,
        locator: `semantic[0] ${fieldName}[${index}]`.slice(
          0,
          JOB_POSTING_LIMITS.provenanceLocator,
        ),
        excerpt: excerpt(evidence),
      })),
  };
}

function nestedName(element: Element): string | null {
  if (!element.hasAttribute('itemscope')) {
    return propertyValue(element);
  }
  return singleValue(directPropertyElements(element, 'name'))?.value ?? null;
}

function company(root: Element): SemanticScalarField<string> | null {
  return singleValue(
    directPropertyElements(root, 'hiringOrganization'),
    nestedName,
  );
}

function addressCountry(element: Element): string | null {
  if (!element.hasAttribute('itemscope')) {
    return propertyValue(element);
  }
  return singleValue(directPropertyElements(element, 'name'))?.value ?? null;
}

function addressText(element: Element): string | null {
  if (!element.hasAttribute('itemscope')) {
    return propertyValue(element);
  }

  const parts = [
    field(element, 'streetAddress')?.value ?? null,
    field(element, 'addressLocality')?.value ?? null,
    field(element, 'addressRegion')?.value ?? null,
    field(element, 'postalCode')?.value ?? null,
    singleValue(
      directPropertyElements(element, 'addressCountry'),
      addressCountry,
    )?.value ?? null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : null;
}

function locationText(element: Element): string | null {
  if (!element.hasAttribute('itemscope')) {
    return propertyValue(element);
  }

  const address = singleValue(
    directPropertyElements(element, 'address'),
    addressText,
  )?.value;
  return address ?? field(element, 'name')?.value ?? null;
}

function locations(root: Element): SemanticField<string[]> | null {
  const values = directPropertyElements(root, 'jobLocation')
    .map(locationText)
    .filter((value): value is string => value !== null);
  const unique = [...new Set(values)];
  return unique.length > 0
    ? { value: unique, evidence: unique.join(' | ') }
    : null;
}

function numericValue(value: string | null | undefined): number | null {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compensationInterval(
  value: string | null | undefined,
): Compensation['interval'] {
  const normalized = cleanString(value)?.toLowerCase();
  const intervals = ['hour', 'day', 'week', 'month', 'year'] as const;
  return (
    intervals.find(
      (interval) => normalized === interval || normalized === `${interval}s`,
    ) ?? null
  );
}

function compensation(root: Element): SemanticField<Compensation> | null {
  const salaryElements = directPropertyElements(root, 'baseSalary');
  if (salaryElements.length !== 1) {
    return null;
  }
  const salaryElement = salaryElements[0];
  if (!salaryElement) {
    return null;
  }

  if (!salaryElement.hasAttribute('itemscope')) {
    const rawText = propertyValue(salaryElement);
    return rawText
      ? {
          value: {
            rawText,
            minimum: null,
            maximum: null,
            currency: null,
            interval: null,
          },
          evidence: rawText,
        }
      : null;
  }

  const currency = field(salaryElement, 'currency')?.value ?? null;
  const valueElement = directPropertyElements(salaryElement, 'value')[0];
  const quantityScope =
    valueElement?.hasAttribute('itemscope') === true ? valueElement : null;
  const single = numericValue(
    quantityScope
      ? field(quantityScope, 'value')?.value
      : valueElement
        ? propertyValue(valueElement)
        : null,
  );
  const minimum =
    numericValue(
      quantityScope ? field(quantityScope, 'minValue')?.value : null,
    ) ?? single;
  const maximum =
    numericValue(
      quantityScope ? field(quantityScope, 'maxValue')?.value : null,
    ) ?? single;
  const interval = compensationInterval(
    quantityScope
      ? field(quantityScope, 'unitText')?.value
      : field(salaryElement, 'unitText')?.value,
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
  return {
    value: { rawText, minimum, maximum, currency, interval },
    evidence: rawText,
  };
}

function identifier(root: Element): SemanticScalarField<string> | null {
  return singleValue(directPropertyElements(root, 'identifier'), (element) => {
    if (!element.hasAttribute('itemscope')) {
      return propertyValue(element);
    }
    return field(element, 'value')?.value ?? null;
  });
}

function normalizedHttpUrl(
  value: string | null,
  baseUrl: string,
): string | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value, baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function canonicalUrl(
  root: Element,
  document: Document,
  currentUrl: string,
): (SemanticScalarField<string> & { source: ExtractionSource }) | null {
  const semanticUrl = field(root, 'url');
  if (semanticUrl?.conflicted) {
    return { ...semanticUrl, source: 'semantic' };
  }
  const normalizedSemanticUrl = normalizedHttpUrl(
    semanticUrl?.value ?? null,
    currentUrl,
  );
  if (normalizedSemanticUrl) {
    return {
      value: normalizedSemanticUrl,
      evidence: [semanticUrl?.evidence[0] ?? normalizedSemanticUrl],
      conflicted: false,
      source: 'semantic',
    };
  }

  const canonicalHref = document
    .querySelector<HTMLLinkElement>('link[rel~="canonical"][href]')
    ?.getAttribute('href');
  const normalizedCanonical = normalizedHttpUrl(
    canonicalHref ?? null,
    currentUrl,
  );
  return normalizedCanonical
    ? {
        value: normalizedCanonical,
        evidence: [canonicalHref ?? normalizedCanonical],
        conflicted: false,
        source: 'url',
      }
    : null;
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
  const title = field(root, 'title');
  const normalizedCompany = company(root);
  const normalizedLocations = locations(root);
  const normalizedDescription = field(root, 'description');
  const normalizedIdentifier = identifier(root);
  const normalizedCompensation = compensation(root);
  const normalizedCanonicalUrl = canonicalUrl(root, document, currentUrl);

  const result = JobPostingSchema.safeParse({
    schemaVersion: 1,
    title: normalizedScalar(title, '[itemprop~="title"]'),
    company: normalizedScalar(
      normalizedCompany,
      '[itemprop~="hiringOrganization"]',
    ),
    location: normalizedLocations
      ? sourced(
          normalizedLocations.value,
          '[itemprop~="jobLocation"]',
          normalizedLocations.evidence,
        )
      : unknownValue(),
    compensation: normalizedCompensation
      ? sourced(
          normalizedCompensation.value,
          '[itemprop~="baseSalary"]',
          normalizedCompensation.evidence,
        )
      : unknownValue(),
    description: normalizedScalar(
      normalizedDescription,
      '[itemprop~="description"]',
    ),
    requirements: requirements(root),
    currentUrl,
    canonicalUrl: normalizedScalar(
      normalizedCanonicalUrl,
      normalizedCanonicalUrl?.source === 'semantic'
        ? '[itemprop~="url"]'
        : 'link[rel~="canonical"]',
      normalizedCanonicalUrl?.source,
    ),
    requisitionId: normalizedScalar(
      normalizedIdentifier,
      '[itemprop~="identifier"]',
    ),
    extractedAt,
  });

  return result.success ? result.data : null;
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
