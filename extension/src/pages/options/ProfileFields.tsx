import type { ApplicantProfile } from '../../types/applicant';
import { labelFor } from './editorUtils';
export function ValueFields({
  value,
  onChange,
  prefix = '',
}: {
  value: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  prefix?: string;
}) {
  return (
    <div className="editor-grid">
      {Object.entries(value)
        .filter(([key]) => key !== 'id')
        .map(([key, field]) => {
          const label = labelFor(key);
          const inputId = `${prefix}-${key}`;
          if (typeof field === 'boolean')
            return (
              <label className="check-label" key={key}>
                <input
                  type="checkbox"
                  checked={field}
                  onChange={(event) => onChange(key, event.target.checked)}
                />
                {label}
              </label>
            );
          const numeric = typeof field === 'number' || field === null;
          return (
            <label key={key} htmlFor={inputId}>
              {label}
              {Array.isArray(field) && <small>One item per line</small>}
              {Array.isArray(field) ||
              ['description', 'question', 'value'].includes(key) ? (
                <textarea
                  id={inputId}
                  value={
                    Array.isArray(field)
                      ? field.join('\n')
                      : String(field ?? '')
                  }
                  rows={3}
                  onChange={(event) =>
                    onChange(
                      key,
                      Array.isArray(field)
                        ? event.target.value.split('\n')
                        : event.target.value,
                    )
                  }
                />
              ) : (
                <input
                  id={inputId}
                  type={
                    numeric
                      ? 'number'
                      : key === 'email'
                        ? 'email'
                        : key.toLowerCase().endsWith('url')
                          ? 'url'
                          : 'text'
                  }
                  min={numeric ? 0 : undefined}
                  step={numeric ? 'any' : undefined}
                  value={field === null ? '' : String(field)}
                  onChange={(event) =>
                    onChange(
                      key,
                      numeric
                        ? event.target.value === ''
                          ? null
                          : Number(event.target.value)
                        : event.target.value,
                    )
                  }
                />
              )}
            </label>
          );
        })}
    </div>
  );
}
const entryDefaults = {
  education: {
    institution: '',
    degree: '',
    major: '',
    concentration: '',
    minor: '',
    gpa: '',
    startDate: '',
    graduationDate: '',
    location: '',
  },
  employment: {
    employer: '',
    title: '',
    location: '',
    startDate: '',
    endDate: '',
    currentlyEmployed: false,
    responsibilities: [],
    accomplishments: [],
    technologies: [],
    skills: [],
  },
  projects: {
    name: '',
    description: '',
    technologies: [],
    responsibilities: [],
    accomplishments: [],
    githubUrl: '',
    deployedUrl: '',
  },
  certifications: {
    certification: '',
    organization: '',
    date: '',
    expiration: '',
    credentialId: '',
  },
};
export function ProfileFields({
  value,
  onChange,
}: {
  value: ApplicantProfile;
  onChange: (profile: ApplicantProfile) => void;
}) {
  return (
    <div className="profile-fields">
      <fieldset>
        <legend>Personal / contact information</legend>
        <ValueFields
          prefix="personal"
          value={value.personal}
          onChange={(key, field) =>
            onChange({
              ...value,
              personal: { ...value.personal, [key]: field },
            })
          }
        />
      </fieldset>
      {(Object.keys(entryDefaults) as Array<keyof typeof entryDefaults>).map(
        (section) => (
          <fieldset key={section}>
            <legend>{labelFor(section)}</legend>
            {value[section].map((entry, index) => (
              <fieldset className="history-entry" key={entry.id}>
                <legend>
                  {labelFor(section)} {index + 1}
                </legend>
                <ValueFields
                  prefix={entry.id}
                  value={entry}
                  onChange={(key, field) =>
                    onChange({
                      ...value,
                      [section]: value[section].map((item) =>
                        item.id === entry.id ? { ...item, [key]: field } : item,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() =>
                    onChange({
                      ...value,
                      [section]: value[section].filter(
                        (item) => item.id !== entry.id,
                      ),
                    })
                  }
                >
                  Remove {labelFor(section).toLowerCase()} {index + 1}
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="button button--secondary"
              onClick={() =>
                onChange({
                  ...value,
                  [section]: [
                    ...value[section],
                    { ...entryDefaults[section], id: crypto.randomUUID() },
                  ],
                })
              }
            >
              Add {labelFor(section).toLowerCase()}
            </button>
          </fieldset>
        ),
      )}
      <fieldset>
        <legend>Skills</legend>
        <ValueFields
          prefix="skills"
          value={value.skills}
          onChange={(key, field) =>
            onChange({ ...value, skills: { ...value.skills, [key]: field } })
          }
        />
      </fieldset>
      <p className="editor-help">
        Keep dates exactly as known (for example, 2024 or 2024-06). Leave
        unknown information blank.
      </p>
    </div>
  );
}
