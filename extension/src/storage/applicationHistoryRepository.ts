import { z } from 'zod';
import {
  ApplicationRecordSchema,
  type ApplicationRecord,
} from '../types/application';
import { STORAGE_KEYS } from './keys';

const StoredHistorySchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.iso.datetime(),
  value: z.array(ApplicationRecordSchema).max(5_000),
});

export async function getApplicationHistory(): Promise<ApplicationRecord[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.applications);
  const raw = result[STORAGE_KEYS.applications];

  if (raw === undefined) {
    return [];
  }

  const parsed = StoredHistorySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      'Stored application history is invalid. No data was changed.',
    );
  }

  return parsed.data.value;
}

export async function saveApplicationHistory(
  applications: ApplicationRecord[],
): Promise<void> {
  const validated = z
    .array(ApplicationRecordSchema)
    .max(5_000)
    .parse(applications);
  await chrome.storage.local.set({
    [STORAGE_KEYS.applications]: {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      value: validated,
    },
  });
}
