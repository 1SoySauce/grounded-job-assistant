// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractJsonLdJobPosting } from '../src/scanner/jsonLdJobPosting';
import { extractSemanticJobPosting } from '../src/scanner/semanticJobPosting';
import { extractDomJobPosting } from '../src/scanner/domJobPosting';
import { scanPage } from '../src/scanner/pageScanner';
import {
  JOB_POSTING_LIMITS,
  JobPostingSchema,
  type JobPosting,
} from '../src/types/jobPosting';

const currentUrl = 'https://careers.example.test/jobs/structured';
const extractedAt = '2026-09-21T12:00:00.000Z';
type Source = 'json_ld' | 'semantic';
type Fields = Record<string, unknown>;

function addJson(document: Document, value: unknown): void {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(value);
  document.head.append(script);
}

// Represent the same supported object subset as direct microdata properties.
// Arrays become repeated properties, objects become nested scopes.
function addMicrodata(
  document: Document,
  parent: Element,
  fields: Fields,
): void {
  for (const [property, value] of Object.entries(fields)) {
    if (property.startsWith('@')) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === null || item === undefined) continue;
      const nested = typeof item === 'object';
      const element = document.createElement(
        nested ? 'div' : property === 'url' ? 'link' : 'meta',
      );
      element.setAttribute('itemprop', property);
      if (nested) {
        element.setAttribute('itemscope', '');
        addMicrodata(document, element, item as Fields);
      } else {
        element.setAttribute(
          property === 'url' ? 'href' : 'content',
          String(item),
        );
      }
      parent.append(element);
    }
  }
}

function createDocument(
  source: Source,
  fields: Fields,
  canonicals: string[] = [],
): Document {
  const document = window.document.implementation.createHTMLDocument();
  for (const href of canonicals) {
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.setAttribute('href', href);
    document.head.append(link);
  }
  const value = { title: 'Trusted structured title', ...fields };
  if (source === 'json_ld') {
    addJson(document, { '@type': 'JobPosting', ...value });
  } else {
    const root = document.createElement('article');
    root.setAttribute('itemscope', '');
    root.setAttribute('itemtype', 'https://schema.org/JobPosting');
    addMicrodata(document, root, value);
    document.body.append(root);
  }
  return document;
}

function read(source: Source, document: Document): JobPosting | null {
  return source === 'json_ld'
    ? extractJsonLdJobPosting(document, currentUrl, extractedAt).jobPosting
    : extractSemanticJobPosting(document, currentUrl, extractedAt);
}

function extract(
  source: Source,
  fields: Fields,
  canonicals: string[] = [],
): JobPosting {
  const result = read(source, createDocument(source, fields, canonicals));
  expect(result).not.toBeNull();
  expect(JobPostingSchema.safeParse(result).success).toBe(true);
  return result!;
}

function expectMissing(field: JobPosting['title']): void {
  expect(field).toEqual({
    value: null,
    conflicted: false,
    score: 0,
    confidence: 'low',
    provenance: [],
  });
}

function expectConflict(
  field:
    JobPosting['title'] | JobPosting['location'] | JobPosting['compensation'],
  witnesses: string[],
): void {
  expect(field).toMatchObject({
    value: null,
    conflicted: true,
    score: 0,
    confidence: 'low',
  });
  expect(field.provenance.map(({ excerpt }) => excerpt)).toEqual(
    expect.arrayContaining(witnesses),
  );
  expect(field.provenance.length).toBeLessThanOrEqual(
    JOB_POSTING_LIMITS.provenancePerValue,
  );
  for (const item of field.provenance) {
    expect(item.locator.length).toBeLessThanOrEqual(
      JOB_POSTING_LIMITS.provenanceLocator,
    );
    expect(item.excerpt.length).toBeLessThanOrEqual(
      JOB_POSTING_LIMITS.provenanceExcerpt,
    );
  }
}

