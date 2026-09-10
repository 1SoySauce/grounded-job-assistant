import { useEffect, useState } from 'react';
import {
  addResume,
  deleteResume,
  getResume,
  listResumes,
  updateResume,
  type ResumeRecord,
} from '../../storage/resumeRepository';
import {
  saveImport,
  discardImport,
  confirmImport,
} from '../../storage/applicantRepository';
import { createImportDraft } from '../../imports/extractCandidates';
import {
  type ApplicantStore,
  type ApplicantProfile,
  type ImportDecision,
  type ImportDraft,
  facts,
  findImportDuplicates,
  contactValuesEquivalent,
  initializeImportDecisions,
} from '../../types/applicant';
import { ProfileFields } from './ProfileFields';
import { cleanLists, labelFor } from './editorUtils';
import { toErrorMessage } from '../../utils/errors';

function suggestionIsPresent(
  candidate: ImportDraft['candidate'],
  path: string,
): boolean {
  const [section, recordOrField, field] = path.split('.');
  let value: unknown;
  if (section === 'personal')
    value =
      candidate.personal[recordOrField as keyof typeof candidate.personal];
  else if (section === 'skills')
    value = candidate.skills[recordOrField as keyof typeof candidate.skills];
  else if (
    section === 'education' ||
    section === 'employment' ||
    section === 'projects' ||
    section === 'certifications'
  ) {
    const record = candidate[section].find(
      (entry) => entry.id === recordOrField,
    );
    value = record
      ? (record as unknown as Record<string, unknown>)[field ?? '']
      : undefined;
  }
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

const historySections = [
  'education',
  'employment',
  'projects',
  'certifications',
] as const;

function historySectionLabel(section: (typeof historySections)[number]) {
  return {
    education: 'Education',
    employment: 'Employment',
    projects: 'Project',
    certifications: 'Certification',
  }[section];
}

function friendlyPathLabel(path: string, profile: ApplicantProfile): string {
  const [section, recordOrField, field] = path.split('.');
  if (section === 'personal') return labelFor(recordOrField ?? path);
  if (section === 'skills')
    return `Skills — ${labelFor(recordOrField ?? path)}`;
  if (historySections.includes(section as (typeof historySections)[number])) {
    const historySection = section as (typeof historySections)[number];
    const index = profile[historySection].findIndex(
      (entry) => entry.id === recordOrField,
    );
    return `${historySectionLabel(historySection)} ${Math.max(index, 0) + 1} — ${labelFor(field ?? 'entry')}`;
  }
  return labelFor(field ?? recordOrField ?? path);
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function recordSummary(
  entry: { id: string } & Record<string, unknown>,
): string {
  return Object.entries(entry)
    .filter(
      ([key, value]) =>
        key !== 'id' &&
        value !== '' &&
        value !== false &&
        (!Array.isArray(value) || value.length > 0),
    )
    .map(([key, value]) => `${labelFor(key)}: ${displayValue(value)}`)
    .join('\n');
}

type ReviewRow = {
  key: string;
  label: string;
  saved: string;
  proposed: string;
  decision: ImportDecision;
  choices?: Array<{ value: ImportDecision; label: string }>;
  status?: string;
};

function reviewRows(
  draft: ImportDraft,
  current: ApplicantProfile,
): ReviewRow[] {
  const rows: ReviewRow[] = [];
  for (const key of Object.keys(draft.candidate.personal) as Array<
    keyof ApplicantProfile['personal']
  >) {
    const proposed = draft.candidate.personal[key];
    if (!proposed) continue;
    const path = `personal.${key}`;
    const saved = current.personal[key];
    const equivalent =
      Boolean(saved) && contactValuesEquivalent(key, saved, proposed);
    rows.push({
      key: path,
      label: labelFor(key),
      saved: saved || '(blank)',
      proposed,
      decision: draft.decisions[path]!,
      ...(equivalent
        ? { status: 'Equivalent — no change' }
        : saved
          ? {
              choices: [
                { value: 'keep_saved', label: 'Keep saved' },
                { value: 'use_proposed', label: 'Use proposed' },
              ],
            }
          : {
              choices: [
                { value: 'include', label: 'Include' },
                { value: 'exclude', label: 'Exclude' },
              ],
            }),
    });
  }
  const duplicates = findImportDuplicates(current, draft.candidate);
  for (const section of historySections) {
    for (const [index, entry] of draft.candidate[section].entries()) {
      const path = `${section}.${entry.id}`;
      const duplicate = duplicates.find(
        (item) => item.section === section && item.candidateId === entry.id,
      );
      const savedEntry = duplicate
        ? current[section].find((item) => item.id === duplicate.existingId)
        : undefined;
      rows.push({
        key: path,
        label: `${historySectionLabel(section)} ${index + 1}`,
        saved: savedEntry
          ? recordSummary(
              savedEntry as typeof savedEntry & Record<string, unknown>,
            )
          : '(no matching saved record)',
        proposed: recordSummary(
          entry as typeof entry & Record<string, unknown>,
        ),
        decision: draft.decisions[path]!,
        ...(duplicate?.kind === 'exact'
          ? { status: 'Exact duplicate — skipped' }
          : duplicate?.kind === 'possible'
            ? {
                choices: [
                  { value: 'exclude', label: 'Exclude' },
                  {
                    value: 'approve_separate',
                    label: 'Add as separate record',
                  },
                ],
              }
            : {
                choices: [
                  { value: 'include', label: 'Include' },
                  { value: 'exclude', label: 'Exclude' },
                ],
              }),
      });
    }
  }
  for (const key of Object.keys(draft.candidate.skills) as Array<
    keyof ApplicantProfile['skills']
  >) {
    const proposed = draft.candidate.skills[key];
    if (!proposed.length) continue;
    const path = `skills.${key}`;
    const saved = current.skills[key];
    const hasNewSkill = proposed.some((skill) => !saved.includes(skill));
    rows.push({
      key: path,
      label: `Skills — ${labelFor(key)}`,
      saved: saved.length ? saved.join(', ') : '(blank)',
      proposed: proposed.join(', '),
      decision: draft.decisions[path]!,
      ...(hasNewSkill
        ? {
            choices: [
              { value: 'include', label: 'Include' },
              { value: 'exclude', label: 'Exclude' },
            ],
          }
        : { status: 'Equivalent — no change' }),
    });
  }
  return rows;
}

function ResumeCard({
  resume,
  onAction,
  onDirty,
}: {
  resume: ResumeRecord;
  onAction: (action: () => Promise<unknown>) => void;
  onDirty: () => void;
}) {
  const [name, setName] = useState(resume.displayName);
  const [roles, setRoles] = useState(resume.targetRoles.join('\n'));
  const [remove, setRemove] = useState(false);
  return (
    <article className="resume-card" onChange={onDirty}>
      <h2>{resume.displayName}</h2>
      <p>
        {resume.fileName} · {(resume.size / 1024).toFixed(1)} KB ·{' '}
        {resume.mimeType === 'application/pdf' ? 'PDF' : 'DOCX'}
      </p>
      <p>
        Added {new Date(resume.createdAt).toLocaleDateString()} · File stored
        locally; it is not verified profile data.
      </p>
      <label>
        Resume name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Intended job categories (one per line)
        <textarea
          value={roles}
          onChange={(event) => setRoles(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="button button--secondary"
        onClick={() =>
          onAction(() =>
            updateResume(
              resume.id,
              resume.revision,
              name,
              roles.split('\n').filter((item) => item.trim()),
            ),
          )
        }
      >
        Save resume metadata
      </button>
      <label className="check-label">
        <input
          type="checkbox"
          checked={remove}
          onChange={(event) => setRemove(event.target.checked)}
        />
        Delete this file and metadata. Existing profile data and review drafts
        will remain.
      </label>
      <button
        type="button"
        className="button button--secondary"
        disabled={!remove}
        onClick={() => onAction(() => deleteResume(resume.id, resume.revision))}
      >
        Delete resume
      </button>
    </article>
  );
}
function ReviewDraft({
  draft,
  data,
  onSave,
  busy,
  onDirty,
}: {
  draft: ImportDraft;
  data: ApplicantStore;
  onSave: (operation: () => Promise<ApplicantStore>) => void;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
}) {
  const [edited, setEdited] = useState(() => ({
    ...draft,
    decisions: initializeImportDecisions(
      data.profile,
      draft.candidate,
      draft.decisions,
    ),
  }));
  const [confirmed, setConfirmed] = useState(false);
  const rows = reviewRows(edited, data.profile);
  function changeDecision(path: string, decision: ImportDecision) {
    setEdited((current) => ({
      ...current,
      decisions: { ...current.decisions, [path]: decision },
    }));
    setConfirmed(false);
    onDirty(true);
  }
  return (
    <section className="import-review">
      <h2>Unverified import review</h2>
      <p>
        Nothing here is verified yet. Review the parser's confidence and source
        text, then edit or remove anything that is not accurate. Exact duplicate
        history is skipped; possible duplicates require separate approval.
      </p>
      <details open>
        <summary>Extracted resume text</summary>
        <pre className="resume-text">
          {draft.text ||
            'No readable text was extracted. This may be a scanned document. Enter the information manually or use a text-based resume.'}
        </pre>
      </details>
      <fieldset disabled={busy}>
        <div className="suggestion-groups" aria-label="Detected suggestions">
          {[
            'Header',
            'Education',
            'Employment',
            'Projects',
            'Skills',
            'Certifications',
          ].map((section) => {
            const suggestions = edited.suggestions.filter(
              (suggestion) =>
                suggestion.sourceSection === section &&
                suggestionIsPresent(edited.candidate, suggestion.path),
            );
            if (!suggestions.length) return null;
            return (
              <section className="suggestion-group" key={section}>
                <h3>{section === 'Header' ? 'Contact' : section}</h3>
                <p className="unverified-label">UNVERIFIED</p>
                <ul>
                  {suggestions.map((suggestion, index) => (
                    <li key={`${suggestion.path}-${index}`}>
                      <strong>
                        {friendlyPathLabel(suggestion.path, edited.candidate)}
                      </strong>{' '}
                      <span
                        className={`confidence confidence--${suggestion.confidence}`}
                      >
                        {suggestion.confidence}{' '}
                        {Math.round(suggestion.score * 100)}%
                      </span>
                      <small>From: “{suggestion.sourceText}”</small>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <ProfileFields
          value={edited.candidate}
          onChange={(candidate) => {
            setEdited({
              ...edited,
              candidate,
              decisions: initializeImportDecisions(
                data.profile,
                candidate,
                edited.decisions,
              ),
            });
            setConfirmed(false);
            onDirty(true);
          }}
        />
        <details>
          <summary>Existing profile for comparison</summary>
          <dl>
            {Object.entries(facts(data.profile)).map(([path, value]) => (
              <div key={path}>
                <dt>{friendlyPathLabel(path, data.profile)}</dt>
                <dd>
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
        <h3>Changes to your profile</h3>
        <p>
          {rows.length} proposed changes or comparisons. Blank imported fields
          do not erase existing values. Each decision below controls only that
          field, record, or skill category.
        </p>
        <div
          className="table-scroll review-table-scroll"
          role="region"
          aria-label="Profile change decisions"
          tabIndex={0}
        >
          <table className="review-table">
            <colgroup>
              <col className="review-table__field" />
              <col className="review-table__saved" />
              <col className="review-table__proposed" />
              <col className="review-table__decision" />
            </colgroup>
            <thead>
              <tr>
                <th>Field / entry</th>
                <th>Saved value</th>
                <th>Proposed value</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td className="review-value">{row.saved}</td>
                  <td className="review-value">{row.proposed}</td>
                  <td className="review-decision">
                    {row.choices ? (
                      <select
                        aria-label={`Decision for ${row.label}`}
                        value={row.decision}
                        onChange={(event) =>
                          changeDecision(
                            row.key,
                            event.target.value as ImportDecision,
                          )
                        }
                      >
                        {row.choices.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="review-status">{row.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="check-label review-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I reviewed the extracted information and proposed changes. Verify and
          add these facts to my profile.
        </label>
        <div className="editor-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() =>
              onSave(() => saveImport(cleanLists(edited), data.revision))
            }
          >
            Save unverified draft
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={!confirmed}
            onClick={() =>
              onSave(() =>
                confirmImport(cleanLists(edited), data.revision, confirmed),
              )
            }
          >
            Confirm import into profile
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              if (
                window.confirm(
                  'Discard this unverified review draft? The original resume and verified profile will remain.',
                )
              )
                onSave(() => discardImport(draft.id, data.revision));
            }}
          >
            Discard draft
          </button>
        </div>
      </fieldset>
    </section>
  );
}
export function Resumes({
  data,
  onSaved,
  onDirty,
}: {
  data: ApplicantStore;
  onSaved: (data: ApplicantStore) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [name, setName] = useState('');
  const [roles, setRoles] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [review, setReview] = useState<string | null>(null);
  const [dirtyItems, setDirtyItems] = useState<Record<string, boolean>>({});
  useEffect(() => {
    onDirty(busy || Object.values(dirtyItems).some(Boolean));
  }, [busy, dirtyItems, onDirty]);
  function markDirty(id: string, value: boolean) {
    setDirtyItems((previous) => ({ ...previous, [id]: value }));
  }
  useEffect(() => {
    let alive = true;
    void listResumes()
      .then((rows) => {
        if (alive) setResumes(rows);
      })
      .catch((reason) => {
        if (alive) setError(toErrorMessage(reason));
      });
    return () => {
      alive = false;
    };
  }, []);
  async function action(operation: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await operation();
      setResumes(await listResumes());
      setMessage('Saved locally.');
    } catch (reason) {
      setError(toErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function extract(resume: ResumeRecord) {
    const stored = await getResume(resume.id);
    const { parseResume } = await import('../../imports/parseResume');
    const text = await parseResume(stored.bytes, stored.metadata.mimeType);
    const draft = createImportDraft(resume.id, text);
    const saved = await saveImport(draft, data.revision);
    onSaved(saved);
    setReview(draft.id);
  }
  function saveReview(operation: () => Promise<ApplicantStore>) {
    void action(async () => {
      onSaved(await operation());
      markDirty('review', false);
      setReview(null);
    });
  }
  return (
    <>
      <p>
        Store PDF and DOCX resumes up to 10 MB each. Extraction is local. Every
        import starts unverified; saving a file never changes your profile.
      </p>
      <fieldset
        disabled={busy || review !== null}
        onChange={() => markDirty('upload', true)}
      >
        <legend>Add resume</legend>
        <label>
          New resume name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Intended job categories (one per line)
          <textarea
            value={roles}
            onChange={(event) => setRoles(event.target.value)}
          />
        </label>
        <label>
          PDF or DOCX file
          <input
            type="file"
            accept=".pdf,.docx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button
          type="button"
          className="button button--primary"
          disabled={!file || !name.trim()}
          onClick={() => {
            if (file)
              void action(async () => {
                const added = await addResume(
                  file,
                  name,
                  roles.split('\n').filter((value) => value.trim()),
                );
                setResumes(await listResumes());
                setFile(null);
                setName('');
                setRoles('');
                markDirty('upload', false);
                await extract(added);
              });
          }}
        >
          Add resume and extract
        </button>
      </fieldset>
      {busy && <p role="status">Working locally…</p>}
      {error && (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      )}
      <p role="status">{message}</p>
      <fieldset disabled={busy || review !== null} className="editor-controls">
        {resumes.map((resume) => (
          <div key={`${resume.id}-${resume.revision}`}>
            <ResumeCard
              resume={resume}
              onDirty={() => markDirty(resume.id, true)}
              onAction={(operation) => {
                void action(async () => {
                  await operation();
                  markDirty(resume.id, false);
                });
              }}
            />
            <button
              type="button"
              className="button button--secondary"
              disabled={data.imports.some(
                (draft) => draft.resumeId === resume.id,
              )}
              onClick={() => {
                void action(() => extract(resume));
              }}
            >
              Extract for review: {resume.displayName}
            </button>
          </div>
        ))}
      </fieldset>
      <h2>Unverified drafts</h2>
      {data.imports.length === 0 && <p>No pending imports.</p>}
      {data.imports.map((draft) => (
        <div key={draft.id}>
          {review === draft.id ? (
            <ReviewDraft
              key={`${draft.id}-${data.revision}`}
              draft={draft}
              data={data}
              onSave={saveReview}
              busy={busy}
              onDirty={(value) => markDirty('review', value)}
            />
          ) : (
            <button
              type="button"
              className="button button--secondary"
              disabled={busy || review !== null}
              onClick={() => setReview(draft.id)}
            >
              Review unverified import:{' '}
              {resumes.find((resume) => resume.id === draft.resumeId)
                ?.displayName ?? 'Removed resume'}{' '}
              ({new Date(draft.createdAt).toLocaleDateString()})
            </button>
          )}
        </div>
      ))}
    </>
  );
}
