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
export const ImportSuggestionSchema = z
  .object({
    path: z.string().min(1).max(500),
    confidence: z.enum(['high', 'medium', 'low']),
    score: z.number().min(0).max(1),
    sourceSection: z.string().min(1).max(100),
    sourceText: z.string().min(1).max(2_000),
  })
  .strict();
export type ImportSuggestion = z.infer<typeof ImportSuggestionSchema>;
export const ImportDecisionSchema = z.enum([
  'include',
  'exclude',
  'keep_saved',
  'use_proposed',
  'approve_separate',
]);
export const ImportDecisionsSchema = z
  .record(z.string().min(1).max(500), ImportDecisionSchema)
  .refine((value) => Object.keys(value).length <= 1_000, {
    message: 'Too many import review decisions.',
  });
export type ImportDecision = z.infer<typeof ImportDecisionSchema>;
export type ImportDecisions = z.infer<typeof ImportDecisionsSchema>;
export const DraftSchema = z
  .object({
    id: z.string().uuid(),
    resumeId: z.string().uuid(),
    status: z.literal('unverified'),
    text: z.string().max(200_000),
    createdAt: z.iso.datetime(),
    candidate: ApplicantProfileSchema,
    suggestions: z.array(ImportSuggestionSchema).max(2_000).default([]),
    decisions: ImportDecisionsSchema.default({}),
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
const stateNames = new Map(
  [
    ['Alabama', 'AL'],
    ['Alaska', 'AK'],
    ['Arizona', 'AZ'],
    ['Arkansas', 'AR'],
    ['California', 'CA'],
    ['Colorado', 'CO'],
    ['Connecticut', 'CT'],
    ['Delaware', 'DE'],
    ['Florida', 'FL'],
    ['Georgia', 'GA'],
    ['Hawaii', 'HI'],
    ['Idaho', 'ID'],
    ['Illinois', 'IL'],
    ['Indiana', 'IN'],
    ['Iowa', 'IA'],
    ['Kansas', 'KS'],
    ['Kentucky', 'KY'],
    ['Louisiana', 'LA'],
    ['Maine', 'ME'],
    ['Maryland', 'MD'],
    ['Massachusetts', 'MA'],
    ['Michigan', 'MI'],
    ['Minnesota', 'MN'],
    ['Mississippi', 'MS'],
    ['Missouri', 'MO'],
    ['Montana', 'MT'],
    ['Nebraska', 'NE'],
    ['Nevada', 'NV'],
    ['New Hampshire', 'NH'],
    ['New Jersey', 'NJ'],
    ['New Mexico', 'NM'],
    ['New York', 'NY'],
    ['North Carolina', 'NC'],
    ['North Dakota', 'ND'],
    ['Ohio', 'OH'],
    ['Oklahoma', 'OK'],
    ['Oregon', 'OR'],
    ['Pennsylvania', 'PA'],
    ['Rhode Island', 'RI'],
    ['South Carolina', 'SC'],
    ['South Dakota', 'SD'],
    ['Tennessee', 'TN'],
    ['Texas', 'TX'],
    ['Utah', 'UT'],
    ['Vermont', 'VT'],
    ['Virginia', 'VA'],
    ['Washington', 'WA'],
    ['West Virginia', 'WV'],
    ['Wisconsin', 'WI'],
    ['Wyoming', 'WY'],
    ['District of Columbia', 'DC'],
  ].map(
    ([name, abbreviation]) =>
      [name!.toLocaleLowerCase(), abbreviation!] as const,
  ),
);

export function contactValuesEquivalent(
  key: keyof ApplicantProfile['personal'],
  saved: string,
  proposed: string,
): boolean {
  if (key === 'phone') {
    const normalizePhone = (value: string) => {
      const digits = value.replace(/\D/g, '');
      return digits.length === 11 && digits.startsWith('1')
        ? digits.slice(1)
        : digits;
    };
    const savedPhone = normalizePhone(saved);
    const proposedPhone = normalizePhone(proposed);
    return savedPhone.length >= 7 && savedPhone === proposedPhone;
  }
  if (key === 'state') {
    const normalizeState = (value: string) => {
      const cleaned = value.trim().toLocaleLowerCase();
      return stateNames.get(cleaned) ?? cleaned.toUpperCase();
    };
    return normalizeState(saved) === normalizeState(proposed);
  }
  if (key === 'email')
    return (
      saved.trim().toLocaleLowerCase() === proposed.trim().toLocaleLowerCase()
    );
  return saved === proposed;
}

export function mergeImport(
  current: ApplicantProfile,
  candidate: ApplicantProfile,
  decisions: ImportDecisions = {},
): ApplicantProfile {
  const reviewedDecisions = ImportDecisionsSchema.parse(decisions);
  const merged = structuredClone(current);
  for (const key of Object.keys(candidate.personal) as Array<
    keyof ApplicantProfile['personal']
  >) {
    const incoming = candidate.personal[key];
    if (!incoming) continue;
    if (merged.personal[key]) {
      if (contactValuesEquivalent(key, merged.personal[key], incoming))
        continue;
      if (reviewedDecisions[`personal.${key}`] !== 'use_proposed') continue;
    } else if (reviewedDecisions[`personal.${key}`] === 'exclude') {
      continue;
    }
    merged.personal[key] = incoming;
  }
  for (const section of [
    'education',
    'employment',
    'projects',
    'certifications',
  ] as const) {
    const duplicateSummary = findImportDuplicates(current, candidate).filter(
      (duplicate) => duplicate.section === section,
    );
    const duplicatesByCandidate = new Map(
      duplicateSummary.map((duplicate) => [duplicate.candidateId, duplicate]),
    );
    Object.assign(merged, {
      [section]: [
        ...merged[section],
        ...candidate[section]
          .filter((entry) => {
            const duplicate = duplicatesByCandidate.get(entry.id);
            if (duplicate?.kind === 'exact') return false;
            const decision = reviewedDecisions[`${section}.${entry.id}`];
            if (duplicate?.kind === 'possible')
              return decision === 'approve_separate';
            return decision !== 'exclude';
          })
          .map((entry) => ({
            ...entry,
            id: crypto.randomUUID(),
          })),
      ],
    });
  }
  for (const key of Object.keys(candidate.skills) as Array<
    keyof ApplicantProfile['skills']
  >) {
    if (reviewedDecisions[`skills.${key}`] === 'exclude') continue;
    merged.skills[key] = [
      ...new Set([...merged.skills[key], ...candidate.skills[key]]),
    ];
  }
  return merged;
}

export function initializeImportDecisions(
  current: ApplicantProfile,
  candidate: ApplicantProfile,
  decisions: ImportDecisions = {},
): ImportDecisions {
  const initialized: ImportDecisions = {};
  for (const key of Object.keys(candidate.personal) as Array<
    keyof ApplicantProfile['personal']
  >) {
    const proposed = candidate.personal[key];
    if (!proposed) continue;
    const saved = current.personal[key];
    if (saved) {
      if (contactValuesEquivalent(key, saved, proposed)) {
        initialized[`personal.${key}`] = 'keep_saved';
        continue;
      }
      initialized[`personal.${key}`] =
        decisions[`personal.${key}`] === 'use_proposed'
          ? 'use_proposed'
          : 'keep_saved';
      continue;
    }
    initialized[`personal.${key}`] =
      decisions[`personal.${key}`] === 'exclude' ? 'exclude' : 'include';
  }
  const duplicates = findImportDuplicates(current, candidate);
  for (const section of [
    'education',
    'employment',
    'projects',
    'certifications',
  ] as const) {
    for (const entry of candidate[section]) {
      const path = `${section}.${entry.id}`;
      const duplicate = duplicates.find(
        (item) => item.section === section && item.candidateId === entry.id,
      );
      if (duplicate?.kind === 'exact') initialized[path] = 'exclude';
      else if (duplicate?.kind === 'possible')
        initialized[path] =
          decisions[path] === 'approve_separate'
            ? 'approve_separate'
            : 'exclude';
      else
        initialized[path] =
          decisions[path] === 'exclude' ? 'exclude' : 'include';
    }
  }
  for (const key of Object.keys(candidate.skills) as Array<
    keyof ApplicantProfile['skills']
  >) {
    if (!candidate.skills[key].length) continue;
    const path = `skills.${key}`;
    initialized[path] = decisions[path] === 'exclude' ? 'exclude' : 'include';
  }
  return initialized;
}

export type ImportDuplicate = {
  section: 'education' | 'employment' | 'projects' | 'certifications';
  candidateId: string;
  existingId: string;
  kind: 'exact' | 'possible';
  description: string;
};

function normalized(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findImportDuplicates(
  current: ApplicantProfile,
  candidate: ApplicantProfile,
): ImportDuplicate[] {
  const results: ImportDuplicate[] = [];
  const configs = {
    education: ['institution', 'degree'] as const,
    employment: ['employer', 'title'] as const,
    projects: ['name'] as const,
    certifications: ['certification'] as const,
  };
  for (const section of Object.keys(configs) as Array<keyof typeof configs>) {
    const keys = configs[section];
    for (const incoming of candidate[section]) {
      for (const saved of current[section]) {
        const incomingRecord = incoming as unknown as Record<string, unknown>;
        const savedRecord = saved as unknown as Record<string, unknown>;
        const comparisons = keys.map((key) => ({
          incoming: normalized(String(incomingRecord[key])),
          saved: normalized(String(savedRecord[key])),
        }));
        const primary = comparisons[0]!;
        if (!primary.incoming || primary.incoming !== primary.saved) continue;
        const exact = comparisons.every(
          (comparison) =>
            comparison.incoming && comparison.incoming === comparison.saved,
        );
        results.push({
          section,
          candidateId: incoming.id,
          existingId: saved.id,
          kind: exact ? 'exact' : 'possible',
          description: `${section}: ${String(incomingRecord[keys[0]])}`,
        });
        break;
      }
    }
  }
  return results;
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
    if (!answer.normalizedQuestion)
      throw new Error('Questions must be nonempty.');
    if (seen.has(answer.normalizedQuestion))
      throw new Error(
        'That question already exists in your Answer Library. Questions must be unique.',
      );
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