const scalars: Array<{
  field: 'title' | 'company' | 'description' | 'requisitionId' | 'canonicalUrl';
  values: [string, string];
  input: (values: string[]) => Fields;
}> = [
  {
    field: 'title',
    values: ['First title', 'Second title'],
    input: (title) => ({ title }),
  },
  {
    field: 'company',
    values: ['First employer', 'Second employer'],
    input: (name) => ({ hiringOrganization: { name } }),
  },
  {
    field: 'description',
    values: ['First description', 'Second description'],
    input: (description) => ({ description }),
  },
  {
    field: 'requisitionId',
    values: ['ID-1', 'ID-2'],
    input: (value) => ({ identifier: { value } }),
  },
  {
    field: 'canonicalUrl',
    values: [currentUrl, currentUrl + '-other'],
    input: (url) => ({ url }),
  },
];

describe.each<Source>(['json_ld', 'semantic'])(
  '%s structured observation invariants',
  (source) => {
    it.each(scalars)(
      '$field distinguishes missing, single, equivalent, and conflicting observations',
      ({ field, values, input }) => {
        expectMissing(extract(source, input([]))[field]);
        const single = extract(source, input([values[0]]))[field];
        expect(single).toMatchObject({
          value: values[0],
          conflicted: false,
          confidence: 'high',
        });
        expect(single.score).toBeGreaterThan(0);
        const repeated = extract(source, input([values[0], values[0]]))[field];
        expect(repeated).toEqual(single);
        for (const order of [values, [...values].reverse()]) {
          const conflict = extract(source, input(order))[field];
          expectConflict(conflict, values);
          expect(
            conflict.provenance.every(
              ({ source: actual }) => actual === source,
            ),
          ).toBe(true);
          expect(conflict.score).toBeLessThan(single.score);
        }
      },
    );

    it.each([
      'streetAddress',
      'addressLocality',
      'addressRegion',
      'postalCode',
      'addressCountry',
    ])(
      'propagates %s conflicts through address and place, without fallback',
      (component) => {
        const address = (values: string[]) => ({
          [component]:
            component === 'addressCountry' ? { name: values } : values,
        });
        const input = (values: string[]) => ({
          jobLocation: { address: address(values) },
        });
        const missing = extract(source, input([])).location;
        expect(missing).toMatchObject({
          value: null,
          conflicted: false,
          provenance: [],
        });
        expect(extract(source, input(['First'])).location).toMatchObject({
          value: ['First'],
          conflicted: false,
        });
        expect(extract(source, input(['First', 'First'])).location).toEqual(
          extract(source, input(['First'])).location,
        );
        for (const values of [
          ['First', 'Second'],
          ['Second', 'First'],
        ]) {
          const partial = {
            ...address(values),
            ...(component !== 'streetAddress'
              ? { streetAddress: 'Known street' }
              : { postalCode: 'Known code' }),
          };
          const posting = extract(source, {
            jobLocation: { name: 'Weaker place name', address: partial },
          });
          expectConflict(posting.location, values);
        }
      },
    );

    it('treats repeated scalar objects as observations, not collections or first-object wins', () => {
      const cases = [
        {
          field: 'company' as const,
          input: (items: unknown[]) => ({ hiringOrganization: items }),
          objects: [{ name: 'First' }, { name: 'Second' }],
          expected: 'First',
        },
        {
          field: 'requisitionId' as const,
          input: (items: unknown[]) => ({ identifier: items }),
          objects: [{ value: 'First' }, { value: 'Second' }],
          expected: 'First',
        },
        {
          field: 'location' as const,
          input: (items: unknown[]) => ({ jobLocation: { address: items } }),
          objects: [
            { addressLocality: 'First' },
            { addressLocality: 'Second' },
          ],
          expected: ['First'],
        },
      ];
      for (const { field, input, objects, expected } of cases) {
        expect(
          extract(source, input([objects[0], objects[0]]))[field],
        ).toMatchObject({
          value: expected,
          conflicted: false,
        });
        for (const order of [objects, [...objects].reverse()]) {
          expectConflict(extract(source, input(order))[field], [
            'First',
            'Second',
          ]);
        }
      }
      const valid = { name: 'First' };
      const conflict = { name: ['First', 'Second'] };
      for (const order of [
        [valid, conflict],
        [conflict, valid],
      ]) {
        expectConflict(extract(source, { hiringOrganization: order }).company, [
          'First',
          'Second',
        ]);
      }
    });

    it('retains legitimate partial and multiple locations, but not a conflicted member', () => {
      const london = {
        address: {
          addressLocality: 'London',
          addressCountry: { name: 'United Kingdom' },
        },
      };
      const paris = { address: { addressLocality: 'Paris' } };
      const posting = extract(source, { jobLocation: [london, paris, london] });
      expect(posting.location).toMatchObject({
        value: ['London, United Kingdom', 'Paris'],
        conflicted: false,
      });
      const conflict = {
        address: {
          addressLocality: ['Berlin', 'Bonn'],
          addressCountry: 'Germany',
        },
      };
      for (const members of [
        [london, conflict],
        [conflict, london],
      ]) {
        expectConflict(extract(source, { jobLocation: members }).location, [
          'Berlin',
          'Bonn',
        ]);
      }
      expect(
        extract(source, { jobLocation: { name: 'Named place', address: {} } })
          .location.value,
      ).toEqual(['Named place']);
    });

    const salaries: Array<{
      name: string;
      values: [string | number, string | number];
      input: (values: (string | number)[]) => Fields;
    }> = [
      {
        name: 'currency',
        values: ['USD', 'EUR'],
        input: (currency) => ({ currency, value: 50 }),
      },
      {
        name: 'direct amount',
        values: [40, 50],
        input: (value) => ({ currency: 'USD', value }),
      },
      {
        name: 'quantity amount',
        values: [40, 50],
        input: (value) => ({ currency: 'USD', value: { value } }),
      },
      {
        name: 'minimum',
        values: [40, 45],
        input: (minValue) => ({ value: { minValue, maxValue: 60 } }),
      },
      {
        name: 'maximum',
        values: [60, 65],
        input: (maxValue) => ({ value: { minValue: 40, maxValue } }),
      },
      {
        name: 'inner interval',
        values: ['hour', 'year'],
        input: (unitText) => ({ value: { value: 50, unitText } }),
      },
      {
        name: 'outer interval',
        values: ['hour', 'year'],
        input: (unitText) => ({ value: 50, unitText }),
      },
    ];
    it.each(salaries)(
      'retains salary $name conflicts without constructing a partial amount',
      ({ values, input }) => {
        const salary = (observations: (string | number)[]) =>
          extract(source, { baseSalary: input(observations) }).compensation;
        const single = salary([values[0]]);
        expect(single.value).not.toBeNull();
        expect(single.conflicted).toBe(false);
        expect(salary([values[0], values[0]])).toMatchObject({
          value: single.value,
          conflicted: single.conflicted,
          score: single.score,
          confidence: single.confidence,
        });
        expect(salary([]).conflicted).toBe(false);
        for (const order of [values, [...values].reverse()]) {
          expectConflict(salary(order), values.map(String));
        }
      },
    );

    it('deduplicates normalized salary observations and rejects disagreement between levels', () => {
      const amount = {
        currency: ['usd', 'USD'],
        value: {
          minValue: [40, '40.0'],
          maxValue: 60,
          unitText: ['HOUR', 'hours'],
        },
      };
      expect(
        extract(source, { baseSalary: [amount, amount] }).compensation,
      ).toMatchObject({
        value: { minimum: 40, maximum: 60, interval: 'hour', currency: 'USD' },
        conflicted: false,
      });
      expectConflict(
        extract(source, { baseSalary: { ...amount, unitText: 'year' } })
          .compensation,
        ['HOUR', 'year'],
      );
      expectConflict(
        extract(source, {
          baseSalary: [amount, { currency: 'EUR', value: 40 }],
        }).compensation,
        ['usd', 'EUR'],
      );
      expectConflict(
        extract(source, { baseSalary: { value: { value: 20, minValue: 40 } } })
          .compensation,
        ['20', '40'],
      );
      expect(
        extract(source, { baseSalary: { value: { minValue: 40 } } })
          .compensation,
      ).toMatchObject({
        value: { minimum: 40, maximum: null, currency: null, interval: null },
        conflicted: false,
      });
    });

    it('preserves conflicts even without another usable salary component', () => {
      expectConflict(
        extract(source, { baseSalary: { currency: ['USD', 'EUR'] } })
          .compensation,
        ['USD', 'EUR'],
      );
      expectConflict(
        extract(source, {
          baseSalary: { value: { unitText: ['hour', 'year'] } },
        }).compensation,
        ['hour', 'year'],
      );
      expect(extract(source, {}).compensation).toMatchObject({
        value: null,
        conflicted: false,
        provenance: [],
      });
    });

    it('finds late contradictory evidence without exceeding provenance limits', () => {
      const names = [
        ...Array<string>(15).fill('Repeated organization'),
        'Different organization',
      ];
      expectConflict(
        extract(source, { hiringOrganization: { name: names } }).company,
        ['Repeated organization', 'Different organization'],
      );
      const many = Array.from(
        { length: 15 },
        (_, index) => 'Organization ' + index,
      );
      const field = extract(source, {
        hiringOrganization: { name: many },
      }).company;
      expectConflict(field, ['Organization 0', 'Organization 1']);
      const long = 'X'.repeat(600);
      const bounded = extract(source, {
        hiringOrganization: { name: [long + 'A', long + 'B'] },
      }).company;
      expectConflict(bounded, [
        long.slice(0, JOB_POSTING_LIMITS.provenanceExcerpt),
      ]);
    });

    it('quarantines invalid optional fields without changing structured identity or enriching from DOM', () => {
      const invalidFields: Array<{
        fields: Fields;
        field: keyof Pick<
          JobPosting,
          | 'company'
          | 'location'
          | 'compensation'
          | 'description'
          | 'requisitionId'
        >;
      }> = [
        {
          fields: {
            description: 'X'.repeat(JOB_POSTING_LIMITS.description + 1),
          },
          field: 'description',
        },
        {
          fields: {
            hiringOrganization: {
              name: 'X'.repeat(JOB_POSTING_LIMITS.company + 1),
            },
          },
          field: 'company',
        },
        {
          fields: {
            identifier: {
              value: 'X'.repeat(JOB_POSTING_LIMITS.requisitionId + 1),
            },
          },
          field: 'requisitionId',
        },
        {
          fields: {
            jobLocation: {
              name: 'X'.repeat(JOB_POSTING_LIMITS.locationItem + 1),
            },
          },
          field: 'location',
        },
        {
          fields: {
            jobLocation: Array.from(
              { length: JOB_POSTING_LIMITS.locations + 1 },
              (_, index) => ({ name: 'Place ' + index }),
            ),
          },
          field: 'location',
        },
        {
          fields: { baseSalary: { value: { minValue: 90, maxValue: 70 } } },
          field: 'compensation',
        },
        { fields: { baseSalary: { value: -10 } }, field: 'compensation' },
        {
          fields: {
            baseSalary: {
              value: 50,
              currency: 'X'.repeat(JOB_POSTING_LIMITS.currency + 1),
            },
          },
          field: 'compensation',
        },
        {
          fields: {
            baseSalary: 'X'.repeat(JOB_POSTING_LIMITS.compensationRawText + 1),
          },
          field: 'compensation',
        },
      ];
      const domHtml = readFileSync(
        resolve('tests/fixtures/job-postings/generic-dom-only.html'),
        'utf8',
      );
      for (const { fields, field } of invalidFields) {
        const document = createDocument(source, fields);
        const fixture = new DOMParser().parseFromString(domHtml, 'text/html');
        document.body.append(
          document.importNode(fixture.querySelector('main')!, true),
        );
        expect(extractDomJobPosting(document, currentUrl)?.title.value).toBe(
          'Operations Data Specialist',
        );
        if (source === 'json_ld') {
          const semantic = createDocument('semantic', {
            title: 'Weaker semantic identity',
            hiringOrganization: { name: 'Weaker employer' },
          });
          document.body.append(
            document.importNode(semantic.querySelector('[itemscope]')!, true),
          );
        }
        const posting = scanPage(document, currentUrl).jobPosting;
        expect(posting?.title).toMatchObject({
          value: 'Trusted structured title',
          provenance: [expect.objectContaining({ source })],
        });
        expect(posting?.[field]).toMatchObject({
          value: null,
          conflicted: false,
          score: 0,
        });
        expect(posting?.company.value).toBeNull();
        expect(JobPostingSchema.safeParse(posting).success).toBe(true);
      }
    });

    it('does not truncate an invalid title to manufacture identity', () => {
      expect(
        read(
          source,
          createDocument(source, {
            title: 'X'.repeat(JOB_POSTING_LIMITS.title + 1),
          }),
        ),
      ).toBeNull();
    });

    it('uses page canonical metadata only when candidate URLs are missing or unusable', () => {
      for (const url of [
        undefined,
        [],
        'javascript:alert(1)',
        { unsupported: true },
      ]) {
        const field = extract(source, { url }, [
          '/jobs/canonical',
        ]).canonicalUrl;
        expect(field).toMatchObject({
          value: 'https://careers.example.test/jobs/canonical',
          conflicted: false,
          provenance: [
            expect.objectContaining({
              source: 'url',
              excerpt: '/jobs/canonical',
            }),
          ],
        });
      }
      expectMissing(extract(source, {}).canonicalUrl);
      expect(
        extract(source, { url: '/jobs/explicit' }, [
          '/jobs/page',
          '/jobs/other',
        ]).canonicalUrl,
      ).toMatchObject({
        value: 'https://careers.example.test/jobs/explicit',
        conflicted: false,
        provenance: [expect.objectContaining({ source })],
      });
      const urls = ['/jobs/first', '/jobs/second'];
      expectConflict(
        extract(source, { url: urls }, ['/jobs/page']).canonicalUrl,
        urls,
      );
    });

    it('normalizes equivalent candidate and page URLs before comparing observations', () => {
      const forms = ['/jobs/structured', currentUrl + '#details', currentUrl];
      for (const urls of [forms, [...forms].reverse()]) {
        expect(extract(source, { url: urls }).canonicalUrl).toMatchObject({
          value: currentUrl,
          conflicted: false,
        });
        expect(extract(source, {}, urls).canonicalUrl).toMatchObject({
          value: currentUrl,
          conflicted: false,
          provenance: [expect.objectContaining({ source: 'url' })],
        });
      }
    });

    it('preserves conflicting page canonicals regardless of order', () => {
      const urls = ['/jobs/first', '/jobs/second'];
      for (const order of [urls, [...urls].reverse()]) {
        const field = extract(source, {}, order).canonicalUrl;
        expectConflict(field, urls);
        expect(field.provenance.every(({ source }) => source === 'url')).toBe(
          true,
        );
      }
    });
  },
);

