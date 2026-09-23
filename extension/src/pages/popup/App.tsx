import { useEffect, useState } from 'react';
import { Brand } from '../../components/Brand';
import { Icon } from '../../components/Icon';
import { StatusPill } from '../../components/StatusPill';
import { sendRuntimeRequest } from '../../services/runtimeClient';
import type { DashboardSnapshot } from '../../types/messages';
import type { PageScanResult } from '../../types/scanner';
import { toErrorMessage } from '../../utils/errors';

const PAGE_TYPE_LABELS: Record<PageScanResult['pageType'], string> = {
  job_posting: 'Job posting',
  application_form: 'Application form',
  application_confirmation: 'Application confirmation',
  unrelated: 'No job context detected',
};

const ATS_LABELS: Record<PageScanResult['ats'], string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workday: 'Workday',
  smartrecruiters: 'SmartRecruiters',
  icims: 'iCIMS',
  jobvite: 'Jobvite',
  taleo: 'Taleo',
  generic: 'Generic page',
};

export function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [scan, setScan] = useState<PageScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

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

  async function handleScan(): Promise<void> {
    setError(null);
    setScan(null);
    setIsScanning(true);

    try {
      const response = await sendRuntimeRequest({ type: 'SCAN_ACTIVE_TAB' });
      if (!response.ok) throw new Error(response.error.message);
      if (response.type !== 'PAGE_SCAN') {
        throw new Error('The extension returned an unexpected response.');
      }
      setScan(response.data);
    } catch (scanError: unknown) {
      setError(toErrorMessage(scanError));
    } finally {
      setIsScanning(false);
    }
  }

  async function handleOpenSettings(): Promise<void> {
    try {
      const response = await sendRuntimeRequest({ type: 'OPEN_OPTIONS' });
      if (!response.ok) throw new Error(response.error.message);
      window.close();
    } catch (openError: unknown) {
      setError(toErrorMessage(openError));
    }
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <Brand compact />
        <StatusPill tone="positive">
          <Icon name="shield" />
          Local-first
        </StatusPill>
      </header>

      <section className="popup-scan-card" aria-labelledby="popup-scan-title">
        <div className="popup-scan-heading">
          <div>
            <p className="eyebrow">PAGE INTELLIGENCE</p>
            <h1 id="popup-scan-title">Your next opportunity.</h1>
          </div>
          <span className="popup-scan-mark" aria-hidden="true">
            <Icon name="scan" />
          </span>
        </div>
        <p id="popup-scan-description" className="popup-scan-description">
          Scan the current tab to identify job details and application fields.
        </p>

        <button
          className="button button--primary popup-scan-button"
          onClick={handleScan}
          disabled={isScanning}
          aria-busy={isScanning}
          aria-describedby="popup-scan-description"
        >
          <Icon
            name={isScanning ? 'loader' : 'scan'}
            className={isScanning ? 'icon--spin' : undefined}
          />
          {isScanning ? 'Scanning current page…' : 'Scan current page'}
          {!isScanning && <Icon name="arrow-right" />}
        </button>

        <div className="scan-feedback" aria-live="polite" aria-atomic="true">
          {isScanning ? (
            <div className="scan-placeholder scan-placeholder--loading">
              <span className="scan-placeholder__icon" aria-hidden="true">
                <Icon name="search" />
              </span>
              <div>
                <strong>Reading the current page</strong>
                <p>Checking page type, hiring platform, and job details.</p>
              </div>
              <div className="scan-progress" aria-hidden="true">
                <span />
              </div>
            </div>
          ) : scan ? (
            <section className="scan-result" aria-label="Current page results">
              <div className="scan-result__topline">
                <span className="scan-complete-label">
                  <Icon name="check" /> Scan complete
                </span>
                <span className="muted-label">Current tab</span>
              </div>
              <StatusPill
                tone={scan.pageType === 'unrelated' ? 'neutral' : 'info'}
              >
                {PAGE_TYPE_LABELS[scan.pageType]}
              </StatusPill>
              <h2>{scan.title || 'Untitled page'}</h2>
              <dl className="scan-facts">
                <div>
                  <dt>Hiring platform</dt>
                  <dd>{ATS_LABELS[scan.ats]}</dd>
                </div>
                <div>
                  <dt>Fields</dt>
                  <dd>{scan.fieldCount}</dd>
                </div>
                <div>
                  <dt>Forms</dt>
                  <dd>{scan.formCount}</dd>
                </div>
              </dl>
              <div className="scan-job-context">
                <Icon name="briefcase" />
                <div>
                  <strong>
                    {scan.jobPosting
                      ? 'Job posting details found'
                      : 'No job posting details found'}
                  </strong>
                  <span>
                    {scan.hasJobPostingStructuredData
                      ? 'Structured job data detected on this page.'
                      : 'No structured job data detected on this page.'}
                  </span>
                </div>
              </div>
            </section>
          ) : (
            <div className="scan-placeholder">
              <span className="scan-placeholder__icon" aria-hidden="true">
                <Icon name="briefcase" />
              </span>
              <div>
                <strong>No page scanned yet</strong>
                <p>Open a job posting or application to get started.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {error && (
        <div className="notice notice--error popup-error" role="alert">
          <Icon name="alert" />
          <div>
            <strong>Something needs attention</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      <section
        className="readiness-row"
        aria-label="Setup status"
        aria-busy={!snapshot && !error}
      >
        <span className="readiness-icon" aria-hidden="true">
          <Icon name="user" />
        </span>
        <div className="readiness-copy">
          <span className="muted-label">Your profile</span>
          <strong>
            {snapshot
              ? snapshot.profileReady
                ? 'Ready to use'
                : 'Setup required'
              : error
                ? 'Profile unavailable'
                : 'Loading profile…'}
          </strong>
        </div>
        {snapshot && (
          <StatusPill tone={snapshot.profileReady ? 'positive' : 'warning'}>
            {snapshot.verifiedFieldCount} verified
          </StatusPill>
        )}
      </section>

      <div className="action-stack">
        <button
          className="button button--secondary popup-settings-button"
          onClick={handleOpenSettings}
        >
          <Icon name="settings" />
          Open settings
          <Icon name="arrow-right" />
        </button>
      </div>

      <footer className="popup-footer">
        <span>
          <Icon name="shield" /> Scanning never submits applications.
        </span>
        <span>v0.2.0</span>
      </footer>
    </main>
  );
}
