import { useEffect, useState, type KeyboardEvent } from 'react';
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
import { Icon } from '../../components/Icon';

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
  kind: 'new' | 'conflict' | 'unchanged' | 'duplicate' | 'possible-duplicate';
  choices?: Array<{ value: ImportDecision; label: string }>;
  status?: string;
};

function scrollReviewTable(event: KeyboardEvent<HTMLDivElement>) {
  if (
    event.target !== event.currentTarget ||
    (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
  ) {
    return;
  }

  event.preventDefault();
  event.currentTarget.scrollLeft += event.key === 'ArrowLeft' ? -40 : 40;
}

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
      kind: equivalent ? 'unchanged' : saved ? 'conflict' : 'new',
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
        kind:
          duplicate?.kind === 'exact'
            ? 'duplicate'
            : duplicate?.kind === 'possible'
              ? 'possible-duplicate'
              : 'new',
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
      kind: hasNewSkill ? 'new' : 'unchanged',
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

const reviewKindLabels: Record<ReviewRow['kind'], string> = {
  new: 'New information',
  conflict: 'Conflicting value',
  unchanged: 'Already saved',
  duplicate: 'Exact duplicate',
  'possible-duplicate': 'Possible duplicate',
};

const decisionDescriptions: Record<ImportDecision, string> = {
  include: 'Included when you confirm.',
  exclude: 'Excluded from this import.',
  keep_saved: 'Your saved value will stay.',
  use_proposed: 'Replaces the saved value when confirmed.',
  approve_separate: 'Adds a separate record when confirmed.',
};

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
      <header className="resume-card__header">
        <span className="resume-card__icon">
          <Icon name="file" />
        </span>
        <div>
          <h3>{resume.displayName}</h3>
          <p className="resume-card__meta">
            {resume.fileName} · {(resume.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <span className="status-pill status-pill--neutral">
          {resume.mimeType === 'application/pdf' ? 'PDF' : 'DOCX'}
        </span>
      </header>
      <p className="resume-card__meta">
        Added {new Date(resume.createdAt).toLocaleDateString()} · File stored
        locally; it is not verified profile data.
      </p>
      <div className="resume-card__fields">
        <label>
          Resume name
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
      </div>
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
        <Icon name="check" />
        Save resume metadata
      </button>
      <div className="resume-card__delete">
        <label className="check-label">
          <input
            type="checkbox"
            checked={remove}
            onChange={(event) => setRemove(event.target.checked)}
          />
          <span>
            Delete this file and metadata. Existing profile data and review
            drafts will remain.
          </span>
        </label>
        <button
          type="button"
          className="button button--danger"
          disabled={!remove}
          onClick={() =>
            onAction(() => deleteResume(resume.id, resume.revision))
          }
        >
          <Icon name="trash" />
          Delete resume
        </button>
      </div>
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
  const selectedCount = rows.filter(
    (row) =>
      row.choices &&
      ['include', 'use_proposed', 'approve_separate'].includes(row.decision),
  ).length;
  const excludedCount = rows.filter(
    (row) => row.choices && row.decision === 'exclude',
  ).length;
  const retainedCount = rows.length - selectedCount - excludedCount;
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
      <header className="import-review__header">
        <div>
          <p className="eyebrow">YOUR PROFILE, YOUR DECISIONS</p>
          <h2>Unverified import review</h2>
        </div>
        <span className="status-pill status-pill--warning">
          <Icon name="shield" />
          Unverified draft
        </span>
      </header>
      <p className="review-note">
        Nothing here is verified yet. Review the confidence and source text,
        then edit anything that is not accurate. Your saved profile changes only
        after you confirm this import.
      </p>
      <div className="review-step">
        <span className="review-step__number" aria-hidden="true">
          01
        </span>
        <div>
          <h3>Check the source</h3>
          <p>Compare detected information with the original resume text.</p>
        </div>
      </div>
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
                <header className="suggestion-group__header">
                  <h3>{section === 'Header' ? 'Contact' : section}</h3>
                  <span className="unverified-label">UNVERIFIED</span>
                </header>
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
                      <small className="suggestion-source">
                        From: “{suggestion.sourceText}”
                      </small>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="review-step">
          <span className="review-step__number" aria-hidden="true">
            02
          </span>
          <div>
            <h3>Refine proposed information</h3>
            <p>
              Edit or remove extracted values before choosing what to import.
            </p>
          </div>
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
        <div className="review-step">
          <span className="review-step__number" aria-hidden="true">
            03
          </span>
          <div>
            <h3>Changes to your profile</h3>
            <p>Compare saved and proposed values, then review each decision.</p>
          </div>
        </div>
        <div
          className="review-overview"
          role="group"
          aria-label="Current import selections"
        >
          <div className="review-metric">
            <strong className="review-metric__value">{selectedCount}</strong>
            <span className="review-metric__label">Selected for import</span>
          </div>
          <div className="review-metric">
            <strong className="review-metric__value">{retainedCount}</strong>
            <span className="review-metric__label">Saved or unchanged</span>
          </div>
          <div className="review-metric">
            <strong className="review-metric__value">{excludedCount}</strong>
            <span className="review-metric__label">Excluded</span>
          </div>
        </div>
        <p className="review-note">
          {rows.length} proposed changes or comparisons. Blank imported fields
          do not erase existing values. Each decision below controls only that
          field, record, or skill category.
        </p>
        <p className="review-note">
          These counts reflect the current selections, including defaults. Exact
          duplicate history is skipped; possible duplicates require separate
          approval. Review every selection before confirming.
        </p>
        <div
          className="table-scroll review-table-scroll"
          role="region"
          aria-label="Profile change decisions"
          tabIndex={0}
          onKeyDown={scrollReviewTable}
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
                <th scope="col">Field / entry</th>
                <th scope="col" className="review-value--saved">
                  Saved value
                </th>
                <th scope="col" className="review-value--proposed">
                  Proposed value
                </th>
                <th scope="col">Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={`review-row--${row.kind} review-row--decision-${row.decision}`}
                >
                  <th scope="row">
                    {row.label}
                    <span className={`review-kind review-kind--${row.kind}`}>
                      {reviewKindLabels[row.kind]}
                    </span>
                  </th>
                  <td className="review-value review-value--saved">
                    {row.saved}
                  </td>
                  <td className="review-value review-value--proposed">
                    {row.proposed}
                  </td>
                  <td className="review-decision">
                    {row.choices ? (
                      <>
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
                        <small className="review-decision__hint">
                          {decisionDescriptions[row.decision]}
                        </small>
                      </>
                    ) : (
                      <span className="review-status">{row.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <p className="notice">
            No proposed values yet. Add information above to review it here.
          </p>
        )}
        <label
          className={`check-label review-confirm${confirmed ? ' review-confirm--checked' : ''}`}
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            I reviewed the extracted information and proposed changes. Verify
            and add these facts to my profile.
          </span>
        </label>
        <p className="review-summary-status" role="status">
          <Icon name={confirmed ? 'check' : 'shield'} />
          {confirmed
            ? 'Review confirmed. Ready to add your selected facts.'
            : 'Confirm your review above to enable the import.'}
        </p>
        <div className="editor-actions review-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() =>
              onSave(() => saveImport(cleanLists(edited), data.revision))
            }
          >
            <Icon name="file" />
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
            <Icon name="check" />
            Confirm import into profile
          </button>
          <button
            type="button"
            className="button button--danger"
            onClick={() => {
              if (
                window.confirm(
                  'Discard this unverified review draft? The original resume and verified profile will remain.',
                )
              )
                onSave(() => discardImport(draft.id, data.revision));
            }}
          >
            <Icon name="trash" />
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
      <div className="resume-intro">
        <span className="status-pill status-pill--info">
          <Icon name="shield" />
          Local extraction
        </span>
        <p>
          Store PDF and DOCX resumes up to 10 MB each. Every import starts
          unverified; saving a file never changes your profile.
        </p>
      </div>
      <fieldset
        className="resume-upload"
        disabled={busy || review !== null}
        onChange={() => markDirty('upload', true)}
      >
        <legend>Add resume</legend>
        <div className="resume-upload__heading">
          <Icon name="upload" />
          <p>Add a resume, extract its information, and review what to keep.</p>
        </div>
        <div className="resume-upload__fields">
          <label>
            New resume name
            <input
              value={name}
              placeholder="e.g. Product engineering resume"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Intended job categories (one per line)
            <textarea
              value={roles}
              placeholder="e.g. Software engineering"
              onChange={(event) => setRoles(event.target.value)}
            />
          </label>
        </div>
        <label className="file-picker">
          PDF or DOCX file
          <input
            type="file"
            accept=".pdf,.docx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <p className="file-picker__hint">
          {file
            ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB selected`
            : 'Choose a text-based PDF or DOCX file, up to 10 MB.'}
        </p>
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
          <Icon
            name={busy ? 'loader' : 'upload'}
            className={busy ? 'icon--spin' : undefined}
          />
          Add resume and extract
        </button>
      </fieldset>
      {busy && (
        <p role="status" className="notice feedback">
          <Icon name="loader" className="icon--spin" />
          Working locally…
        </p>
      )}
      {error && (
        <p role="alert" className="notice notice--error">
          <Icon name="alert" />
          {error}
        </p>
      )}
      <p
        role="status"
        className={
          message
            ? 'notice notice--success feedback'
            : 'feedback feedback--empty'
        }
      >
        {message && <Icon name="check" />}
        {message}
      </p>
      <div className="section-heading">
        <div>
          <h2>Resume library</h2>
          <p className="section-heading__description">
            Your original files, stored on this device.
          </p>
        </div>
        <span
          className="count-badge"
          aria-label={`${resumes.length} saved resumes`}
        >
          {resumes.length}
        </span>
      </div>
      {resumes.length === 0 && (
        <div className="empty-state">
          <span className="empty-state__icon">
            <Icon name="file" />
          </span>
          <div>
            <h3>Your resume library starts here</h3>
            <p>
              Add your first resume above to extract information for review.
            </p>
          </div>
        </div>
      )}
      <fieldset
        disabled={busy || review !== null}
        className="editor-controls resume-library"
      >
        <div className="resume-library__grid">
          {resumes.map((resume) => (
            <div
              key={`${resume.id}-${resume.revision}`}
              className="resume-record"
            >
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
                className="button button--secondary resume-record__extract"
                disabled={data.imports.some(
                  (draft) => draft.resumeId === resume.id,
                )}
                onClick={() => {
                  void action(() => extract(resume));
                }}
              >
                <Icon name="scan" />
                Extract for review: {resume.displayName}
              </button>
              {data.imports.some((draft) => draft.resumeId === resume.id) && (
                <p className="resume-card__meta">
                  An unverified draft is ready below.
                </p>
              )}
            </div>
          ))}
        </div>
      </fieldset>
      <div className="section-heading">
        <div>
          <h2>Unverified drafts</h2>
          <p className="section-heading__description">
            Review extracted information before adding it to your profile.
          </p>
        </div>
        <span
          className="count-badge"
          aria-label={`${data.imports.length} unverified drafts`}
        >
          {data.imports.length}
        </span>
      </div>
      {data.imports.length === 0 && (
        <div className="empty-state empty-state--compact">
          <span className="empty-state__icon">
            <Icon name="check" />
          </span>
          <div>
            <h3>No pending imports.</h3>
            <p>Extract a saved resume to start a new review.</p>
          </div>
        </div>
      )}
      <div className="draft-list">
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
                className="button button--secondary draft-card"
                disabled={busy || review !== null}
                onClick={() => setReview(draft.id)}
              >
                <span className="resume-card__icon">
                  <Icon name="file" />
                </span>
                <span className="draft-card__content">
                  <span className="draft-card__title">
                    Review unverified import:{' '}
                    {resumes.find((resume) => resume.id === draft.resumeId)
                      ?.displayName ?? 'Removed resume'}
                  </span>
                  <span className="draft-card__meta">
                    Created {new Date(draft.createdAt).toLocaleDateString()} ·
                    Requires your review
                  </span>
                </span>
                <Icon name="arrow-right" />
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
