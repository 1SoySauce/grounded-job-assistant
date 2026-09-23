import {
  JOB_POSTING_LIMITS,
  JobPostingSchema,
  type Compensation,
  type ExtractionSource,
  type JobPosting,
  type Requirement,
} from '../types/jobPosting';

export const DOM_JOB_POSTING_LIMITS = {
  documentElements: 10_000,
  candidateRegions: 20,
  headingsPerRegion: 100,
  sectionTextCharacters: 50_000,
} as const;

type SectionKind =
  | 'description'
  | 'responsibilities'
  | 'required'
  | 'preferred'
  | 'unknown'
  | 'compensation';

interface EvidenceField<T> {
  value: T;
  evidence: string;
  locator: string;
  source: ExtractionSource;
  element?: Element;
}

interface DomSection {
  kind: SectionKind;
  label: string;
  locator: string;
  source: 'aria' | 'dom_heading';
  content: Element[];
}

interface DomCandidate {
  root: HTMLElement;
  title: EvidenceField<string>;
  sections: DomSection[];
}

const EXCLUDED_SELECTOR =
  'nav, footer, aside, form, [hidden], [aria-hidden="true"], [role="navigation"], [role="complementary"], [role="dialog"]';

const EXCLUDED_CANDIDATE_ROOT_SELECTOR = `header, ${EXCLUDED_SELECTOR}`;

const SECTION_LABELS: Readonly<Record<string, SectionKind>> = {
  'about the role': 'description',
  'about this role': 'description',
  'job description': 'description',
  'role description': 'description',
  description: 'description',
  responsibilities: 'responsibilities',
  'key responsibilities': 'responsibilities',
  duties: 'responsibilities',
  requirements: 'required',
  'required qualifications': 'required',
  'minimum qualifications': 'required',
  'preferred qualifications': 'preferred',
  'preferred requirements': 'preferred',
  qualifications: 'unknown',
  compensation: 'compensation',
  pay: 'compensation',
  salary: 'compensation',
  'salary range': 'compensation',
  'compensation range': 'compensation',
};

const REQUISITION_LABELS = new Set([
  'requisition id',
  'job id',
  'job requisition id',
  'requisition number',
  'job number',
]);

const INTERNATIONAL_LOCATION_REGIONS = new Set([
  'alberta',
  'british columbia',
  'england',
  'new south wales',
  'northern ireland',
  'ontario',
  'quebec',
  'queensland',
  'scotland',
  'victoria',
  'wales',
]);

const INTERNATIONAL_LOCATION_COUNTRIES = new Set([
  'australia',
  'brazil',
  'canada',
  'france',
  'germany',
  'india',
  'ireland',
  'italy',
  'japan',
  'mexico',
  'netherlands',
  'new zealand',
  'singapore',
  'south africa',
  'spain',
  'united kingdom',
]);

const COMPANY_SUFFIX_PATTERN =
  /(?:,\s*|\s+)(?:inc(?:orporated)?|l\.?l\.?c\.?|ltd|limited|corp(?:oration)?|plc|gmbh|s\.a\.|pte\.?\s+ltd)\.?$/i;

function cleanString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function normalizedLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function excerpt(value: string): string {
  return value.slice(0, JOB_POSTING_LIMITS.provenanceExcerpt);
}

function isExcluded(element: Element, root: Element): boolean {
  let current: Element | null = element;
  while (current && current !== root) {
    if (current.matches(EXCLUDED_SELECTOR)) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function readableText(element: Element): string | null {
  const clone = element.cloneNode(true) as Element;
  clone
    .querySelectorAll(
      `${EXCLUDED_SELECTOR}, script, style, noscript, template, iframe, object, embed`,
    )
    .forEach((child) => child.remove());
  clone
    .querySelectorAll(
      'br, p, div, li, section, article, h1, h2, h3, h4, h5, h6',
    )
    .forEach((child) => child.append(' '));
  return cleanString(clone.textContent);
}

function ariaName(element: Element, root: Element): string | null {
  const label = cleanString(element.getAttribute('aria-label'));
  if (label) {
    return label;
  }

  const labelledBy = cleanString(element.getAttribute('aria-labelledby'));
  if (!labelledBy) {
    return null;
  }
  const labels = labelledBy
    .split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id))
    .filter(
      (labelElement): labelElement is HTMLElement =>
        labelElement !== null &&
        root.contains(labelElement) &&
        !isExcluded(labelElement, root),
    )
    .map(readableText)
    .filter((value): value is string => value !== null);
  return labels.length > 0 ? labels.join(' ') : null;
}

