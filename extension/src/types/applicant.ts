import { z } from 'zod';
import {
  AnswerLibraryEntrySchema,
  createEmptyProfile,
  JobPreferencesSchema,
  JobSeekerProfileSchema,
} from './profile';

export const ApplicantProfileSchema = JobSeekerProfileSchema.omit({
  preferences: true,
  answerLibrary: true,
})
  .extend({ schemaVersion: z.literal(2) })
  .strict();
export type ApplicantProfile = z.infer<typeof ApplicantProfileSchema>;
export const DraftSchema = z
  .object({
    id: z.string().uuid(),
    resumeId: z.string().uuid(),
    status: z.literal('unverified'),
    text: z.string().max(200_000),
    createdAt: z.iso.datetime(),
    candidate: ApplicantProfileSchema,
  })
  .strict();
export type ImportDraft = z.infer<typeof DraftSchema>;
export const ApplicantStoreSchema = z
  .object({
    schemaVersion: z.literal(2),
    revision: z.number().int().nonnegative(),
    profile: ApplicantProfileSchema,
    answers: z.array(AnswerLibraryEntrySchema).max(1000),
    preferences: JobPreferencesSchema,
    imports: z.array(DraftSchema).max(30),
  })
  .strict();
export type ApplicantStore = z.infer<typeof ApplicantStoreSchema>;
export function emptyApplicant(): ApplicantStore {
  const { preferences, answerLibrary, ...profile } = createEmptyProfile();
  return {
    schemaVersion: 2,
    revision: 0,
    profile: { ...profile, schemaVersion: 2 },
    answers: answerLibrary,
    preferences,
    imports: [],
  };
}
export function validateProfile(profile: ApplicantProfile): ApplicantProfile {
  const result = ApplicantProfileSchema.parse(profile);
  const links = [
    result.personal.linkedinUrl,
    result.personal.githubUrl,
    result.personal.portfolioUrl,
    ...result.projects.flatMap((project) => [
      project.githubUrl,
      project.deployedUrl,
    ]),
  ];
  if (
    links.some(
      (link) => link && !['http:', 'https:'].includes(new URL(link).protocol),
    )
  )
    throw new Error('Profile links must use http or https.');
  if (
    result.personal.email &&
    !z.email().safeParse(result.personal.email).success
  )
    throw new Error('Enter a valid email address.');
  for (const key of [
    'education',
    'employment',
    'projects',
    'certifications',
  ] as const) {
    if (new Set(result[key].map((x) => x.id)).size !== result[key].length)
      throw new Error('Each entry must have a unique ID.');
  }
  if (
    result.education.some((entry) => !entry.institution) ||
    result.employment.some((entry) => !entry.employer) ||
    result.projects.some((entry) => !entry.name) ||
    result.certifications.some((entry) => !entry.certification)
  )
    throw new Error(
      'Each history entry needs its institution, employer, project name, or certification name. Remove unused blank entries.',
    );
  return result;
}
// Stable IDs prevent transferring verification when history is reordered or removed.
export function facts(profile: ApplicantProfile): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profile.personal))
    if (value !== '') values[`personal.${key}`] = value;
  for (const section of [
    'education',
    'employment',
    'projects',
    'certifications',
  ] as const) {
    for (const entry of profile[section])
      for (const [key, value] of Object.entries(entry)) {
        if (
          key !== 'id' &&
          value !== '' &&
          (!Array.isArray(value) || value.length)
        )
          values[`${section}.${entry.id}.${key}`] = value;
      }
  }
  for (const [key, value] of Object.entries(profile.skills))
    if (value.length) values[`skills.${key}`] = value;
  return values;
}
export function reviewedProfile(
  candidate: ApplicantProfile,
  previous: ApplicantProfile,
  source: 'manual' | 'resume_import',
  label: string,
): ApplicantProfile {
  const result = validateProfile(candidate);
  result.id = previous.id;
  result.createdAt = previous.createdAt;
  const priorFacts = facts(previous);
  result.verification = {};
  for (const [path, value] of Object.entries(facts(result))) {
    if (
      source === 'resume_import' &&
      JSON.stringify(value) === JSON.stringify(priorFacts[path])
    ) {
      if (previous.verification[path])
        result.verification[path] = previous.verification[path]!;
      continue;
    }
    result.verification[path] =
      JSON.stringify(value) === JSON.stringify(priorFacts[path]) &&
      previous.verification[path]?.status === 'verified'
        ? previous.verification[path]!
        : {
            status: 'verified',
            source,
            sourceLabel: label,
            reviewedAt: new Date().toISOString(),
          };
  }
  result.updatedAt = new Date().toISOString();
  return result;
}
export function mergeImport(
  current: ApplicantProfile,
  candidate: ApplicantProfile,
  replaceConflicts: boolean,
): ApplicantProfile {
  const merged = structuredClone(current);
  for (const key of Object.keys(candidate.personal) as Array<
    keyof ApplicantProfile['personal']
  >) {
    const incoming = candidate.personal[key];
    if (!incoming) continue;
    if (
      merged.personal[key] &&
      merged.personal[key] !== incoming &&
      !replaceConflicts
    )
      throw new Error(
        'Contact information conflicts with your saved profile. Review and explicitly allow replacement.',
      );
    merged.personal[key] = incoming;
  }
  for (const section of [
    'education',
    'employment',
    'projects',
    'certifications',
  ] as const) {
    Object.assign(merged, {
      [section]: [
        ...merged[section],
        ...candidate[section].map((entry) => ({
          ...entry,
          id: crypto.randomUUID(),
        })),
      ],
    });
  }
  for (const key of Object.keys(candidate.skills) as Array<
    keyof ApplicantProfile['skills']
  >)
    merged.skills[key] = [
      ...new Set([...merged.skills[key], ...candidate.skills[key]]),
    ];
  return merged;
}
export function validateAnswers(
  input: ApplicantStore['answers'],
): ApplicantStore['answers'] {
  const answers = z.array(AnswerLibraryEntrySchema).max(1000).parse(input);
  const seen = new Set<string>();
  if (new Set(answers.map((answer) => answer.id)).size !== answers.length)
    throw new Error('Answer IDs must be unique.');
  for (const answer of answers) {
    answer.normalizedQuestion = answer.question
      .trim()
      .toLocaleLowerCase()
      .replace(/\s+/g, ' ');
    if (!answer.normalizedQuestion || seen.has(answer.normalizedQuestion))
      throw new Error('Questions must be nonempty and unique.');
    seen.add(answer.normalizedQuestion);
    if (answer.sensitiveCategory && answer.mode === 'ai_generated_allowed')
      throw new Error(
        'AI generation cannot be enabled for a protected demographic answer.',
      );
    if (
      ['verified_factual', 'reusable_custom'].includes(answer.mode) &&
      (answer.value === undefined || String(answer.value).trim() === '')
    )
      throw new Error(
        'Saved factual and custom answers need an explicit value.',
      );
    if (['always_ask', 'ai_generated_allowed'].includes(answer.mode))
      delete answer.value;
    answer.updatedAt = new Date().toISOString();
  }
  return answers;
}

// Zod v1 objects strip unknown keys. Refuse to migrate/read such records instead of losing data.
export function assertNoLostKeys(raw: unknown, parsed: unknown): void {
  if (!raw || typeof raw !== 'object' || !parsed || typeof parsed !== 'object')
    return;
  for (const key of Object.keys(raw)) {
    if (!Object.hasOwn(parsed, key))
      throw new Error(
        'Stored data contains unsupported fields. Original data was preserved.',
      );
    assertNoLostKeys(
      (raw as Record<string, unknown>)[key],
      (parsed as Record<string, unknown>)[key],
    );
  }
}
