import { z } from 'zod';
import { JobSeekerProfileSchema } from '../types/profile';
import {
  ApplicantStoreSchema,
  emptyApplicant,
  reviewedProfile,
  mergeImport,
  validateAnswers,
  assertNoLostKeys,
  type ApplicantStore,
  type ApplicantProfile,
  type ImportDraft,
  DraftSchema,
} from '../types/applicant';
import { STORAGE_KEYS } from './keys';
import { restrictStorageToTrustedContexts } from './security';

export const APPLICANT_KEY = 'gja.applicant.v2';
const legacySchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.iso.datetime(),
  value: JobSeekerProfileSchema,
});
export function migrateLegacy(raw: unknown): ApplicantStore {
  const parsed = legacySchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      'Stored Milestone 1 data is invalid or unsupported. Original data has been preserved.',
    );
  assertNoLostKeys(raw, parsed.data);
  const { preferences, answerLibrary, ...profile } = parsed.data.value;
  for (const [path, record] of Object.entries(profile.verification)) {
    const match =
      /^(education|employment|projects|certifications)\[(\d+)\]\.(.+)$/.exec(
        path,
      ) ??
      /^(education|employment|projects|certifications)\.(\d+)\.(.+)$/.exec(
        path,
      );
    if (match) {
      const entry =
        profile[
          match[1] as 'education' | 'employment' | 'projects' | 'certifications'
        ][Number(match[2])];
      if (entry) {
        profile.verification[`${match[1]}.${entry.id}.${match[3]}`] = record;
        delete profile.verification[path];
      }
    }
  }
  return ApplicantStoreSchema.parse({
    schemaVersion: 2,
    revision: 0,
    profile: { ...profile, schemaVersion: 2 },
    answers: answerLibrary,
    preferences,
    imports: [],
  });
}
async function readUnlocked(): Promise<ApplicantStore> {
  await restrictStorageToTrustedContexts();
  const stored = await chrome.storage.local.get([
    APPLICANT_KEY,
    STORAGE_KEYS.profile,
  ]);
  if (stored[APPLICANT_KEY] !== undefined) {
    const parsed = ApplicantStoreSchema.safeParse(stored[APPLICANT_KEY]);
    if (!parsed.success)
      throw new Error(
        'Stored applicant data is invalid or newer than this extension. No data was changed.',
      );
    assertNoLostKeys(stored[APPLICANT_KEY], parsed.data);
    return parsed.data;
  }
  const next =
    stored[STORAGE_KEYS.profile] === undefined
      ? emptyApplicant()
      : migrateLegacy(stored[STORAGE_KEYS.profile]);
  await chrome.storage.local.set({ [APPLICANT_KEY]: next });
  // Retain the original v1 record, byte-for-byte, for recovery.
  return next;
}
export async function getApplicant(): Promise<ApplicantStore> {
  return await navigator.locks.request('gja-applicant', readUnlocked);
}
async function update(
  revision: number,
  change: (current: ApplicantStore) => void,
): Promise<ApplicantStore> {
  return navigator.locks.request('gja-applicant', async () => {
    const current = await readUnlocked();
    if (current.revision !== revision)
      throw new Error(
        'Data changed in another window. Reload this section before saving. Your edits have not been saved.',
      );
    change(current);
    current.revision++;
    const validated = ApplicantStoreSchema.parse(current);
    await chrome.storage.local.set({ [APPLICANT_KEY]: validated });
    return validated;
  });
}
export function saveVerifiedProfile(
  profile: ApplicantProfile,
  revision: number,
  confirmed: boolean,
) {
  if (!confirmed)
    return Promise.reject(
      new Error('Review and confirm the profile before saving.'),
    );
  return update(revision, (current) => {
    current.profile = reviewedProfile(
      profile,
      current.profile,
      'manual',
      'Profile editor',
    );
  });
}
export function saveAnswers(
  answers: ApplicantStore['answers'],
  revision: number,
  confirmed: boolean,
) {
  if (!confirmed)
    return Promise.reject(
      new Error('Confirm that these are your explicitly supplied answers.'),
    );
  return update(revision, (current) => {
    current.answers = validateAnswers(answers);
  });
}
export function savePreferences(
  preferences: ApplicantStore['preferences'],
  revision: number,
) {
  return update(revision, (current) => {
    if (
      preferences.minimumSalary !== null &&
      preferences.desiredSalary !== null &&
      preferences.desiredSalary < preferences.minimumSalary
    )
      throw new Error('Desired salary must be at least the minimum salary.');
    current.preferences = preferences;
  });
}
export function saveImport(draft: ImportDraft, revision: number) {
  return update(revision, (current) => {
    const parsed = DraftSchema.parse(draft);
    parsed.candidate.verification = {};
    const index = current.imports.findIndex((x) => x.id === parsed.id);
    if (index < 0) current.imports.push(parsed);
    else current.imports[index] = parsed;
  });
}
export function discardImport(id: string, revision: number) {
  return update(revision, (current) => {
    current.imports = current.imports.filter((x) => x.id !== id);
  });
}
export function confirmImport(
  draft: ImportDraft,
  revision: number,
  confirmed: boolean,
) {
  if (!confirmed)
    return Promise.reject(
      new Error('Explicit review confirmation is required.'),
    );
  return update(revision, (current) => {
    const stored = current.imports.find((x) => x.id === draft.id);
    if (!stored || stored.resumeId !== draft.resumeId)
      throw new Error(
        'This import is no longer available. Reload the section.',
      );
    const parsed = DraftSchema.parse(draft);
    const merged = mergeImport(
      current.profile,
      parsed.candidate,
      parsed.decisions,
    );
    current.profile = reviewedProfile(
      merged,
      current.profile,
      'resume_import',
      `Resume ${stored.resumeId}`,
    );
    current.imports = current.imports.filter((x) => x.id !== draft.id);
  });
}
