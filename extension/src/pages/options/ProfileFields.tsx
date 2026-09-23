import type { ApplicantProfile } from '../../types/applicant';
import { Icon } from '../../components/Icon';
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
            <label
              key={key}
              htmlFor={inputId}
              className={
                ['description', 'question', 'value'].includes(key)
                  ? 'field--wide'
                  : undefined
              }
            >
              {label}
              {Array.isArray(field) && (
                <small id={`${inputId}-hint`}>One item per line</small>
              )}
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
const personalGroups = [
  {
    title: 'Name & contact',
    fields: [
      'firstName',
      'middleName',
      'lastName',
      'preferredName',
      'email',
      'phone',
    ],
  },
  { title: 'Location', fields: ['city', 'state', 'zip', 'country'] },
  {
    title: 'Online presence',
    fields: ['linkedinUrl', 'githubUrl', 'portfolioUrl'],
  },
];
const sectionDescriptions = {
  education: 'Schools, qualifications, and the details of your education.',
  employment: 'Your roles, responsibilities, and accomplishments.',
  projects: 'The work you have built and the skills behind it.',
  certifications:
    'Credentials and professional certifications you have earned.',
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
      <fieldset className="form-section">
        <legend>Personal / contact information</legend>
        <p className="form-section__description">
          The details you want to use in your applications.
        </p>
        {personalGroups.map((group) => (
          <div className="field-group" key={group.title}>
            <h3 className="field-group__heading">{group.title}</h3>
            <ValueFields
              prefix="personal"
              value={Object.fromEntries(
                Object.entries(value.personal).filter(([key]) =>
                  group.fields.includes(key),
                ),
              )}
              onChange={(key, field) =>
                onChange({
                  ...value,
                  personal: { ...value.personal, [key]: field },
                })
              }
            />
          </div>
        ))}
      </fieldset>
      {(Object.keys(entryDefaults) as Array<keyof typeof entryDefaults>).map(
        (section) => (
          <fieldset key={section} className="form-section">
            <legend>{labelFor(section)}</legend>
            <div className="record-heading">
              <p className="form-section__description">
                {sectionDescriptions[section]}
              </p>
              <span className="status-pill status-pill--neutral">
                {value[section].length}{' '}
                {value[section].length === 1 ? 'entry' : 'entries'}
              </span>
            </div>
            {value[section].length === 0 && (
              <div className="section-empty">
                <span className="section-empty__icon">
                  <Icon
                    name={section === 'employment' ? 'briefcase' : 'file'}
                  />
                </span>
                <div>
                  <strong>
                    No {labelFor(section).toLowerCase()} added yet
                  </strong>
                  <p>
                    Add an entry when you are ready. Unknown details can stay
                    blank.
                  </p>
                </div>
              </div>
            )}
            {value[section].map((entry, index) => (
              <fieldset className="history-entry" key={entry.id}>
                <legend>
                  {labelFor(section)} {index + 1}
                </legend>
                <div className="record-heading">
                  <h3 className="record-heading__title">
                    {('institution' in entry && entry.institution) ||
                      ('employer' in entry && entry.employer) ||
                      ('name' in entry && entry.name) ||
                      ('certification' in entry && entry.certification) ||
                      'New entry'}
                  </h3>
                  <button
                    type="button"
                    className="button button--danger-ghost"
                    onClick={() =>
                      onChange({
                        ...value,
                        [section]: value[section].filter(
                          (item) => item.id !== entry.id,
                        ),
                      })
                    }
                  >
                    <Icon name="trash" />
                    Remove {labelFor(section).toLowerCase()} {index + 1}
                  </button>
                </div>
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
              </fieldset>
            ))}
            <button
              type="button"
              className="button button--secondary button--add"
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
              <Icon name="plus" />
              Add {labelFor(section).toLowerCase()}
            </button>
          </fieldset>
        ),
      )}
      <fieldset className="form-section">
        <legend>Skills</legend>
        <p className="form-section__description">
          Organize your skills by category. Add one skill per line and leave
          unused categories blank.
        </p>
        <ValueFields
          prefix="skills"
          value={value.skills}
          onChange={(key, field) =>
            onChange({ ...value, skills: { ...value.skills, [key]: field } })
          }
        />
      </fieldset>
      <p className="editor-help">
        <Icon name="clock" />
        Keep dates exactly as known (for example, 2024 or 2024-06). Leave
        unknown information blank.
      </p>
    </div>
  );
}
