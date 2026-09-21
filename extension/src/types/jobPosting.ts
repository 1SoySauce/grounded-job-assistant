import { z } from 'zod';

export const JOB_POSTING_LIMITS = {
  title: 500,
  company: 500,
  locationItem: 500,
  locations: 20,
  requisitionId: 500,
  url: 2_048,
  description: 50_000,
  compensationRawText: 2_000,
  currency: 20,
  requirementText: 2_000,
  requirementsPerGroup: 100,
  requirementsTotal: 200,
  provenanceLocator: 500,
  provenanceExcerpt: 500,
  provenancePerValue: 10,
} as const;

export const ExtractionSourceSchema = z.enum([
  'json_ld',
  'semantic',
  'aria',
  'dom_heading',
  'visible_text',
  'url',
]);

export const ExtractionConfidenceSchema = z.enum(['high', 'medium', 'low']);

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const HttpUrlSchema = z
  .url()
  .max(JOB_POSTING_LIMITS.url)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), {
    message: 'URL must use HTTP or HTTPS.',
  });

export const ProvenanceSchema = z
  .object({
    source: ExtractionSourceSchema,
    locator: boundedText(JOB_POSTING_LIMITS.provenanceLocator),
    excerpt: boundedText(JOB_POSTING_LIMITS.provenanceExcerpt),
  })
  .strict();

function sourcedValue<T extends z.ZodType>(value: T) {
  return z
    .object({
      value: value.nullable(),
      score: z.number().min(0).max(1),
      confidence: ExtractionConfidenceSchema,
      conflicted: z.boolean(),
      provenance: z
        .array(ProvenanceSchema)
        .max(JOB_POSTING_LIMITS.provenancePerValue),
    })
    .strict();
}

export const CompensationIntervalSchema = z.enum([
  'hour',
  'day',
  'week',
  'month',
  'year',
]);

export const CompensationSchema = z
  .object({
    rawText: boundedText(JOB_POSTING_LIMITS.compensationRawText),
    minimum: z.number().nonnegative().nullable(),
    maximum: z.number().nonnegative().nullable(),
    currency: boundedText(JOB_POSTING_LIMITS.currency).nullable(),
    interval: CompensationIntervalSchema.nullable(),
  })
  .strict()
  .refine(
    ({ minimum, maximum }) =>
      minimum === null || maximum === null || maximum >= minimum,
    { message: 'Maximum compensation must not be below minimum compensation.' },
  );

export const RequirementClassificationSchema = z.enum([
  'required',
  'preferred',
  'unknown',
]);

export const RequirementSchema = z
  .object({
    text: boundedText(JOB_POSTING_LIMITS.requirementText),
    classification: RequirementClassificationSchema,
    score: z.number().min(0).max(1),
    confidence: ExtractionConfidenceSchema,
    provenance: z
      .array(ProvenanceSchema)
      .max(JOB_POSTING_LIMITS.provenancePerValue),
  })
  .strict();

const requirementsGroup = z
  .array(RequirementSchema)
  .max(JOB_POSTING_LIMITS.requirementsPerGroup);

export const JobPostingSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: sourcedValue(boundedText(JOB_POSTING_LIMITS.title)),
    company: sourcedValue(boundedText(JOB_POSTING_LIMITS.company)),
    location: sourcedValue(
      z
        .array(boundedText(JOB_POSTING_LIMITS.locationItem))
        .min(1)
        .max(JOB_POSTING_LIMITS.locations),
    ),
    compensation: sourcedValue(CompensationSchema),
    description: sourcedValue(boundedText(JOB_POSTING_LIMITS.description)),
    requirements: z
      .object({
        required: requirementsGroup,
        preferred: requirementsGroup,
        unknown: requirementsGroup,
      })
      .strict(),
    currentUrl: HttpUrlSchema,
    canonicalUrl: sourcedValue(HttpUrlSchema),
    requisitionId: sourcedValue(boundedText(JOB_POSTING_LIMITS.requisitionId)),
    extractedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine(({ requirements }, context) => {
    const groups = ['required', 'preferred', 'unknown'] as const;
    const total = groups.reduce(
      (count, group) => count + requirements[group].length,
      0,
    );
    if (total > JOB_POSTING_LIMITS.requirementsTotal) {
      context.addIssue({
        code: 'custom',
        path: ['requirements'],
        message: `Requirements must contain at most ${JOB_POSTING_LIMITS.requirementsTotal} entries.`,
      });
    }
    for (const group of groups) {
      requirements[group].forEach((requirement, index) => {
        if (requirement.classification !== group) {
          context.addIssue({
            code: 'custom',
            path: ['requirements', group, index, 'classification'],
            message: `Requirement classification must match its ${group} group.`,
          });
        }
      });
    }
  });

export type ExtractionSource = z.infer<typeof ExtractionSourceSchema>;
export type ExtractionConfidence = z.infer<typeof ExtractionConfidenceSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Compensation = z.infer<typeof CompensationSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;
export type JobPosting = z.infer<typeof JobPostingSchema>;