function isHeading(element: Element): boolean {
  return (
    /^H[1-6]$/.test(element.tagName) ||
    element.getAttribute('role') === 'heading'
  );
}

function headingLevel(element: Element): number | null {
  const nativeMatch = /^H([1-6])$/.exec(element.tagName);
  if (nativeMatch?.[1]) {
    return Number(nativeMatch[1]);
  }
  if (element.getAttribute('role') !== 'heading') {
    return null;
  }
  const ariaLevel = Number(element.getAttribute('aria-level'));
  return Number.isInteger(ariaLevel) && ariaLevel >= 1 && ariaLevel <= 6
    ? ariaLevel
    : null;
}

function headingField(
  element: Element,
  root: Element,
): EvidenceField<string> | null {
  const accessibleName = ariaName(element, root);
  const value = accessibleName ?? readableText(element);
  if (!value) {
    return null;
  }
  const source = accessibleName ? 'aria' : 'dom_heading';
  return {
    value,
    evidence: value,
    locator:
      source === 'aria'
        ? 'dom[0] [role="heading"][aria-level="1"]'
        : 'dom[0] h1',
    source,
    element,
  };
}

function uniqueField<T>(
  fields: Array<EvidenceField<T> | null>,
  key: (value: T) => string = (value) => String(value),
): EvidenceField<T> | null {
  const present = fields.filter(
    (field): field is EvidenceField<T> => field !== null,
  );
  const uniqueKeys = new Set(present.map(({ value }) => key(value)));
  return uniqueKeys.size === 1 ? (present[0] ?? null) : null;
}

function title(root: HTMLElement): EvidenceField<string> | null {
  const headings = Array.from(
    root.querySelectorAll<HTMLElement>('h1, [role="heading"][aria-level="1"]'),
  ).filter(
    (element) => headingLevel(element) === 1 && !isExcluded(element, root),
  );
  return uniqueField(headings.map((element) => headingField(element, root)));
}

function sectionKind(label: string): SectionKind | null {
  return SECTION_LABELS[normalizedLabel(label)] ?? null;
}

function followingSectionContent(heading: Element): Element[] {
  const content: Element[] = [];
  let sibling = heading.nextElementSibling;
  while (sibling && !isHeading(sibling)) {
    content.push(sibling);
    sibling = sibling.nextElementSibling;
  }
  return content;
}

