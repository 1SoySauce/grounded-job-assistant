import {
  JOB_POSTING_LIMITS,
  JobPostingSchema,
  type Compensation,
  type JobPosting,
} from '../types/jobPosting';
import {
  missing,
  normalizedObservation,
  type Observation,
} from './structuredObservation';

interface StructuredFields {
  title: Observation<string>;
  company: Observation<string>;
  location: Observation<string[]>;
  compensation: Observation<Compensation>;
  description: Observation<string>;
  canonicalUrl: Observation<string>;
  requisitionId: Observation<string>;
}

export function normalizeStructuredPosting(
  fields: StructuredFields,
  requirements: JobPosting['requirements'],
  currentUrl: string,
  extractedAt: string,
  score: number,
): JobPosting | null {
  const normalized = {
    title: normalizedObservation(fields.title, score),
    company: normalizedObservation(fields.company, score),
    location: normalizedObservation(fields.location, score),
    compensation: normalizedObservation(fields.compensation, score),
    description: normalizedObservation(fields.description, score),
    canonicalUrl: normalizedObservation(fields.canonicalUrl, score),
    requisitionId: normalizedObservation(fields.requisitionId, score),
  };

  // Title/current URL still use whole-posting validation: identity is never
  // truncated or guessed. Invalid optional values cannot discard that identity.
  const optionalFields = [
    'company',
    'location',
    'compensation',
    'description',
    'canonicalUrl',
    'requisitionId',
  ] as const;
  for (const key of optionalFields) {
    if (!JobPostingSchema.shape[key].safeParse(normalized[key]).success) {
      normalized[key] = normalizedObservation(missing(), score);
    }
  }
  const checkedRequirements =
    JobPostingSchema.shape.requirements.safeParse(requirements);
  const validRequirements =
    checkedRequirements.success &&
    requirements.required.length +
      requirements.preferred.length +
      requirements.unknown.length <=
      JOB_POSTING_LIMITS.requirementsTotal;
  const result = JobPostingSchema.safeParse({
    schemaVersion: 1,
    ...normalized,
    requirements: validRequirements
      ? requirements
      : { required: [], preferred: [], unknown: [] },
    currentUrl,
    extractedAt,
  });
  return result.success ? result.data : null;
}