describe('JSON-LD supported subset and candidate selection', () => {
  it('keeps unsupported literal structures unknown, without guessing from nested arrays', () => {
    for (const unsupported of [
      true,
      { '@value': 'Unsupported literal' },
      [['Nested array']],
      { unexpected: 'value' },
    ]) {
      const posting = extract('json_ld', {
        title: unsupported,
        hiringOrganization: { name: unsupported },
        description: unsupported,
        identifier: { value: unsupported },
        url: unsupported,
        jobLocation: { address: { addressLocality: unsupported } },
        baseSalary: { value: { minValue: unsupported } },
      });
      for (const key of [
        'title',
        'company',
        'description',
        'requisitionId',
        'canonicalUrl',
        'location',
        'compensation',
      ] as const) {
        expect(posting[key]).toMatchObject({
          value: null,
          conflicted: false,
          provenance: [],
        });
      }
    }
  });

  it('deduplicates normalized descriptions and numeric identifiers', () => {
    const posting = extract('json_ld', {
      description: ['<p>Build safely.</p>', 'Build safely.'],
      identifier: { value: [42, '42'] },
    });
    expect(posting.description).toMatchObject({
      value: 'Build safely.',
      conflicted: false,
    });
    expect(posting.requisitionId).toMatchObject({
      value: '42',
      conflicted: false,
    });
  });

  it('does not let leading whitespace invalidate otherwise usable evidence', () => {
    const padding = ' '.repeat(JOB_POSTING_LIMITS.provenanceExcerpt + 1);
    const posting = extract(
      'json_ld',
      {
        title: padding + 'Trusted title',
        description: padding + 'Trusted description',
      },
      [padding + '/jobs/canonical'],
    );
    expect(posting.title.value).toBe('Trusted title');
    expect(posting.description.value).toBe('Trusted description');
    expect(posting.canonicalUrl).toMatchObject({
      value: 'https://careers.example.test/jobs/canonical',
      provenance: [
        expect.objectContaining({ source: 'url', excerpt: '/jobs/canonical' }),
      ],
    });
  });

  it('uses equivalent candidate URL arrays and page canonicals consistently for selection and output', () => {
    const document = createDocument(
      'json_ld',
      {
        title: 'Selected',
        url: [
          '/jobs/selected',
          'https://careers.example.test/jobs/selected#details',
        ],
      },
      ['/jobs/selected', 'https://careers.example.test/jobs/selected'],
    );
    addJson(document, {
      '@type': 'JobPosting',
      title: 'Current URL candidate',
      url: currentUrl,
    });
    expect(read('json_ld', document)).toMatchObject({
      title: { value: 'Selected' },
      canonicalUrl: {
        value: 'https://careers.example.test/jobs/selected',
        conflicted: false,
      },
    });
  });

  it('does not let conflicting page canonicals choose a candidate', () => {
    for (const urls of [
      ['/jobs/a', '/jobs/b'],
      ['/jobs/b', '/jobs/a'],
    ]) {
      const document = createDocument(
        'json_ld',
        { title: 'A', url: '/jobs/a' },
        urls,
      );
      addJson(document, { '@type': 'JobPosting', title: 'B', url: '/jobs/b' });
      expect(read('json_ld', document)).toBeNull();
    }
  });

  it('does not score a conflicting candidate URL as a match', () => {
    const document = createDocument(
      'json_ld',
      { title: 'Conflicted', url: [currentUrl, '/jobs/other'] },
      [currentUrl],
    );
    addJson(document, {
      '@type': 'JobPosting',
      title: 'Unmatched',
      url: '/jobs/elsewhere',
    });
    expect(read('json_ld', document)).toBeNull();
  });

  it('can still select unique current-URL evidence when page canonicals conflict', () => {
    const document = createDocument(
      'json_ld',
      { title: 'Current', url: currentUrl },
      ['/jobs/a', '/jobs/b'],
    );
    addJson(document, {
      '@type': 'JobPosting',
      title: 'Other',
      url: '/jobs/a',
    });
    expect(read('json_ld', document)).toMatchObject({
      title: { value: 'Current' },
      canonicalUrl: { value: currentUrl, conflicted: false },
    });
  });
});

describe('semantic optional requirements validation', () => {
  it('quarantines invalid requirement data while preserving identity', () => {
    const groups = ['required', 'preferred', 'unknown'] as const;
    const headings = [
      'Required qualifications',
      'Preferred qualifications',
      'Qualifications',
    ];
    for (const counts of [
      [101, 0, 0],
      [100, 100, 1],
      [1, 0, 0],
    ]) {
      const document = createDocument('semantic', {});
      const root = document.querySelector('[itemscope]')!;
      groups.forEach((_group, index) => {
        const section = document.createElement('section');
        const heading = document.createElement('h2');
        heading.textContent = headings[index]!;
        section.append(heading);
        for (let number = 0; number < counts[index]!; number += 1) {
          const li = document.createElement('li');
          li.textContent =
            counts[0] === 1
              ? 'X'.repeat(JOB_POSTING_LIMITS.requirementText + 1)
              : 'Requirement ' + number;
          section.append(li);
        }
        root.append(section);
      });
      expect(scanPage(document, currentUrl).jobPosting).toMatchObject({
        title: { value: 'Trusted structured title' },
        requirements: { required: [], preferred: [], unknown: [] },
      });
    }
  });
});
