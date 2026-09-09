// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ApplicantEditor } from '../src/pages/options/ApplicantEditor';
import { App } from '../src/pages/options/App';
import { storageHarness } from './storageHarness';
import {
  APPLICANT_KEY,
  getApplicant,
  saveImport,
} from '../src/storage/applicantRepository';
import { createImportDraft } from '../src/imports/extractCandidates';
import { emptyApplicant } from '../src/types/applicant';

beforeEach(() => {
  storageHarness();
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  });
describe('applicant settings UI', () => {
  it('requires review and resets confirmation after editing; persists verified contact values', async () => {
    const dirty = vi.fn();
    render(<ApplicantEditor section="My Profile" onDirty={dirty} />);
    await screen.findByLabelText('First Name');
    const save = screen.getByRole('button', { name: 'Save verified profile' });
    expect(save).toBeDisabled();
    change('First Name', 'Taylor');
    change('Last Name', 'Example');
    change('Email', 'taylor@example.com');
    const confirm = screen.getByRole('checkbox', {
      name: /I reviewed these values/,
    });
    fireEvent.click(confirm);
    expect(save).toBeEnabled();
    change('City', 'Boston');
    expect(save).toBeDisabled();
    fireEvent.click(confirm);
    fireEvent.click(save);
    await screen.findByText('Saved locally.');
    expect((await getApplicant()).profile.personal.city).toBe('Boston');
    expect(dirty).toHaveBeenLastCalledWith(false);
  });
  it('adds and removes education, employment, projects and certifications in the editor', async () => {
    render(<ApplicantEditor section="My Profile" onDirty={() => {}} />);
    await screen.findByLabelText('First Name');
    for (const section of [
      'education',
      'employment',
      'projects',
      'certifications',
    ]) {
      fireEvent.click(screen.getByRole('button', { name: `Add ${section}` }));
      expect(
        screen.getByRole('button', { name: `Remove ${section} 1` }),
      ).toBeVisible();
    }
    change('Institution', 'College');
    change('Employer', 'Company');
    change('Name', 'Lab');
    change('Certification', 'Credential');
    fireEvent.click(
      screen.getByRole('checkbox', { name: /I reviewed these values/ }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save verified profile' }),
    );
    await screen.findByText('Saved locally.');
    expect((await getApplicant()).profile.education[0]!.institution).toBe(
      'College',
    );
    for (const section of [
      'education',
      'employment',
      'projects',
      'certifications',
    ])
      fireEvent.click(
        screen.getByRole('button', { name: `Remove ${section} 1` }),
      );
    fireEvent.click(
      screen.getByRole('checkbox', { name: /I reviewed these values/ }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save verified profile' }),
    );
    await waitFor(async () =>
      expect((await getApplicant()).profile.education).toEqual([]),
    );
  });
  it('edits skills and job preferences with multiline values and workplace choices', async () => {
    const { unmount } = render(
      <ApplicantEditor section="My Profile" onDirty={() => {}} />,
    );
    const skills = await screen.findByRole('group', { name: 'Skills' });
    fireEvent.change(within(skills).getByLabelText(/Programming/), {
      target: { value: 'Python\nTypeScript' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /I reviewed these values/ }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save verified profile' }),
    );
    await screen.findByText('Saved locally.');
    expect((await getApplicant()).profile.skills.programming).toEqual([
      'Python',
      'TypeScript',
    ]);
    unmount();
    render(<ApplicantEditor section="Job Preferences" onDirty={() => {}} />);
    await screen.findByLabelText(/Desired Titles/);
    fireEvent.change(screen.getByLabelText(/Desired Titles/), {
      target: { value: 'Analyst\nSupport' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'remote' }));
    change('Minimum Salary', '50000');
    change('Desired Salary', '40000');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByRole('alert');
    expect((await getApplicant()).preferences.minimumSalary).toBeNull();
    change('Desired Salary', '60000');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Saved locally.');
    expect((await getApplicant()).preferences.desiredTitles).toEqual([
      'Analyst',
      'Support',
    ]);
    expect((await getApplicant()).preferences.workplacePreferences).toEqual([
      'remote',
    ]);
  });
  it('defaults new answers to always ask and blocks demographic generation on save', async () => {
    render(<ApplicantEditor section="Answer Library" onDirty={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add answer' }));
    expect(screen.getByLabelText('Answer type')).toHaveValue('always_ask');
    change('Question', 'Gender?');
    fireEvent.change(screen.getByLabelText('Protected demographic category'), {
      target: { value: 'gender' },
    });
    fireEvent.change(screen.getByLabelText('Answer type'), {
      target: { value: 'ai_generated_allowed' },
    });
    fireEvent.click(
      screen.getByRole('checkbox', { name: /I reviewed these values/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/demographic/);
    fireEvent.change(screen.getByLabelText('Answer type'), {
      target: { value: 'reusable_custom' },
    });
    change('Exact answer', 'Prefer not to answer');
    fireEvent.click(
      screen.getByRole('checkbox', { name: /I reviewed these values/ }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Saved locally.');
    expect((await getApplicant()).answers[0]!.value).toBe(
      'Prefer not to answer',
    );
  });
  it('shows unverified extracted text, supports draft saves, and requires separate confirmation', async () => {
    const draft = createImportDraft(
      crypto.randomUUID(),
      'Extracted text taylor@example.com',
    );
    await saveImport(draft, 0);
    render(<ApplicantEditor section="Resumes" onDirty={() => {}} />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Review unverified import/ }),
    );
    expect(screen.getByText('Extracted text taylor@example.com')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Confirm import into profile' }),
    ).toBeDisabled();
    change('First Name', 'Taylor');
    fireEvent.click(
      screen.getByRole('button', { name: 'Save unverified draft' }),
    );
    await screen.findByText('Saved locally.');
    expect((await getApplicant()).profile.personal.firstName).toBe('');
    fireEvent.click(
      screen.getByRole('button', { name: /Review unverified import/ }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /I reviewed the extracted information/,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm import into profile' }),
    );
    await waitFor(async () =>
      expect((await getApplicant()).profile.personal.firstName).toBe('Taylor'),
    );
  });
  it('keeps corrupted data visible as an error and disables editing', async () => {
    storageHarness({ [APPLICANT_KEY]: { schemaVersion: 999 } });
    render(<ApplicantEditor section="My Profile" onDirty={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No data was changed/,
    );
    expect(
      screen.queryByRole('button', { name: 'Save verified profile' }),
    ).not.toBeInTheDocument();
  });
  it('rejects stale UI saves with a recoverable message and retains the local edits', async () => {
    const data = emptyApplicant();
    const storage = storageHarness({ [APPLICANT_KEY]: data });
    render(<ApplicantEditor section="My Profile" onDirty={() => {}} />);
    await screen.findByLabelText('First Name');
    storage.records[APPLICANT_KEY] = { ...data, revision: 1 };
    change('First Name', 'Unsaved');
    fireEvent.click(
      screen.getByRole('checkbox', { name: /I reviewed these values/ }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Save verified profile' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /another window/,
    );
    expect(screen.getByLabelText('First Name')).toHaveValue('Unsaved');
  });
  it('enables only the four new navigation sections and guards unsaved edits', async () => {
    render(<App />);
    for (const name of [
      'My Profile',
      'Resumes',
      'Answer Library',
      'Job Preferences',
    ])
      expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /Applications\s*Soon/ }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'My Profile' }));
    await screen.findByLabelText('First Name');
    change('First Name', 'Unsaved');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Resumes' }));
    expect(screen.getByLabelText('First Name')).toHaveValue('Unsaved');
  });
});
