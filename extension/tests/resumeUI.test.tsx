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

function education(institution: string) {
  return {
    id: crypto.randomUUID(),
    institution,
    degree: 'BS',
    major: 'Information Systems',
    concentration: '',
    minor: '',
    gpa: '',
    startDate: '',
    graduationDate: '2025',
    location: 'Sample City, NY',
  };
}

function project(name: string, description = '') {
  return {
    id: crypto.randomUUID(),
    name,
    description,
    technologies: ['TypeScript'],
    responsibilities: ['Built sanitized review workflows.'],
    accomplishments: [],
    githubUrl: '',
    deployedUrl: '',
  };
}

async function openReview() {
  fireEvent.click(
    await screen.findByRole('button', { name: /Review unverified import/ }),
  );
  await screen.findByRole('heading', { name: 'Unverified import review' });
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
  it('defaults a conflicting field to keep saved while including a new scalar', async () => {
    let data = await getApplicant();
    data.profile.personal.email = 'old@example.com';
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    const draft = createImportDraft(crypto.randomUUID(), 'new@example.com');
    draft.candidate.personal.city = 'Sample City';
    await saveImport(draft, data.revision);
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Review unverified import/ }),
    );
    expect(screen.getByLabelText('Decision for Email')).toHaveValue(
      'keep_saved',
    );
    expect(screen.getByLabelText('Decision for City')).toHaveValue('include');
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the extracted information/,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm import into profile' }),
    );
    await waitFor(async () =>
      expect((await getApplicant()).profile.personal).toMatchObject({
        email: 'old@example.com',
        city: 'Sample City',
      }),
    );
  });
  it('uses one proposed conflict independently and resets confirmation on decision changes', async () => {
    let data = await getApplicant();
    data.profile.personal.email = 'saved@example.test';
    data.profile.personal.phone = '555-111-2222';
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    const draft = createImportDraft(crypto.randomUUID(), '');
    draft.candidate.personal.email = 'proposed@example.test';
    draft.candidate.personal.phone = '555-333-4444';
    await saveImport(draft, data.revision);
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    await openReview();
    const confirmation = screen.getByRole('checkbox', {
      name: /I reviewed the extracted information/,
    });
    fireEvent.click(confirmation);
    expect(confirmation).toBeChecked();
    fireEvent.change(screen.getByLabelText('Decision for Email'), {
      target: { value: 'use_proposed' },
    });
    expect(confirmation).not.toBeChecked();
    expect(screen.getByLabelText('Decision for Phone')).toHaveValue(
      'keep_saved',
    );
    fireEvent.click(confirmation);
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm import into profile' }),
    );
    await waitFor(async () =>
      expect((await getApplicant()).profile.personal).toMatchObject({
        email: 'proposed@example.test',
        phone: '555-111-2222',
      }),
    );
  });
  it('declines individual new scalar and history-record proposals', async () => {
    const draft = createImportDraft(crypto.randomUUID(), '');
    draft.candidate.personal.country = 'Canada';
    draft.candidate.education = [
      education('Example Technical College'),
      education('Sample State University'),
    ];
    draft.candidate.projects = [
      project('Synthetic Queue Console'),
      project('Synthetic Audit Portal'),
    ];
    await saveImport(draft, 0);
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    await openReview();
    fireEvent.change(screen.getByLabelText('Decision for Country'), {
      target: { value: 'exclude' },
    });
    fireEvent.change(screen.getByLabelText('Decision for Education 1'), {
      target: { value: 'exclude' },
    });
    fireEvent.change(screen.getByLabelText('Decision for Project 2'), {
      target: { value: 'exclude' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the extracted information/,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm import into profile' }),
    );
    await waitFor(async () => {
      const profile = (await getApplicant()).profile;
      expect(profile.personal.country).toBe('');
      expect(profile.education.map(({ institution }) => institution)).toEqual([
        'Sample State University',
      ]);
      expect(profile.projects.map(({ name }) => name)).toEqual([
        'Synthetic Queue Console',
      ]);
    });
  });
  it('persists field and skill decisions after save, reopen, and page reload', async () => {
    const draft = createImportDraft(crypto.randomUUID(), '');
    draft.candidate.personal.city = 'Sample City';
    draft.candidate.skills.programming = ['TypeScript'];
    await saveImport(draft, 0);
    const first = render(
      <ApplicantEditor section="Resumes" onDirty={() => {}} />,
    );
    await openReview();
    fireEvent.change(screen.getByLabelText('Decision for City'), {
      target: { value: 'exclude' },
    });
    fireEvent.change(
      screen.getByLabelText('Decision for Skills — Programming'),
      { target: { value: 'exclude' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save unverified draft' }),
    );
    await screen.findByRole('button', { name: /Review unverified import/ });
    expect((await getApplicant()).imports[0]!.decisions).toMatchObject({
      'personal.city': 'exclude',
      'skills.programming': 'exclude',
    });
    await openReview();
    expect(screen.getByLabelText('Decision for City')).toHaveValue('exclude');
    first.unmount();
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    await openReview();
    expect(screen.getByLabelText('Decision for City')).toHaveValue('exclude');
    expect(
      screen.getByLabelText('Decision for Skills — Programming'),
    ).toHaveValue('exclude');
  });
  it('shows exact and possible duplicate decisions per record', async () => {
    let data = await getApplicant();
    data.profile.education = [education('Example Technical College')];
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    const draft = createImportDraft(crypto.randomUUID(), '');
    draft.candidate.education = [
      { ...data.profile.education[0]!, id: crypto.randomUUID() },
      {
        ...data.profile.education[0]!,
        id: crypto.randomUUID(),
        degree: 'MS',
      },
    ];
    await saveImport(draft, data.revision);
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    await openReview();
    expect(screen.getByText('Exact duplicate — skipped')).toBeInTheDocument();
    const possible = screen.getByLabelText('Decision for Education 2');
    expect(possible).toHaveValue('exclude');
    expect(possible).toHaveTextContent('Add as separate record');
    fireEvent.change(possible, { target: { value: 'approve_separate' } });
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the extracted information/,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm import into profile' }),
    );
    await waitFor(async () => {
      const records = (await getApplicant()).profile.education;
      expect(records).toHaveLength(2);
      expect(records.map(({ degree }) => degree)).toEqual(['BS', 'MS']);
    });
  });
  it('renders friendly indexed labels, long values, and provenance without UUIDs', async () => {
    const draft = createImportDraft(
      crypto.randomUUID(),
      `EDUCATION
Example Technical College
BS Information Systems | 2025
PROJECTS
Synthetic Review Workspace
- Built a deliberately long but sanitized responsibility that remains fully visible for careful review without truncating the proposed information.`,
    );
    await saveImport(draft, 0);
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    await openReview();
    expect(screen.getByText('Education 1 — Institution')).toBeInTheDocument();
    expect(screen.getByText('Project 1 — Name')).toBeInTheDocument();
    expect(screen.queryByText(draft.candidate.education[0]!.id)).toBeNull();
    expect(screen.queryByText(draft.candidate.projects[0]!.id)).toBeNull();
    expect(
      screen.getAllByText(/deliberately long but sanitized responsibility/)
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText('UNVERIFIED').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/From:/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('region', { name: 'Profile change decisions' }),
    ).toHaveClass('review-table-scroll');
    expect(
      screen.getByRole('columnheader', { name: 'Decision' }),
    ).toBeVisible();
  });
  it('keeps the four-column decision table reachable at a narrow viewport', async () => {
    vi.stubGlobal('innerWidth', 420);
    const draft = createImportDraft(crypto.randomUUID(), '');
    draft.candidate.projects = [
      project(
        'Synthetic Responsive Review',
        'A long sanitized description that should wrap inside its table cell instead of forcing adjacent labels into character-by-character columns.',
      ),
    ];
    await saveImport(draft, 0);
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    await openReview();
    const region = screen.getByRole('region', {
      name: 'Profile change decisions',
    });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region.querySelector('table')).toHaveClass('review-table');
    expect(screen.getByLabelText('Decision for Project 1')).toBeVisible();
    expect(screen.getAllByRole('columnheader')).toHaveLength(4);
  });
  it('does not show a conflict for equivalent phone and state formatting', async () => {
    let data = await getApplicant();
    data.profile.personal.phone = '(555) 123-4567';
    data.profile.personal.state = 'New York';
    data = await saveVerifiedProfile(data.profile, data.revision, true);
    const draft = createImportDraft(crypto.randomUUID(), '');
    draft.candidate.personal.phone = '555-123-4567';
    draft.candidate.personal.state = 'NY';
    await saveImport(draft, data.revision);
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Review unverified import/ }),
    );
    expect(screen.getAllByText('Equivalent — no change')).toHaveLength(2);
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the extracted information/,
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Confirm import into profile' }),
    ).toBeEnabled();
  });
  it('shows grouped unverified confidence and provenance and resets confirmation after edits', async () => {
    const draft = createImportDraft(
      crypto.randomUUID(),
      'Taylor Example\ntaylor@example.com\nSKILLS\nLanguages: TypeScript',
    );
    await saveImport(draft, 0);
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Review unverified import/ }),
    );
    expect(screen.getAllByText('UNVERIFIED').length).toBeGreaterThan(0);
    expect(screen.getByText(/high 99%/i)).toBeInTheDocument();
    expect(screen.getByText(/From: “taylor@example.com”/)).toBeInTheDocument();
    const confirmation = screen.getByRole('checkbox', {
      name: /I reviewed the extracted information/,
    });
    fireEvent.click(confirmation);
    expect(confirmation).toBeChecked();
    fireEvent.change(screen.getByLabelText('First Name'), {
      target: { value: 'Edited' },
    });
    expect(confirmation).not.toBeChecked();
    expect((await getApplicant()).profile.personal.firstName).toBe('');
  });
});
