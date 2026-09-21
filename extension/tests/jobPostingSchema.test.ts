import { describe, expect, it } from 'vitest';
import {
  JOB_POSTING_LIMITS,
  JobPostingSchema,
  type Provenance,
} from '../src/types/jobPosting';

const evidence: Provenance = {
  source: 'json_ld',
  locator: '$.title',
  excerpt: 'Platform Support Engineer',
};

function sourced(value: unknown) {
  return {
    value,
    score: 0.95,
    confidence: 'high',
    conflicted: false,
    provenance: [evidence],
  };
}

function unknownValue() {
  return {
    value: null,
    score: 0,
    confidence: 'low',
    conflicted: false,
    provenance: [],
  };
}

function requirement(
  classification: 'required' | 'preferred' | 'unknown',
  text = 'Documented qualification',
) {
  return {
    text,
    classification,
    score: 0.9,
    confidence: 'high',
    provenance: [
      {
        source: 'dom_heading',
        locator: `heading:${classification}`,
        excerpt: text,
      },
    ],
  };
}

function fullPosting() {
  return {
    schemaVersion: 1,
    title: sourced('Platform Support Engineer'),
    company: sourced('Northstar Lantern Labs'),
    location: sourced(['Example City, NY', 'Remote']),
    compensation: sourced({
      rawText: '$70,000–$90,000 USD per year',
      minimum: 70_000,
      maximum: 90_000,
      currency: 'USD',
      interval: 'year',
    }),
    description: sourced('Support reliable systems for fictional customers.'),
    requirements: {
      required: [requirement('required', 'Two years of support experience.')],
      preferred: [
        requirement('preferred', 'Cloud platform experience preferred.'),
      ],
      unknown: [requirement('unknown', 'Clear written communication.')],
    },
    currentUrl: 'https://careers.example.test/jobs/platform-support-engineer',
    canonicalUrl: sourced(
      'https://careers.example.test/jobs/platform-support-engineer',
    ),
    requisitionId: sourced('NSL-ENG-1042'),
    extractedAt: '2026-09-17T12:00:00.000Z',
  };
}

describe('normalized JobPosting schema', () => {
  it('accepts a complete bounded posting', () => {
    const result = JobPostingSchema.parse(fullPosting());
    expect(result.title.value).toBe('Platform Support Engineer');
    expect(result.location.value).toEqual(['Example City, NY', 'Remote']);
    expect(result.requisitionId.value).toBe('NSL-ENG-1042');
  });

  it('accepts null unknown values and empty requirement groups', () => {
    const posting = fullPosting();
    posting.company = unknownValue();
    posting.location = unknownValue();
    posting.compensation = unknownValue();
    posting.description = unknownValue();
    posting.canonicalUrl = unknownValue();
    posting.requisitionId = unknownValue();
    posting.requirements = { required: [], preferred: [], unknown: [] };

    const result = JobPostingSchema.parse(posting);
    expect(result.company.value).toBeNull();
    expect(result.compensation.value).toBeNull();
    expect(result.requirements).toEqual({
      required: [],
      preferred: [],
      unknown: [],
    });
  });

  it('rejects empty strings used as unknown scalar values', () => {
    const posting = fullPosting();
    posting.company.value = '   ';
    expect(JobPostingSchema.safeParse(posting).success).toBe(false);
  });

  it('requires each requirement classification to match its group', () => {
    const posting = fullPosting();
    posting.requirements.required = [requirement('preferred')];
    expect(JobPostingSchema.safeParse(posting).success).toBe(false);
  });

  it('validates structured compensation and its bounds', () => {
    const result = JobPostingSchema.parse(fullPosting());
    expect(result.compensation.value).toMatchObject({
      minimum: 70_000,
      maximum: 90_000,
      currency: 'USD',
      interval: 'year',
    });

    const inverted = fullPosting();
    inverted.compensation = sourced({
      rawText: '$90,000–$70,000 USD per year',
      minimum: 90_000,
      maximum: 70_000,
      currency: 'USD',
      interval: 'year',
    });
    expect(JobPostingSchema.safeParse(inverted).success).toBe(false);
  });

  it('rejects negative compensation values', () => {
    const posting = {
      ...fullPosting(),
      compensation: sourced({
        rawText: '-$1–$90,000 USD per year',
        minimum: -1,
        maximum: 90_000,
        currency: 'USD',
        interval: 'year',
      }),
    };
    expect(JobPostingSchema.safeParse(posting).success).toBe(false);
  });

  it('rejects unexpected top-level properties', () => {
    const posting = { ...fullPosting(), unexpected: true };
    expect(JobPostingSchema.safeParse(posting).success).toBe(false);
  });

  it('validates confidence scores and bounded provenance', () => {
    const invalidScore = fullPosting();
    invalidScore.title.score = 1.01;
    expect(JobPostingSchema.safeParse(invalidScore).success).toBe(false);

    const longExcerpt = fullPosting();
    longExcerpt.title.provenance[0] = {
      ...evidence,
      excerpt: 'x'.repeat(JOB_POSTING_LIMITS.provenanceExcerpt + 1),
    };
    expect(JobPostingSchema.safeParse(longExcerpt).success).toBe(false);

    const excessProvenance = fullPosting();
    excessProvenance.title.provenance = Array.from(
      { length: JOB_POSTING_LIMITS.provenancePerValue + 1 },
      () => evidence,
    );
    expect(JobPostingSchema.safeParse(excessProvenance).success).toBe(false);
  });

  it('rejects non-HTTP URLs', () => {
    const invalidCurrent = fullPosting();
    invalidCurrent.currentUrl = 'ftp://careers.example.test/job';
    expect(JobPostingSchema.safeParse(invalidCurrent).success).toBe(false);

    const invalidCanonical = fullPosting();
    invalidCanonical.canonicalUrl = sourced('javascript:alert(1)');
    expect(JobPostingSchema.safeParse(invalidCanonical).success).toBe(false);
  });

  it('rejects over-limit field, requirement, provenance, and count values', () => {
    const longTitle = fullPosting();
    longTitle.title.value = 'x'.repeat(JOB_POSTING_LIMITS.title + 1);
    expect(JobPostingSchema.safeParse(longTitle).success).toBe(false);

    const longRequirement = fullPosting();
    longRequirement.requirements.required = [
      requirement(
        'required',
        'x'.repeat(JOB_POSTING_LIMITS.requirementText + 1),
      ),
    ];
    expect(JobPostingSchema.safeParse(longRequirement).success).toBe(false);

    const tooManyInGroup = fullPosting();
    tooManyInGroup.requirements.required = Array.from(
      { length: JOB_POSTING_LIMITS.requirementsPerGroup + 1 },
      () => requirement('required'),
    );
    expect(JobPostingSchema.safeParse(tooManyInGroup).success).toBe(false);

    const tooManyTotal = fullPosting();
    tooManyTotal.requirements = {
      required: Array.from({ length: 67 }, () => requirement('required')),
      preferred: Array.from({ length: 67 }, () => requirement('preferred')),
      unknown: Array.from({ length: 67 }, () => requirement('unknown')),
    };
    expect(JobPostingSchema.safeParse(tooManyTotal).success).toBe(false);
  });
});
