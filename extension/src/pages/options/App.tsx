import { useEffect, useState } from 'react';
import { Brand } from '../../components/Brand';
import { StatCard } from '../../components/StatCard';
import { StatusPill } from '../../components/StatusPill';
import { sendRuntimeRequest } from '../../services/runtimeClient';
import type { DashboardSnapshot } from '../../types/messages';
import { toErrorMessage } from '../../utils/errors';
import { ApplicantEditor, type EditorSection } from './ApplicantEditor';

const futureSections = ['Applications', 'AI Settings', 'Automation Settings'];

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
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Settings sections">
          <button
            className={`nav-item ${section === 'Dashboard' ? 'nav-item--active' : ''}`}
            aria-current={section === 'Dashboard' ? 'page' : undefined}
            onClick={() => navigate('Dashboard')}
          >
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
              {item}
            </button>
          ))}
          {futureSections.map((section) => (
            <button
              className="nav-item"
              key={section}
              disabled
              title="Planned for a later milestone"
            >
              {section}
              <span>Soon</span>
            </button>
          ))}
        </nav>
        <div className="privacy-note">
          <span className="privacy-note__icon" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>Private by design</strong>
            <p>
              Profile storage is blocked from page and content-script access.
            </p>
          </div>
        </div>
      </aside>

      <main className="dashboard">
        {section !== 'Dashboard' ? (
          <ApplicantEditor key={section} section={section} onDirty={setDirty} />
        ) : (
          <>
            <header className="dashboard-header">
              <div>
                <p className="eyebrow">MILESTONE 2</p>
                <h1>Your application workspace</h1>
                <p>
                  Your verified profile, resumes, and answers are stored
                  locally.
                </p>
              </div>
              <StatusPill tone="positive">Extension online</StatusPill>
            </header>

            {error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}

            <section className="stats-grid" aria-label="Application statistics">
              <StatCard
                label="Verified fields"
                value={snapshot?.verifiedFieldCount ?? 0}
                detail="Ready to use"
              />
              <StatCard
                label="Applications"
                value={snapshot?.applicationCount ?? 0}
                detail="Stored locally"
              />
              <StatCard
                label="AI requests"
                value={0}
                detail="No provider configured"
              />
            </section>

            <section className="dashboard-grid">
              <article className="panel panel--setup">
                <div className="panel__heading">
                  <div>
                    <p className="eyebrow">GETTING STARTED</p>
                    <h2>Build your verified profile</h2>
                  </div>
                  <span className="step-badge">Available now</span>
                </div>
                <p>
                  Add your information, review your resume imports, and
                  configure reusable answers. Every fact stays under your
                  control.
                </p>
                <ol className="setup-list">
                  <li>
                    <span>1</span>
                    Add personal and contact information
                  </li>
                  <li>
                    <span>2</span>
                    Import and verify one or more resumes
                  </li>
                  <li>
                    <span>3</span>
                    Configure factual answers and preferences
                  </li>
                </ol>
              </article>

              <article className="panel">
                <div className="panel__heading">
                  <div>
                    <p className="eyebrow">SAFETY MODEL</p>
                    <h2>Automation with a review gate</h2>
                  </div>
                </div>
                <div className="safety-list">
                  <div>
                    <span className="dot dot--green" />
                    <p>
                      <strong>Verified facts only</strong>
                      Unreviewed or missing data is never treated as applicant
                      truth.
                    </p>
                  </div>
                  <div>
                    <span className="dot dot--blue" />
                    <p>
                      <strong>Explicit page access</strong>
                      The scanner runs only after you click it on the active
                      tab.
                    </p>
                  </div>
                  <div>
                    <span className="dot dot--amber" />
                    <p>
                      <strong>No final submission</strong>
                      The MVP will stop for your review before a final submit
                      action.
                    </p>
                  </div>
                </div>
              </article>
            </section>

            <section className="panel foundation-panel">
              <div>
                <p className="eyebrow">FOUNDATION HEALTH</p>
                <h2>
                  {snapshot?.profileReady
                    ? 'Minimum profile verified'
                    : 'Waiting for profile setup'}
                </h2>
                <p>
                  Runtime messaging, local storage isolation, and active-tab
                  scanning are connected.
                </p>
              </div>
              <StatusPill
                tone={snapshot?.profileReady ? 'positive' : 'warning'}
              >
                {snapshot?.profileReady ? 'Ready' : 'Not configured'}
              </StatusPill>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
