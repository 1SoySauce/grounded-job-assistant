import { useEffect, useState } from 'react';
import { Brand } from '../../components/Brand';
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
        <StatusPill tone="positive">Local-first</StatusPill>
      </header>

      <section className="hero-card">
        <p className="eyebrow">ASSISTED APPLICATIONS</p>
        <h1>Make every answer traceable.</h1>
        <p>
          This foundation scans only when you ask. Applicant data remains in the
          trusted extension context.
        </p>
      </section>

      <section className="readiness-row" aria-label="Setup status">
        <div>
          <span className="muted-label">Profile status</span>
          <strong>{snapshot?.profileReady ? 'Ready' : 'Setup required'}</strong>
        </div>
        <StatusPill tone={snapshot?.profileReady ? 'positive' : 'warning'}>
          {snapshot?.verifiedFieldCount ?? 0} verified
        </StatusPill>
      </section>

      {scan && (
        <section className="scan-result" aria-live="polite">
          <div className="scan-result__topline">
            <StatusPill
              tone={scan.pageType === 'unrelated' ? 'neutral' : 'info'}
            >
              {PAGE_TYPE_LABELS[scan.pageType]}
            </StatusPill>
            <span>{scan.ats === 'generic' ? 'Generic page' : scan.ats}</span>
          </div>
          <h2>{scan.title || 'Untitled page'}</h2>
          <p>
            {scan.fieldCount} fields · {scan.formCount} forms
          </p>
        </section>
      )}

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      <div className="action-stack">
        <button
          className="button button--primary"
          onClick={handleScan}
          disabled={isScanning}
        >
          {isScanning ? 'Scanning…' : 'Scan current page'}
        </button>
        <button
          className="button button--secondary"
          onClick={handleOpenSettings}
        >
          Open settings
        </button>
      </div>

      <footer className="popup-footer">
        <span>Submission controls are disabled in this milestone.</span>
        <span>v0.2.0</span>
      </footer>
    </main>
  );
}
