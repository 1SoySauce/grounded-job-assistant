import { z } from 'zod';
import {
  createEmptyProfile,
  JobSeekerProfileSchema,
  type JobSeekerProfile,
} from '../types/profile';
import { STORAGE_KEYS } from './keys';

const StoredProfileSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.iso.datetime(),
  value: JobSeekerProfileSchema,
});

export async function getProfile(): Promise<JobSeekerProfile | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.profile);
  const raw = result[STORAGE_KEYS.profile];

  if (raw === undefined) {
    return null;
  }

  const parsed = StoredProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('Stored profile data is invalid. No data was changed.');
  }

  return parsed.data.value;
}

export async function saveProfile(profile: JobSeekerProfile): Promise<void> {
  const validated = JobSeekerProfileSchema.parse({
    ...profile,
    updatedAt: new Date().toISOString(),
  });

  await chrome.storage.local.set({
    [STORAGE_KEYS.profile]: {
      schemaVersion: 1,
      updatedAt: validated.updatedAt,
      value: validated,
    },
  });
}

export async function getOrCreateProfile(): Promise<JobSeekerProfile> {
  const existing = await getProfile();
  if (existing) {
    return existing;
  }

  const created = createEmptyProfile();
  await saveProfile(created);
  return created;
}
