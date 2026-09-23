import { useEffect, useState } from 'react';
import { Brand } from '../../components/Brand';
import { StatCard } from '../../components/StatCard';
import { StatusPill } from '../../components/StatusPill';
import { Icon, type IconName } from '../../components/Icon';
import { sendRuntimeRequest } from '../../services/runtimeClient';
import type { DashboardSnapshot } from '../../types/messages';
import { toErrorMessage } from '../../utils/errors';
import { ApplicantEditor, type EditorSection } from './ApplicantEditor';

const futureSections = ['Applications', 'AI Settings', 'Automation Settings'];
const sectionIcons: Record<EditorSection, IconName> = {
  'My Profile': 'user',
  Resumes: 'file',
  'Answer Library': 'message',
  'Job Preferences': 'sliders',
};

export function App() {
  const [section, setSection] = useState<EditorSection | 'Dashboard'>(
    'Dashboard',
  );
  const [dirty, setDirty] = useState(false);
  function navigate(next: EditorSection | 'Dashboard') {
    if (next === section) return;
    if (dirty && !window.confirm('Discard unsaved edits and switch sections?'))
      return;
    setDirty(false);
    setSection(next);
  }
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void sendRuntimeRequest({ type: 'GET_DASHBOARD_SNAPSHOT' })
      .then((response) => {
        if (!isActive) return;
        if (!response.ok) throw new Error(response.error.message);
        if (response.type !== 'DASHBOARD_SNAPSHOT') {
          throw new Error('The extension returned an unexpected response.');
        }
        setSnapshot(response.data);
      })
      .catch((loadError: unknown) => {
        if (isActive) setError(toErrorMessage(loadError));
      });

    return () => {
      isActive = false;
    };
  }, [section]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Settings sections">
          <p className="nav-label">Workspace</p>
          <button
            className={`nav-item ${section === 'Dashboard' ? 'nav-item--active' : ''}`}
            aria-current={section === 'Dashboard' ? 'page' : undefined}
            onClick={() => navigate('Dashboard')}
          >
            <Icon name="grid" />
            Dashboard
          </button>
          {(
            [
              'My Profile',
              'Resumes',
              'Answer Library',
              'Job Preferences',
            ] as const
          ).map((item) => (
            <button
              key={item}
              className={`nav-item ${section === item ? 'nav-item--active' : ''}`}
              aria-current={section === item ? 'page' : undefined}
              onClick={() => navigate(item)}
            >
              <Icon name={sectionIcons[item]} />
              {item}
            </button>
          ))}
          <p className="nav-label nav-label--future">Coming later</p>
          {futureSections.map((section) => (
            <button
              className="nav-item"
              key={section}
              disabled
              title="Planned for a later milestone"
            >
              <Icon
                name={
                  section === 'Applications'
                    ? 'briefcase'
                    : section === 'AI Settings'
                      ? 'sparkles'
                      : 'settings'
                }
              />
              {section}
              <span className="nav-item__badge">Soon</span>
            </button>
          ))}
        </nav>
        <div className="privacy-note">
          <Icon name="shield" className="privacy-note__icon" />
          <div>
            <strong>Private by design</strong>
            <p>
              Profile storage is blocked from page and content-script access.
            </p>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <div className="workspace-bar">
          <span className="workspace-breadcrumb">
            Workspace <Icon name="chevron-right" /> <strong>{section}</strong>
          </span>
          <span className="workspace-local">
            <span className="connection-dot" /> Stored on this device
          </span>
        </div>
        <main className="dashboard" id="workspace-content" tabIndex={-1}>
          {section !== 'Dashboard' ? (
            <ApplicantEditor
              key={section}
              section={section}
              onDirty={setDirty}
            />
          ) : (
            <div className="dashboard-view">
              <header className="dashboard-header">
                <div>
                  <p className="eyebrow">YOUR WORKSPACE, GROUNDED IN FACTS</p>
                  <h1>Your application workspace</h1>
                  <p>
                    Your verified profile, resumes, and answers are stored
                    locally.
                  </p>
                </div>
                <StatusPill
                  tone={error ? 'warning' : snapshot ? 'positive' : 'neutral'}
                >
                  {error
                    ? 'Connection unavailable'
                    : snapshot
                      ? 'Local-first workspace'
                      : 'Connecting…'}
                </StatusPill>
              </header>

              {error && (
                <p className="notice notice--error" role="alert">
                  {error}
                </p>
              )}

              <section
                className="stats-grid"
                aria-label="Application statistics"
              >
                <StatCard
                  label="Verified fields"
                  value={snapshot?.verifiedFieldCount ?? '—'}
                  detail="Facts you have reviewed"
                  icon="shield"
                />
                <StatCard
                  label="Applications"
                  value={snapshot?.applicationCount ?? '—'}
                  detail="Stored locally"
                  icon="briefcase"
                />
                <StatCard
                  label="AI requests"
                  value={0}
                  detail="No provider configured"
                  icon="sparkles"
                />
              </section>

              <section className="dashboard-grid">
                <article className="panel panel--setup">
                  <div className="panel__heading">
                    <div>
                      <p className="eyebrow">GETTING STARTED</p>
                      <h2>A stronger starting point.</h2>
                    </div>
                    <span className="step-badge">Start here</span>
                  </div>
                  <p>
                    Add your information, review your resume imports, and
                    configure reusable answers. Every fact stays under your
                    control.
                  </p>
                  <ol className="setup-list">
                    <li>
                      <button
                        type="button"
                        onClick={() => navigate('My Profile')}
                        className="setup-link"
                      >
                        <span className="setup-link__number">01</span>
                        <span className="setup-link__text">
                          <strong>Make it yours</strong>
                          <small>Add personal and contact information</small>
                        </span>
                        <Icon name="arrow-right" />
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => navigate('Resumes')}
                        className="setup-link"
                      >
                        <span className="setup-link__number">02</span>
                        <span className="setup-link__text">
                          <strong>Bring your experience</strong>
                          <small>Import and verify one or more resumes</small>
                        </span>
                        <Icon name="arrow-right" />
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => navigate('Answer Library')}
                        className="setup-link"
                      >
                        <span className="setup-link__number">03</span>
                        <span className="setup-link__text">
                          <strong>Prepare your answers</strong>
                          <small>Keep reusable responses in one place</small>
                        </span>
                        <Icon name="arrow-right" />
                      </button>
                    </li>
                  </ol>
                </article>

                <article className="panel">
                  <div className="panel__heading">
                    <div>
                      <p className="eyebrow">BUILT ON TRUST</p>
                      <h2>You stay in control.</h2>
                    </div>
                  </div>
                  <div className="safety-list">
                    <div>
                      <span className="safety-icon">
                        <Icon name="check" />
                      </span>
                      <p>
                        <strong>Verified facts only</strong>
                        Unreviewed or missing data is never treated as applicant
                        truth.
                      </p>
                    </div>
                    <div>
                      <span className="safety-icon">
                        <Icon name="scan" />
                      </span>
                      <p>
                        <strong>Explicit page access</strong>
                        The scanner runs only after you click it on the active
                        tab.
                      </p>
                    </div>
                    <div>
                      <span className="safety-icon">
                        <Icon name="shield" />
                      </span>
                      <p>
                        <strong>No final submission</strong>
                        This version does not submit applications.
                      </p>
                    </div>
                  </div>
                </article>
              </section>

              <section className="panel foundation-panel">
                <div>
                  <p className="eyebrow">PROFILE READINESS</p>
                  <h2>
                    {snapshot?.profileReady
                      ? 'Minimum profile verified'
                      : 'Waiting for profile setup'}
                  </h2>
                  <p>
                    Build your verified information once. Review every new
                    detail before it becomes part of your profile.
                  </p>
                </div>
                <button
                  type="button"
                  className="button button--on-dark"
                  onClick={() => navigate('My Profile')}
                >
                  {snapshot?.profileReady ? 'View profile' : 'Set up profile'}{' '}
                  <Icon name="arrow-right" />
                </button>
              </section>
              <p className="workspace-footnote">
                <Icon name="shield" /> Your information stays local. Every
                import starts with your review.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
