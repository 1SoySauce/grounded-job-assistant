import { useEffect, useState } from 'react';
import { Brand } from '../../components/Brand';
import { StatCard } from '../../components/StatCard';
import { StatusPill } from '../../components/StatusPill';
import { sendRuntimeRequest } from '../../services/runtimeClient';
import type { DashboardSnapshot } from '../../types/messages';
import { toErrorMessage } from '../../utils/errors';

const futureSections = [
  'My Profile',
  'Resumes',
  'Answer Library',
  'Job Preferences',
  'Applications',
  'AI Settings',
  'Automation Settings',
];

export function App() {
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
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Settings sections">
          <button className="nav-item nav-item--active" aria-current="page">
            Dashboard
          </button>
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
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">MILESTONE 1</p>
            <h1>Your application workspace</h1>
            <p>
              Extension foundation is active. Profile editing arrives in
              Milestone 2.
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
              <span className="step-badge">Next milestone</span>
            </div>
            <p>
              The versioned data model and protected repository are ready. The
              next build will add reviewed profile entry, resume import, and the
              reusable answer library.
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
                  The scanner runs only after you click it on the active tab.
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
          <StatusPill tone={snapshot?.profileReady ? 'positive' : 'warning'}>
            {snapshot?.profileReady ? 'Ready' : 'Not configured'}
          </StatusPill>
        </section>
      </main>
    </div>
  );
}
