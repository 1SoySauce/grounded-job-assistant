// @vitest-environment jsdom
import { File as NodeFile } from 'node:buffer';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ApplicantEditor } from '../src/pages/options/ApplicantEditor';
import { storageHarness } from './storageHarness';
import {
  getApplicant,
  saveImport,
  saveVerifiedProfile,
} from '../src/storage/applicantRepository';
import {
  addResume,
  getResume,
  listResumes,
} from '../src/storage/resumeRepository';
import { createImportDraft } from '../src/imports/extractCandidates';
import { parseResume } from '../src/imports/parseResume';

vi.mock('../src/imports/parseResume', () => ({
  parseResume: vi.fn(async () => 'taylor@example.com'),
}));
beforeEach(() => {
  storageHarness();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.mocked(parseResume).mockResolvedValue('taylor@example.com');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function file(): File {
  return new NodeFile(['%PDF-1.4 synthetic'], 'synthetic.pdf', {
    type: 'application/pdf',
  }) as unknown as File;
}

describe('resume management UI integration', () => {
  it('uploads bytes, extracts an unverified draft, and never updates profile automatically', async () => {
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    fireEvent.change(await screen.findByLabelText('New resume name'), {
      target: { value: 'IT Resume' },
    });
    fireEvent.change(screen.getByLabelText('PDF or DOCX file'), {
      target: { files: [file()] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Add resume and extract' }),
    );
    await screen.findByRole('heading', { name: 'Unverified import review' });
    const resumes = await listResumes();
    expect(resumes).toHaveLength(1);
    expect(resumes[0]!.displayName).toBe('IT Resume');
    expect((await getResume(resumes[0]!.id)).bytes.byteLength).toBe(
      file().size,
    );
    expect((await getApplicant()).profile.personal.email).toBe('');
    expect((await getApplicant()).imports[0]!.status).toBe('unverified');
  });
  it('renames resumes, changes categories, and requires explicit deletion', async () => {
    const resume = await addResume(file(), 'Original', []);
    const dirty = vi.fn();
    render(<ApplicantEditor section="Resumes" onDirty={dirty} />);
    fireEvent.change(await screen.findByLabelText('Resume name'), {
      target: { value: 'Renamed' },
    });
    const card = screen
      .getByRole('heading', { name: 'Original' })
      .closest('article')!;
    fireEvent.change(card.querySelector('textarea')!, {
      target: { value: 'IT\nSystems' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save resume metadata' }),
    );
    await screen.findByRole('heading', { name: 'Renamed' });
    expect((await getResume(resume.id)).metadata.targetRoles).toEqual([
      'IT',
      'Systems',
    ]);
    expect(
      screen.getByRole('button', { name: 'Delete resume' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Delete this file and metadata/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete resume' }));
    await waitFor(async () => expect(await listResumes()).toEqual([]));
    expect((await getApplicant()).profile.personal.email).toBe('');
  });
  it('retains the file and presents retry after a parser failure', async () => {
    vi.mocked(parseResume).mockRejectedValueOnce(
      new Error('Cannot extract this document.'),
    );
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    fireEvent.change(await screen.findByLabelText('New resume name'), {
      target: { value: 'Retained' },
    });
    fireEvent.change(screen.getByLabelText('PDF or DOCX file'), {
      target: { files: [file()] },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Add resume and extract' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot extract',
    );
    expect(await listResumes()).toHaveLength(1);
    expect((await getApplicant()).imports).toEqual([]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Extract for review: Retained' }),
    );
    await screen.findByRole('heading', { name: 'Unverified import review' });
    expect(await listResumes()).toHaveLength(1);
  });
  it('requires a second explicit choice before replacing a conflicting profile value', async () => {
    let data = await getApplicant();
    data.profile.personal.email = 'old@example.com';
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    const draft = createImportDraft(crypto.randomUUID(), 'new@example.com');
    await saveImport(draft, data.revision);
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Review unverified import/ }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the extracted information/,
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Confirm import into profile' }),
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Contact conflicts/);
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Replace the conflicting/ }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm import into profile' }),
    );
    await waitFor(async () =>
      expect((await getApplicant()).profile.personal.email).toBe(
        'new@example.com',
      ),
    );
  });
});