function ariaSections(root: HTMLElement): DomSection[] {
  const containers = Array.from(
    root.querySelectorAll<HTMLElement>(
      'section[aria-label], section[aria-labelledby], [role="region"][aria-label], [role="region"][aria-labelledby]',
    ),
  ).filter((element) => !isExcluded(element, root));

  return containers.flatMap((container, index) => {
    const label = ariaName(container, root);
    const kind = label ? sectionKind(label) : null;
    if (!label || !kind) {
      return [];
    }
    const labelledBy = new Set(
      (container.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .filter(Boolean),
    );
    const content = Array.from(container.children).filter(
      (child) =>
        !isHeading(child) &&
        !labelledBy.has(child.id) &&
        !isExcluded(child, root),
    );
    return [
      {
        kind,
        label,
        locator: `dom[0] aria-section[${index}]`,
        source: 'aria' as const,
        content,
      },
    ];
  });
}

function headingSections(
  root: HTMLElement,
  accessibleSections: DomSection[],
): DomSection[] | null {
  const ariaContainers = Array.from(
    root.querySelectorAll<HTMLElement>(
      'section[aria-label], section[aria-labelledby], [role="region"][aria-label], [role="region"][aria-labelledby]',
    ),
  );
  const headings = Array.from(
    root.querySelectorAll<HTMLElement>(
      'h2, h3, h4, h5, h6, [role="heading"][aria-level]:not([aria-level="1"])',
    ),
  ).filter(
    (element) =>
      !isExcluded(element, root) &&
      !ariaContainers.some((container) => container.contains(element)),
  );

  if (
    headings.length + accessibleSections.length >
    DOM_JOB_POSTING_LIMITS.headingsPerRegion
  ) {
    return null;
  }

  return headings.flatMap((heading, index) => {
    const accessibleName = ariaName(heading, root);
    const label = accessibleName ?? readableText(heading);
    const kind = label ? sectionKind(label) : null;
    if (!label || !kind) {
      return [];
    }
    return [
      {
        kind,
        label,
        locator: `dom[0] heading-section[${index}]`,
        source: accessibleName ? ('aria' as const) : ('dom_heading' as const),
        content: followingSectionContent(heading).filter(
          (element) => !isExcluded(element, root),
        ),
      },
    ];
  });
}

function sections(root: HTMLElement): DomSection[] | null {
  const accessibleSections = ariaSections(root);
  const headedSections = headingSections(root, accessibleSections);
  if (!headedSections) {
    return null;
  }
  if (
    accessibleSections.length + headedSections.length >
    DOM_JOB_POSTING_LIMITS.headingsPerRegion
  ) {
    return null;
  }
  return [...accessibleSections, ...headedSections];
}

function isPlausibleRoot(
  root: HTMLElement,
  candidateTitle: EvidenceField<string>,
  candidateSections: DomSection[],
): boolean {
  const hasRoleContent = candidateSections.some(({ kind }) =>
    ['description', 'responsibilities'].includes(kind),
  );
  const hasJobDetails = candidateSections.some(({ kind }) =>
    ['required', 'preferred', 'unknown', 'compensation'].includes(kind),
  );
  if (!hasRoleContent || !hasJobDetails) {
    return false;
  }

  const titleLabel = normalizedLabel(candidateTitle.value);
  if (/^(careers?|jobs?|open roles?|open positions?)\b/.test(titleLabel)) {
    return false;
  }

  const jobLinks = Array.from(
    root.querySelectorAll<HTMLAnchorElement>('a[href]'),
  )
    .filter((link) => !isExcluded(link, root))
    .map((link) => link.getAttribute('href'))
    .filter((href): href is string => href !== null && /\/jobs?\//i.test(href));
  return new Set(jobLinks).size < 2;
}

function candidates(document: Document): DomCandidate[] | null {
  if (
    document.querySelectorAll('*').length >
    DOM_JOB_POSTING_LIMITS.documentElements
  ) {
    return null;
  }

  const roots = Array.from(
    document.querySelectorAll<HTMLElement>('main, [role="main"], article'),
  ).filter((root) => !root.closest(EXCLUDED_CANDIDATE_ROOT_SELECTOR));
  if (roots.length > DOM_JOB_POSTING_LIMITS.candidateRegions) {
    return null;
  }

  const plausible = roots.flatMap((root) => {
    const candidateTitle = title(root);
    const candidateSections = sections(root);
    if (
      !candidateTitle ||
      !candidateSections ||
      !isPlausibleRoot(root, candidateTitle, candidateSections)
    ) {
      return [];
    }
    return [{ root, title: candidateTitle, sections: candidateSections }];
  });

  return plausible.filter(
    (candidate) =>
      !plausible.some(
        (other) =>
          other.root !== candidate.root && candidate.root.contains(other.root),
      ),
  );
}

function explicitAriaMetadata(
  root: HTMLElement,
  labels: ReadonlySet<string>,
  locator: string,
): EvidenceField<string> | null {
  const fields = Array.from(
    root.querySelectorAll<HTMLElement>('[aria-label], [aria-labelledby]'),
  )
    .filter((element) => !isExcluded(element, root))
    .map((element) => {
      const name = ariaName(element, root);
      const value = readableText(element);
      if (!name || !value || !labels.has(normalizedLabel(name))) {
        return null;
      }
      return {
        value,
        evidence: value,
        locator,
        source: 'aria' as const,
        element,
      };
    });
  return uniqueField(fields);
}

function nearbyMetadata(candidate: DomCandidate): string[] {
  const titleElement = candidate.title.element;
  if (!titleElement) {
    return [];
  }
  const values: string[] = [];
  let sibling = titleElement.nextElementSibling;
  while (sibling && values.length < 4) {
    if (isHeading(sibling) || sibling.matches('section, article')) {
      break;
    }
    if (!isExcluded(sibling, candidate.root)) {
      const value = readableText(sibling);
      if (value) {
        values.push(value);
      }
    }
    sibling = sibling.nextElementSibling;
  }
  return values;
}

function looksLikeLocation(value: string): boolean {
  if (COMPANY_SUFFIX_PATTERN.test(value)) {
    return false;
  }
  const parts = value.split(',').map((part) => part.trim());
  const internationalLocation =
    parts.length === 2 && parts[0] && parts[1]
      ? INTERNATIONAL_LOCATION_REGIONS.has(parts[1].toLowerCase()) ||
        INTERNATIONAL_LOCATION_COUNTRIES.has(parts[1].toLowerCase())
      : parts.length === 3 && parts[0] && parts[1] && parts[2]
        ? INTERNATIONAL_LOCATION_REGIONS.has(parts[1].toLowerCase()) &&
          INTERNATIONAL_LOCATION_COUNTRIES.has(parts[2].toLowerCase())
        : false;
  return (
    /^(remote|hybrid|on[ -]?site)(?:\b|\s*[-,])/i.test(value) ||
    /^[^,]{1,100},\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(value) ||
    internationalLocation
  );
}

function looksLikeCompany(value: string): boolean {
  return (
    value.length <= JOB_POSTING_LIMITS.company &&
    value.split(/\s+/).length <= 15 &&
    (!/[.!?]$/.test(value) || COMPANY_SUFFIX_PATTERN.test(value)) &&
    !looksLikeLocation(value)
  );
}

function company(candidate: DomCandidate): EvidenceField<string> | null {
  const explicit = explicitAriaMetadata(
    candidate.root,
    new Set(['company', 'employer', 'hiring organization']),
    'dom[0] aria-company',
  );
  if (explicit) {
    return explicit;
  }
  const value = nearbyMetadata(candidate).find(looksLikeCompany);
  return value
    ? {
        value,
        evidence: value,
        locator: 'dom[0] title + company',
        source: 'visible_text',
      }
    : null;
}

function locations(candidate: DomCandidate): EvidenceField<string[]> | null {
  const explicit = explicitAriaMetadata(
    candidate.root,
    new Set(['location', 'job location']),
    'dom[0] aria-location',
  );
  if (explicit) {
    return { ...explicit, value: [explicit.value] };
  }
  const value = nearbyMetadata(candidate).find(looksLikeLocation);
  return value
    ? {
        value: [value],
        evidence: value,
        locator: 'dom[0] title + location',
        source: 'visible_text',
      }
    : null;
}

function sectionText(section: DomSection): string | null {
  const text = cleanString(
    section.content
      .map(readableText)
      .filter((value): value is string => value !== null)
      .join(' '),
  );
  return text && text.length <= DOM_JOB_POSTING_LIMITS.sectionTextCharacters
    ? text
    : null;
}

function description(candidate: DomCandidate): EvidenceField<string> | null {
  const preferredSections = candidate.sections.filter(
    ({ kind }) => kind === 'description',
  );
  const sourceSections =
    preferredSections.length > 0
      ? preferredSections
      : candidate.sections.filter(({ kind }) => kind === 'responsibilities');
  return uniqueField(
    sourceSections.map((section) => {
      const value = sectionText(section);
      return value
        ? {
            value,
            evidence: value,
            locator: section.locator,
            source: section.source,
          }
        : null;
    }),
  );
}

function requirementEntries(section: DomSection, root: HTMLElement): string[] {
  const listItems = section.content
    .flatMap((element) =>
      element.matches('li')
        ? [element]
        : Array.from(element.querySelectorAll('li')),
    )
    .filter((element) => !isExcluded(element, root));
  const elements =
    listItems.length > 0
      ? listItems
      : section.content
          .flatMap((element) =>
            element.matches('p')
              ? [element]
              : Array.from(element.querySelectorAll('p')),
          )
          .filter((element) => !isExcluded(element, root));
  return elements
    .map(readableText)
    .filter((value): value is string => value !== null);
}

function requirements(
  candidate: DomCandidate,
): JobPosting['requirements'] | null {
  const groups: JobPosting['requirements'] = {
    required: [],
    preferred: [],
    unknown: [],
  };
  const classifications: Readonly<
    Partial<Record<SectionKind, Requirement['classification']>>
  > = {
    required: 'required',
    preferred: 'preferred',
    unknown: 'unknown',
  };
  const seen: Record<Requirement['classification'], Set<string>> = {
    required: new Set(),
    preferred: new Set(),
    unknown: new Set(),
  };

  for (const section of candidate.sections) {
    const classification = classifications[section.kind];
    if (!classification) {
      continue;
    }
    for (const text of requirementEntries(section, candidate.root)) {
      const key = text.toLowerCase();
      if (seen[classification].has(key)) {
        continue;
      }
      seen[classification].add(key);
      groups[classification].push({
        text,
        classification,
        score: 0.75,
        confidence: 'medium',
        provenance: [
          {
            source: section.source,
            locator: `${section.locator} requirements.${classification}[${groups[classification].length}]`,
            excerpt: excerpt(text),
          },
        ],
      });
    }
  }

  const total =
    groups.required.length + groups.preferred.length + groups.unknown.length;
  const overGroupLimit = Object.values(groups).some(
    (group) => group.length > JOB_POSTING_LIMITS.requirementsPerGroup,
  );
  return overGroupLimit || total > JOB_POSTING_LIMITS.requirementsTotal
    ? null
    : groups;
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parseCompensationAmount(
  value: string,
  magnitude: string | undefined,
): number | null {
  const amount = parseNumber(value);
  if (amount === null) {
    return null;
  }
  if (!magnitude) {
    return amount;
  }
  if (magnitude.toLowerCase() !== 'k') {
    return null;
  }

  const normalized = amount * 1_000;
  return Number.isFinite(normalized) ? normalized : null;
}

function compensation(
  candidate: DomCandidate,
): EvidenceField<Compensation> | null {
  const fields = candidate.sections
    .filter(({ kind }) => kind === 'compensation')
    .map((section) => {
      const rawText = sectionText(section);
      if (!rawText) {
        return null;
      }
      const hasMonetaryContext =
        /[$€£]/.test(rawText) || /\b(?:USD|CAD|EUR|GBP|AUD)\b/i.test(rawText);
      const amountMatches = hasMonetaryContext
        ? Array.from(
            rawText.matchAll(/(?:[$€£]\s*)?(\d[\d,]*(?:\.\d+)?)([a-z]+)?/gi),
          )
        : [];
      const magnitudeMatches = amountMatches.map((match) => Boolean(match[2]));
      if (
        magnitudeMatches.some(Boolean) &&
        magnitudeMatches.some((hasMagnitude) => !hasMagnitude)
      ) {
        return null;
      }
      const amounts = amountMatches.map((match) =>
        match[1] ? parseCompensationAmount(match[1], match[2]) : null,
      );
      if (amounts.some((value) => value === null)) {
        return null;
      }
      const uniqueAmounts = [...new Set(amounts)];
      if (uniqueAmounts.length > 2) {
        return null;
      }
      const currency = /\b(USD|CAD|EUR|GBP|AUD)\b/i.exec(rawText)?.[1];
      const intervalMatch =
        /(?:per|\/)[\s]*(hour|hr|day|week|month|year)s?\b/i.exec(rawText)?.[1];
      const intervalAliases: Readonly<
        Record<string, Compensation['interval']>
      > = {
        hour: 'hour',
        hr: 'hour',
        day: 'day',
        week: 'week',
        month: 'month',
        year: 'year',
      };
      const minimum = uniqueAmounts[0] ?? null;
      const maximum = uniqueAmounts[1] ?? minimum;
      return {
        value: {
          rawText,
          minimum,
          maximum,
          currency: currency?.toUpperCase() ?? null,
          interval: intervalMatch
            ? (intervalAliases[intervalMatch.toLowerCase()] ?? null)
            : null,
        },
        evidence: rawText,
        locator: section.locator,
        source: section.source,
      };
    });
  return uniqueField(fields, (value) => JSON.stringify(value));
}

function requisitionId(candidate: DomCandidate): EvidenceField<string> | null {
  const definitionFields = Array.from(
    candidate.root.querySelectorAll<HTMLElement>('dt'),
  )
    .filter((term) => !isExcluded(term, candidate.root))
    .map((term) => {
      const label = readableText(term);
      const valueElement = term.nextElementSibling;
      const value =
        label &&
        REQUISITION_LABELS.has(normalizedLabel(label)) &&
        valueElement?.tagName === 'DD'
          ? readableText(valueElement)
          : null;
      return value
        ? {
            value,
            evidence: `${label}: ${value}`,
            locator: 'dom[0] dl requisition-id',
            source: 'visible_text' as const,
          }
        : null;
    });
  const ariaFields = Array.from(
    candidate.root.querySelectorAll<HTMLElement>(
      '[aria-label], [aria-labelledby]',
    ),
  )
    .filter((element) => !isExcluded(element, candidate.root))
    .map((element) => {
      const label = ariaName(element, candidate.root);
      const value = readableText(element);
      return label && value && REQUISITION_LABELS.has(normalizedLabel(label))
        ? {
            value,
            evidence: `${label}: ${value}`,
            locator: 'dom[0] aria-requisition-id',
            source: 'aria' as const,
          }
        : null;
    });
  return uniqueField([...definitionFields, ...ariaFields]);
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
  document: Document,
  currentUrl: string,
): EvidenceField<string> | null {
  const href = document
    .querySelector<HTMLLinkElement>('link[rel~="canonical"][href]')
    ?.getAttribute('href');
  const value = normalizedHttpUrl(href ?? null, currentUrl);
  return value
    ? {
        value,
        evidence: href ?? value,
        locator: 'link[rel~="canonical"]',
        source: 'url',
      }
    : null;
}

function sourced<T>(field: EvidenceField<T>) {
  return {
    value: field.value,
    score: 0.75,
    confidence: 'medium' as const,
    conflicted: false,
    provenance: [
      {
        source: field.source,
        locator: field.locator.slice(0, JOB_POSTING_LIMITS.provenanceLocator),
        excerpt: excerpt(field.evidence),
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

function normalizeCandidate(
  candidate: DomCandidate,
  document: Document,
  currentUrl: string,
  extractedAt: string,
): JobPosting | null {
  const normalizedRequirements = requirements(candidate);
  if (!normalizedRequirements) {
    return null;
  }
  const normalizedCompany = company(candidate);
  const normalizedLocations = locations(candidate);
  const normalizedDescription = description(candidate);
  const normalizedCompensation = compensation(candidate);
  const normalizedRequisitionId = requisitionId(candidate);
  const normalizedCanonicalUrl = canonicalUrl(document, currentUrl);

  const result = JobPostingSchema.safeParse({
    schemaVersion: 1,
    title: sourced(candidate.title),
    company: normalizedCompany ? sourced(normalizedCompany) : unknownValue(),
    location: normalizedLocations
      ? sourced(normalizedLocations)
      : unknownValue(),
    compensation: normalizedCompensation
      ? sourced(normalizedCompensation)
      : unknownValue(),
    description: normalizedDescription
      ? sourced(normalizedDescription)
      : unknownValue(),
    requirements: normalizedRequirements,
    currentUrl,
    canonicalUrl: normalizedCanonicalUrl
      ? sourced(normalizedCanonicalUrl)
      : unknownValue(),
    requisitionId: normalizedRequisitionId
      ? sourced(normalizedRequisitionId)
      : unknownValue(),
    extractedAt,
  });
  return result.success ? result.data : null;
}

export function extractDomJobPosting(
  document: Document,
  currentUrl: string,
  extractedAt = new Date().toISOString(),
): JobPosting | null {
  const discoveredCandidates = candidates(document);
  if (!discoveredCandidates || discoveredCandidates.length !== 1) {
    return null;
  }
  const candidate = discoveredCandidates[0];
  return candidate
    ? normalizeCandidate(candidate, document, currentUrl, extractedAt)
    : null;
}
