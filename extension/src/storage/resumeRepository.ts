import { z } from 'zod';
import { ResumeMetadataSchema } from '../types/resume';

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;
export const ResumeRecordSchema = ResumeMetadataSchema.extend({
  schemaVersion: z.literal(2),
  size: z.number().int().positive().max(MAX_RESUME_BYTES),
  lastModified: z.number().nonnegative(),
  revision: z.number().int().nonnegative(),
  verified: z.literal(false),
}).strict();
export type ResumeRecord = z.infer<typeof ResumeRecordSchema>;
const DATABASE = 'gja-resumes';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('resumes', { keyPath: 'metadata.id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      reject(
        new Error(
          'Resume storage could not be opened. Existing data was preserved.',
        ),
      );
    request.onblocked = () =>
      reject(new Error('Close other extension settings tabs and retry.'));
  });
}
type StoredResume = { metadata: ResumeRecord; bytes: ArrayBuffer };
const arrayBufferSchema = z.custom<ArrayBuffer>((value) => {
  try {
    // The intrinsic brand check accepts structured clones from another realm,
    // but rejects objects merely pretending to have byteLength.
    Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      'byteLength',
    )!.get!.call(value);
    return true;
  } catch {
    return false;
  }
});
function validateStored(raw: unknown): StoredResume {
  const parsed = z
    .object({ metadata: ResumeRecordSchema, bytes: arrayBufferSchema })
    .strict()
    .safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.bytes.byteLength !== parsed.data.metadata.size
  )
    throw new Error(
      'Stored resume data is damaged. It has not been deleted or replaced.',
    );
  return parsed.data;
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (
    store: IDBObjectStore,
    done: (value: T) => void,
    fail: (error: Error) => void,
  ) => void,
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('resumes', mode);
    let result: T;
    let failure: Error | undefined;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        failure ??
          new Error(
            'Resume storage operation failed. Check available disk space and retry.',
          ),
      );
    };
    const fail = (error: Error) => {
      failure = error;
      tx.abort();
    };
    try {
      action(
        tx.objectStore('resumes'),
        (value) => {
          result = value;
        },
        fail,
      );
    } catch (error) {
      fail(
        error instanceof Error ? error : new Error('Resume storage failed.'),
      );
    }
  });
}
export async function validateResumeFile(
  file: File,
): Promise<{ bytes: ArrayBuffer; mimeType: ResumeRecord['mimeType'] }> {
  if (!file.size || file.size > MAX_RESUME_BYTES)
    throw new Error('Choose a nonempty PDF or DOCX file up to 10 MB.');
  const bytes = await file.arrayBuffer();
  const header = new Uint8Array(bytes.slice(0, 5));
  const pdf =
    file.name.toLowerCase().endsWith('.pdf') &&
    new TextDecoder().decode(header) === '%PDF-';
  const docx =
    file.name.toLowerCase().endsWith('.docx') &&
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 3 &&
    header[3] === 4;
  const mimeType = pdf
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (
    (!pdf && !docx) ||
    (file.type &&
      file.type !== mimeType &&
      file.type !== 'application/octet-stream')
  )
    throw new Error(
      'File extension, type, or signature is not a supported PDF/DOCX.',
    );
  return { bytes, mimeType };
}
export async function addResume(
  file: File,
  displayName: string,
  targetRoles: string[],
): Promise<ResumeRecord> {
  const { bytes, mimeType } = await validateResumeFile(file);
  const now = new Date().toISOString();
  const metadata = ResumeRecordSchema.parse({
    schemaVersion: 2,
    id: crypto.randomUUID(),
    displayName,
    fileName: file.name,
    mimeType,
    targetRoles,
    verified: false,
    createdAt: now,
    updatedAt: now,
    size: bytes.byteLength,
    lastModified: file.lastModified,
    revision: 0,
  });
  return transaction('readwrite', (store, done) => {
    store.add({ metadata, bytes });
    done(metadata);
  });
}
export function listResumes(): Promise<ResumeRecord[]> {
  return transaction('readonly', (store, done, fail) => {
    const request = store.getAll();
    request.onsuccess = () => {
      try {
        done(
          (request.result as unknown[]).map(
            (raw) => validateStored(raw).metadata,
          ),
        );
      } catch (error) {
        fail(error as Error);
      }
    };
  });
}
export function getResume(id: string): Promise<StoredResume> {
  return transaction('readonly', (store, done, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('Resume no longer exists.');
        done(validateStored(request.result));
      } catch (error) {
        fail(error as Error);
      }
    };
  });
}
export function updateResume(
  id: string,
  revision: number,
  displayName: string,
  targetRoles: string[],
): Promise<ResumeRecord> {
  return transaction('readwrite', (store, done, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        const existing = validateStored(request.result);
        if (existing.metadata.revision !== revision)
          throw new Error(
            'Resume changed in another tab. Reload before saving.',
          );
        const metadata = ResumeRecordSchema.parse({
          ...existing.metadata,
          displayName,
          targetRoles,
          updatedAt: new Date().toISOString(),
          revision: revision + 1,
        });
        store.put({ ...existing, metadata });
        done(metadata);
      } catch (error) {
        fail(error as Error);
      }
    };
  });
}
export function deleteResume(id: string, revision: number): Promise<void> {
  return transaction('readwrite', (store, done, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        const existing = validateStored(request.result);
        if (existing.metadata.revision !== revision)
          throw new Error(
            'Resume changed in another tab. Reload before deleting.',
          );
        store.delete(id);
        done(undefined);
      } catch (error) {
        fail(error as Error);
      }
    };
  });
}
