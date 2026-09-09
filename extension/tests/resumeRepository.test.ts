import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addResume,
  deleteResume,
  getResume,
  listResumes,
  MAX_RESUME_BYTES,
  updateResume,
  validateResumeFile,
} from '../src/storage/resumeRepository';

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
});
const pdf = () =>
  new File(['%PDF-1.4\nfixture'], 'sample.pdf', {
    type: 'application/pdf',
    lastModified: 123,
  });
describe('IndexedDB resume storage', () => {
  it('stores multiple files and exact bytes across reopened database connections', async () => {
    const a = await addResume(pdf(), 'IT support', ['IT']);
    const b = await addResume(pdf(), 'Systems', ['Systems']);
    expect((await listResumes()).map((row) => row.id)).toEqual(
      expect.arrayContaining([a.id, b.id]),
    );
    expect(new Uint8Array((await getResume(a.id)).bytes)).toEqual(
      new Uint8Array(await pdf().arrayBuffer()),
    );
    expect(a.lastModified).toBe(123);
    expect(a.size).toBe(pdf().size);
    expect(a.verified).toBe(false);
  });
  it('renames and edits metadata without altering the file', async () => {
    const created = await addResume(pdf(), 'Original', []);
    const updated = await updateResume(
      created.id,
      created.revision,
      'Renamed',
      ['Data'],
    );
    expect(updated.displayName).toBe('Renamed');
    expect(updated.targetRoles).toEqual(['Data']);
    expect(updated.fileName).toBe('sample.pdf');
    expect(updated.revision).toBe(1);
    expect(new TextDecoder().decode((await getResume(created.id)).bytes)).toBe(
      '%PDF-1.4\nfixture',
    );
    await expect(updateResume(created.id, 0, 'Stale', [])).rejects.toThrow(
      /another tab/,
    );
    await expect(deleteResume(created.id, 0)).rejects.toThrow(/another tab/);
  });
  it('deletes binary and metadata together while preserving other resumes', async () => {
    const a = await addResume(pdf(), 'A', []);
    const b = await addResume(pdf(), 'B', []);
    await deleteResume(a.id, a.revision);
    expect(await listResumes()).toEqual([b]);
    await expect(getResume(a.id)).rejects.toThrow(/no longer/);
  });
  it('accepts DOCX signature and records correct MIME when browser type is empty', async () => {
    const file = new File(
      [new Uint8Array([0x50, 0x4b, 3, 4, 0])],
      'resume.docx',
    );
    const record = await addResume(file, 'DOCX', []);
    expect(record.mimeType).toContain('wordprocessingml');
  });
  it.each([
    new File(['bad'], 'resume.pdf', { type: 'application/pdf' }),
    new File(['%PDF-1.4'], 'resume.exe'),
    new File(['%PDF-1.4'], 'resume.pdf', { type: 'text/plain' }),
    new File([], 'empty.pdf'),
  ])('rejects invalid file $name without storing it', async (file) => {
    await expect(addResume(file, 'Invalid', [])).rejects.toThrow();
    expect(await listResumes()).toEqual([]);
  });
  it('rejects oversized files and blank metadata', async () => {
    await expect(
      validateResumeFile(
        new File([new Uint8Array(MAX_RESUME_BYTES + 1)], 'large.pdf'),
      ),
    ).rejects.toThrow(/10 MB/);
    await expect(addResume(pdf(), ' ', [])).rejects.toThrow();
    expect(await listResumes()).toEqual([]);
  });
  it('reports damaged stored binary without silently deleting or overwriting it', async () => {
    const created = await addResume(pdf(), 'Original', []);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('gja-resumes', 1);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('resumes', 'readwrite');
        tx.objectStore('resumes').put({
          metadata: created,
          bytes: new ArrayBuffer(1),
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    await expect(listResumes()).rejects.toThrow(/damaged/);
    await expect(
      updateResume(created.id, 0, 'Replacement', []),
    ).rejects.toThrow(/damaged/);
    await expect(deleteResume(created.id, 0)).rejects.toThrow(/damaged/);
  });
});
