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
  type ImportDraft,
  facts,
} from '../../types/applicant';
import { ProfileFields } from './ProfileFields';
import { cleanLists, labelFor } from './editorUtils';
import { toErrorMessage } from '../../utils/errors';

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
  const [edited, setEdited] = useState(draft);
  const [confirmed, setConfirmed] = useState(false);
  const [replace, setReplace] = useState(false);
  const incoming = facts(edited.candidate);
  const conflicts = Object.entries(edited.candidate.personal).filter(
    ([key, value]) =>
      value &&
      data.profile.personal[key as keyof typeof data.profile.personal] &&
      data.profile.personal[key as keyof typeof data.profile.personal] !==
        value,
  );
  return (
    <section className="import-review">
      <h2>Unverified import review</h2>
      <p>
        Nothing here is verified yet. Edit or remove suggestions, and enter
        history from the extracted text. Only nonempty contact fields are
        copied; history entries are appended and skills are combined. Review
        existing history to avoid duplicates.
      </p>
      <details open>
        <summary>Extracted resume text</summary>
        <pre className="resume-text">
          {draft.text ||
            'No readable text was extracted. This may be a scanned document. Enter the information manually or use a text-based resume.'}
        </pre>
      </details>
      <fieldset disabled={busy}>
        <ProfileFields
          value={edited.candidate}
          onChange={(candidate) => {
            setEdited({ ...edited, candidate });
            setConfirmed(false);
            setReplace(false);
            onDirty(true);
          }}
        />
        <details>
          <summary>Existing profile for comparison</summary>
          <dl>
            {Object.entries(facts(data.profile)).map(([path, value]) => (
              <div key={path}>
                <dt>{path}</dt>
                <dd>
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
        <h3>Changes to your profile</h3>
        <p>
          {Object.keys(incoming).length} nonempty fields proposed. Blank
          imported fields do not erase existing values.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Field / entry</th>
                <th>Saved value</th>
                <th>Proposed value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(incoming).map(([path, value]) => (
                <tr key={path}>
                  <td>{path}</td>
                  <td>
                    {path.startsWith('personal.')
                      ? String(
                          data.profile.personal[
                            path.slice(9) as keyof typeof data.profile.personal
                          ] || '(blank)',
                        )
                      : 'Append / combine with existing history or skills'}
                  </td>
                  <td>
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {conflicts.length > 0 && (
          <>
            <p role="alert">
              Contact conflicts:{' '}
              {conflicts.map(([key]) => labelFor(key)).join(', ')}. Saved values
              appear in the comparison above.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={replace}
                onChange={(event) => setReplace(event.target.checked)}
              />
              Replace the conflicting saved contact values shown above.
            </label>
          </>
        )}
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
            disabled={!confirmed || (conflicts.length > 0 && !replace)}
            onClick={() =>
              onSave(() =>
                confirmImport(
                  cleanLists(edited),
                  data.revision,
                  confirmed,
                  replace,
                ),
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
