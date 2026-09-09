import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  getApplicant,
  saveVerifiedProfile,
  saveAnswers,
  savePreferences,
} from '../../storage/applicantRepository';
import type { ApplicantStore } from '../../types/applicant';
import { ProfileFields, ValueFields } from './ProfileFields';
import { cleanLists, labelFor } from './editorUtils';
import { Resumes } from './Resumes';

export type EditorSection =
  'My Profile' | 'Resumes' | 'Answer Library' | 'Job Preferences';
function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
  return error instanceof Error
    ? error.message
    : 'Operation failed. Your saved data was preserved.';
}
export function ApplicantEditor({
  section,
  onDirty,
}: {
  section: EditorSection;
  onDirty: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<ApplicantStore | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void getApplicant()
      .then((value) => {
        if (alive) setData(value);
      })
      .catch((reason) => {
        if (alive) setError(errorMessage(reason));
      });
    return () => {
      alive = false;
    };
  }, []);
  function edit(next: ApplicantStore) {
    setData(next);
    setConfirmed(false);
    onDirty(true);
    setMessage('Unsaved changes');
  }
  async function save() {
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      const cleaned = cleanLists(data);
      const saved =
        section === 'My Profile'
          ? await saveVerifiedProfile(cleaned.profile, data.revision, confirmed)
          : section === 'Answer Library'
            ? await saveAnswers(cleaned.answers, data.revision, confirmed)
            : await savePreferences(cleaned.preferences, data.revision);
      setData(saved);
      setConfirmed(false);
      onDirty(false);
      setMessage('Saved locally.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel editor-panel">
      <h1>{section}</h1>
      {error && (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading your local data…</p>}
      {data &&
        (section === 'Resumes' ? (
          <Resumes data={data} onSaved={setData} onDirty={onDirty} />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={busy} className="editor-controls">
              {section === 'My Profile' && (
                <>
                  <p>
                    Review every value before verifying. Blank fields remain
                    unknown. Removing an entry takes effect when you save.
                  </p>
                  <ProfileFields
                    value={data.profile}
                    onChange={(profile) => edit({ ...data, profile })}
                  />
                </>
              )}
              {section === 'Answer Library' && (
                <>
                  <p>
                    Save only answers you explicitly supplied. “AI generation
                    allowed later” stores permission only; it generates nothing.
                    Protected demographic information is never inferred.
                  </p>
                  {data.answers.map((answer, index) => (
                    <fieldset key={answer.id}>
                      <legend>Answer {index + 1}</legend>
                      <ValueFields
                        prefix={answer.id}
                        value={{ question: answer.question }}
                        onChange={(_, value) =>
                          edit({
                            ...data,
                            answers: data.answers.map((item) =>
                              item.id === answer.id
                                ? { ...item, question: String(value) }
                                : item,
                            ),
                          })
                        }
                      />
                      <label>
                        Answer type
                        <select
                          value={answer.mode}
                          onChange={(event) =>
                            edit({
                              ...data,
                              answers: data.answers.map((item) =>
                                item.id === answer.id
                                  ? {
                                      ...item,
                                      mode: event.target
                                        .value as typeof answer.mode,
                                      value: undefined,
                                    }
                                  : item,
                              ),
                            })
                          }
                        >
                          <option value="verified_factual">
                            Verified factual answer
                          </option>
                          <option value="reusable_custom">
                            Reusable custom answer
                          </option>
                          <option value="ai_generated_allowed">
                            AI generation allowed later
                          </option>
                          <option value="always_ask">Always ask me</option>
                        </select>
                      </label>
                      <label>
                        Protected demographic category
                        <select
                          value={answer.sensitiveCategory ?? ''}
                          onChange={(event) =>
                            edit({
                              ...data,
                              answers: data.answers.map((item) =>
                                item.id === answer.id
                                  ? {
                                      ...item,
                                      sensitiveCategory: (event.target.value ||
                                        undefined) as typeof answer.sensitiveCategory,
                                    }
                                  : item,
                              ),
                            })
                          }
                        >
                          <option value="">
                            Not a protected demographic answer
                          </option>
                          {[
                            'disability',
                            'veteran_status',
                            'gender',
                            'race_ethnicity',
                            'religion',
                            'sexual_orientation',
                            'other_protected',
                          ].map((category) => (
                            <option key={category} value={category}>
                              {category.replaceAll('_', ' ')}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!['always_ask', 'ai_generated_allowed'].includes(
                        answer.mode,
                      ) && (
                        <label>
                          Exact answer
                          <textarea
                            value={String(answer.value ?? '')}
                            onChange={(event) =>
                              edit({
                                ...data,
                                answers: data.answers.map((item) =>
                                  item.id === answer.id
                                    ? { ...item, value: event.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() =>
                          edit({
                            ...data,
                            answers: data.answers.filter(
                              (item) => item.id !== answer.id,
                            ),
                          })
                        }
                      >
                        Remove answer {index + 1}
                      </button>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() =>
                      edit({
                        ...data,
                        answers: [
                          ...data.answers,
                          {
                            id: crypto.randomUUID(),
                            question: '',
                            normalizedQuestion: '',
                            mode: 'always_ask',
                            updatedAt: new Date().toISOString(),
                          },
                        ],
                      })
                    }
                  >
                    Add answer
                  </button>
                </>
              )}
              {section === 'Job Preferences' && (
                <>
                  <p>
                    Leave unknown preferences blank. Salary values use the same
                    currency and pay period; specify these in your salary Answer
                    Library entry.
                  </p>
                  <ValueFields
                    prefix="preferences"
                    value={Object.fromEntries(
                      Object.entries(data.preferences).filter(
                        ([key]) =>
                          ![
                            'workplacePreferences',
                            'roleTypes',
                            'autoConsiderScore',
                          ].includes(key),
                      ),
                    )}
                    onChange={(key, value) =>
                      edit({
                        ...data,
                        preferences: { ...data.preferences, [key]: value },
                      })
                    }
                  />
                  {(['workplacePreferences', 'roleTypes'] as const).map(
                    (key) => (
                      <fieldset key={key}>
                        <legend>{labelFor(key)}</legend>
                        {(key === 'workplacePreferences'
                          ? ['remote', 'hybrid', 'onsite']
                          : ['internship', 'full_time', 'part_time', 'contract']
                        ).map((option) => (
                          <label className="check-label" key={option}>
                            <input
                              type="checkbox"
                              checked={(
                                data.preferences[key] as string[]
                              ).includes(option)}
                              onChange={(event) =>
                                edit({
                                  ...data,
                                  preferences: {
                                    ...data.preferences,
                                    [key]: event.target.checked
                                      ? [...data.preferences[key], option]
                                      : data.preferences[key].filter(
                                          (item) => item !== option,
                                        ),
                                  },
                                })
                              }
                            />
                            {option.replaceAll('_', ' ')}
                          </label>
                        ))}
                      </fieldset>
                    ),
                  )}
                </>
              )}
              {section !== 'Job Preferences' && (
                <label className="check-label review-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  I reviewed these values and confirm they are accurate and
                  explicitly supplied by me.
                </label>
              )}
              <button
                className="button button--primary"
                disabled={busy || (section !== 'Job Preferences' && !confirmed)}
              >
                {busy
                  ? 'Saving…'
                  : section === 'My Profile'
                    ? 'Save verified profile'
                    : 'Save changes'}
              </button>
              <p role="status">{message}</p>
            </fieldset>
          </form>
        ))}
    </section>
  );
}
