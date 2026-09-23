import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  getApplicant,
  saveVerifiedProfile,
  saveAnswers,
  savePreferences,
} from '../../storage/applicantRepository';
import type { ApplicantStore } from '../../types/applicant';
import { Icon } from '../../components/Icon';
import { ProfileFields, ValueFields } from './ProfileFields';
import { cleanLists, labelFor } from './editorUtils';
import { Resumes } from './Resumes';

export type EditorSection =
  'My Profile' | 'Resumes' | 'Answer Library' | 'Job Preferences';
const sectionDescriptions: Record<EditorSection, string> = {
  'My Profile': 'Build a clear, accurate picture of your experience.',
  Resumes:
    'Keep your documents organized and review what goes into your profile.',
  'Answer Library': 'Your answers, ready to reuse. You decide what gets saved.',
  'Job Preferences':
    'Define the roles, locations, and opportunities that fit you.',
};
const answerModes = {
  verified_factual: 'Factual answer',
  reusable_custom: 'Custom answer',
  ai_generated_allowed: 'AI permission only',
  always_ask: 'Ask every time',
};
const preferenceGroups = [
  {
    title: 'Roles & search terms',
    description:
      'Describe the work you want to find and the titles to leave out.',
    fields: ['desiredTitles', 'titleKeywords', 'excludedTitles'],
  },
  {
    title: 'Location & employment',
    description: 'Add your preferred locations and employment arrangements.',
    fields: ['desiredLocations', 'employmentTypes'],
  },
  {
    title: 'Compensation',
    description:
      'Salary values use the same currency and pay period; specify these in your salary Answer Library entry.',
    fields: ['minimumSalary', 'desiredSalary'],
  },
  {
    title: 'Industries & companies',
    description:
      'Focus your search on industries of interest and list companies to exclude.',
    fields: ['industries', 'excludedCompanies'],
  },
];
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
    setError('');
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
    <section className="panel editor-panel" aria-labelledby="editor-title">
      <header className="editor-page-header">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1 id="editor-title">{section}</h1>
          <p className="page-description">{sectionDescriptions[section]}</p>
        </div>
        <span className="status-pill status-pill--neutral">
          <Icon name="shield" />
          Stored locally
        </span>
      </header>
      {error && !data && (
        <p role="alert" className="notice notice--error">
          {error}
        </p>
      )}
      {!data && !error && (
        <div className="editor-loading" role="status">
          <p>
            <Icon name="loader" className="icon--spin" /> Loading your local
            data…
          </p>
          <div className="skeleton skeleton--title" aria-hidden="true" />
          <div className="skeleton skeleton--field" aria-hidden="true" />
          <div className="skeleton skeleton--field" aria-hidden="true" />
        </div>
      )}
      {data &&
        (section === 'Resumes' ? (
          <Resumes data={data} onSaved={setData} onDirty={onDirty} />
        ) : (
          <form
            aria-busy={busy}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
            onInvalid={(event) => {
              if (section !== 'Job Preferences') return;
              const input = event.target as HTMLInputElement;
              if (!input.validity.rangeUnderflow) return;
              event.preventDefault();
              const label = input.labels?.[0]?.textContent?.trim() || 'Value';
              setError(`${label} must be zero or greater.`);
            }}
          >
            <fieldset disabled={busy} className="editor-controls">
              {section === 'My Profile' && (
                <>
                  <p className="editor-intro">
                    <Icon name="shield" />
                    <span>
                      Review every value before verifying. Blank fields remain
                      unknown. Removing an entry takes effect when you save.
                    </span>
                  </p>
                  <ProfileFields
                    value={data.profile}
                    onChange={(profile) => edit({ ...data, profile })}
                  />
                </>
              )}
              {section === 'Answer Library' && (
                <>
                  <p className="editor-intro">
                    <Icon name="shield" />
                    <span>
                      Save only answers you explicitly supplied. “AI generation
                      allowed later” stores permission only; it generates
                      nothing. Protected demographic information is never
                      inferred.
                    </span>
                  </p>
                  <div className="record-heading">
                    <h2>Your answers</h2>
                    <span className="status-pill status-pill--neutral">
                      {data.answers.length}{' '}
                      {data.answers.length === 1 ? 'answer' : 'answers'}
                    </span>
                  </div>
                  {data.answers.length === 0 && (
                    <div className="section-empty section-empty--feature">
                      <span className="section-empty__icon">
                        <Icon name="message" />
                      </span>
                      <div>
                        <strong>A home for the questions you see again</strong>
                        <p>
                          Add your first answer, or set a question to always ask
                          you.
                        </p>
                      </div>
                    </div>
                  )}
                  {data.answers.map((answer, index) => (
                    <fieldset key={answer.id} className="answer-card">
                      <legend>Answer {index + 1}</legend>
                      <div className="answer-card__heading">
                        <div className="record-meta">
                          <span className="status-pill status-pill--info">
                            <Icon
                              name={
                                answer.mode === 'always_ask'
                                  ? 'message'
                                  : 'file'
                              }
                            />
                            {answerModes[answer.mode]}
                          </span>
                          {answer.sensitiveCategory && (
                            <span className="status-pill status-pill--warning">
                              <Icon name="shield" /> Protected demographic
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="button button--danger-ghost"
                          onClick={() =>
                            edit({
                              ...data,
                              answers: data.answers.filter(
                                (item) => item.id !== answer.id,
                              ),
                            })
                          }
                        >
                          <Icon name="trash" />
                          Remove answer {index + 1}
                        </button>
                      </div>
                      <ValueFields
                        prefix={answer.id}
                        value={{ question: answer.question }}
                        onChange={(_, value) => {
                          edit({
                            ...data,
                            answers: data.answers.map((item) =>
                              item.id === answer.id
                                ? { ...item, question: String(value) }
                                : item,
                            ),
                          });
                        }}
                      />
                      <div className="editor-grid">
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
                                        sensitiveCategory: (event.target
                                          .value ||
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
                      </div>
                      {!['always_ask', 'ai_generated_allowed'].includes(
                        answer.mode,
                      ) && (
                        <label>
                          Exact answer
                          <textarea
                            rows={5}
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
                      {['always_ask', 'ai_generated_allowed'].includes(
                        answer.mode,
                      ) && (
                        <p className="answer-mode-note">
                          <Icon
                            name={
                              answer.mode === 'always_ask'
                                ? 'message'
                                : 'sparkles'
                            }
                          />
                          {answer.mode === 'always_ask'
                            ? 'This question is set to ask you each time. No answer text is stored.'
                            : 'This saves permission for future AI generation. No answer is generated now.'}
                        </p>
                      )}
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    className="button button--secondary button--add"
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
                    <Icon name="plus" />
                    Add answer
                  </button>
                </>
              )}
              {section === 'Job Preferences' && (
                <>
                  <p className="editor-intro">
                    <Icon name="sliders" />
                    <span>
                      Set what matters to you. Leave unknown preferences blank.
                    </span>
                  </p>
                  {preferenceGroups.map((group) => (
                    <fieldset key={group.title} className="form-section">
                      <legend>{group.title}</legend>
                      <p className="form-section__description">
                        {group.description}
                      </p>
                      <ValueFields
                        prefix="preferences"
                        value={Object.fromEntries(
                          Object.entries(data.preferences).filter(([key]) =>
                            group.fields.includes(key),
                          ),
                        )}
                        onChange={(key, value) =>
                          edit({
                            ...data,
                            preferences: { ...data.preferences, [key]: value },
                          })
                        }
                      />
                    </fieldset>
                  ))}
                  {(['workplacePreferences', 'roleTypes'] as const).map(
                    (key) => (
                      <fieldset key={key} className="form-section">
                        <legend>{labelFor(key)}</legend>
                        <p className="form-section__description">
                          {key === 'workplacePreferences'
                            ? 'Choose the work settings that suit you. Select all that apply.'
                            : 'Choose the types of roles you would consider. Select all that apply.'}
                        </p>
                        <div className="preference-choices">
                          {(key === 'workplacePreferences'
                            ? ['remote', 'hybrid', 'onsite']
                            : [
                                'internship',
                                'full_time',
                                'part_time',
                                'contract',
                              ]
                          ).map((option) => (
                            <label
                              className={`check-label choice-card${
                                (data.preferences[key] as string[]).includes(
                                  option,
                                )
                                  ? ' is-selected'
                                  : ''
                              }`}
                              key={option}
                            >
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
                        </div>
                      </fieldset>
                    ),
                  )}
                </>
              )}
              {error && (
                <p role="alert" className="notice notice--error">
                  {error}
                </p>
              )}
              {section !== 'Job Preferences' && (
                <label className="check-label review-confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span>
                    I reviewed these values and confirm they are accurate and
                    explicitly supplied by me.
                  </span>
                </label>
              )}
              <button
                className="button button--primary"
                disabled={busy || (section !== 'Job Preferences' && !confirmed)}
              >
                <Icon
                  name={busy ? 'loader' : 'check'}
                  className={busy ? 'icon--spin' : undefined}
                />
                {busy
                  ? 'Saving…'
                  : section === 'My Profile'
                    ? 'Save verified profile'
                    : 'Save changes'}
              </button>
              <p
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className={`save-status${message === 'Unsaved changes' ? ' is-pending' : message === 'Saved locally.' ? ' is-saved' : ''}`}
              >
                <Icon
                  name={
                    busy
                      ? 'loader'
                      : message === 'Saved locally.'
                        ? 'check'
                        : message === 'Unsaved changes'
                          ? 'edit'
                          : 'shield'
                  }
                  className={busy ? 'icon--spin' : undefined}
                />
                <span>
                  {busy
                    ? 'Saving changes…'
                    : message ||
                      'Your changes are saved only when you choose to save.'}
                </span>
              </p>
            </fieldset>
          </form>
        ))}
    </section>
  );
}
