// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { App } from '../src/pages/popup/App';
import { sendRuntimeRequest } from '../src/services/runtimeClient';
import type { RuntimeResponse } from '../src/types/messages';
import type { PageScanResult } from '../src/types/scanner';
import type { JobPosting } from '../src/types/jobPosting';

vi.mock('../src/services/runtimeClient', () => ({
  sendRuntimeRequest: vi.fn(),
}));

const snapshotResponse: RuntimeResponse = {
  ok: true,
  type: 'DASHBOARD_SNAPSHOT',
  data: {
    profileReady: true,
    verifiedFieldCount: 8,
    applicationCount: 0,
  },
};

function sourced<T>(value: T) {
  return {
    value,
    score: value === null ? 0 : 0.9,
    confidence: 'high' as const,
    conflicted: false,
    provenance: [],
  };
}

const jobPosting: JobPosting = {
  schemaVersion: 1,
  title: sourced('Software Engineer'),
  company: sourced('Example Company'),
  location: sourced(null),
  compensation: sourced(null),
  description: sourced(null),
  requirements: { required: [], preferred: [], unknown: [] },
  currentUrl: 'https://example.com/jobs/engineer',
  canonicalUrl: sourced(null),
  requisitionId: sourced(null),
  extractedAt: '2026-09-21T12:00:00.000Z',
};

function scanResponse(
  overrides: Partial<PageScanResult> = {},
): RuntimeResponse {
  return {
    ok: true,
    type: 'PAGE_SCAN',
    data: {
      pageType: 'job_posting',
      ats: 'greenhouse',
      title: 'Software Engineer — Example Company',
      url: 'https://example.com/jobs/engineer',
      fieldCount: 12,
      formCount: 2,
      hasJobPostingStructuredData: true,
      jobPosting,
      scannedAt: '2026-09-21T12:00:00.000Z',
      ...overrides,
    },
  };
}

function deferredResponse() {
  let resolve!: (value: RuntimeResponse) => void;
  const promise = new Promise<RuntimeResponse>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.mocked(sendRuntimeRequest).mockReset();
  vi.mocked(sendRuntimeRequest).mockResolvedValue(snapshotResponse);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('popup scan controls', () => {
  it('shows profile loading and readiness without scanning automatically', async () => {
    const snapshot = deferredResponse();
    vi.mocked(sendRuntimeRequest).mockReturnValueOnce(snapshot.promise);
    render(<App />);

    const setup = screen.getByRole('region', { name: 'Setup status' });
    expect(setup).toHaveAttribute('aria-busy', 'true');
    expect(within(setup).getByText('Loading profile…')).toBeVisible();
    expect(screen.getByText('No page scanned yet')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Scan current page' }),
    ).toBeEnabled();

    await act(async () => snapshot.resolve(snapshotResponse));

    expect(within(setup).getByText('Ready to use')).toBeVisible();
    expect(within(setup).getByText('8 verified')).toBeVisible();
    expect(setup).toHaveAttribute('aria-busy', 'false');
    expect(sendRuntimeRequest).toHaveBeenCalledExactlyOnceWith({
      type: 'GET_DASHBOARD_SNAPSHOT',
    });
  });

  it('locks a pending scan and presents the returned page details in live feedback', async () => {
    const scan = deferredResponse();
    vi.mocked(sendRuntimeRequest)
      .mockResolvedValueOnce(snapshotResponse)
      .mockReturnValueOnce(scan.promise);
    render(<App />);
    await screen.findByText('Ready to use');

    fireEvent.click(screen.getByRole('button', { name: 'Scan current page' }));
    const pending = screen.getByRole('button', {
      name: 'Scanning current page…',
    });
    expect(pending).toBeDisabled();
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Reading the current page')).toBeVisible();
    expect(
      screen.getByText('Reading the current page').closest('[aria-live]'),
    ).toHaveAttribute('aria-live', 'polite');
    fireEvent.click(pending);
    expect(sendRuntimeRequest).toHaveBeenCalledTimes(2);
    expect(sendRuntimeRequest).toHaveBeenLastCalledWith({
      type: 'SCAN_ACTIVE_TAB',
    });

    await act(async () => scan.resolve(scanResponse()));

    const results = screen.getByRole('region', {
      name: 'Current page results',
    });
    expect(within(results).getByText('Scan complete')).toBeVisible();
    expect(within(results).getByText('Job posting')).toBeVisible();
    expect(
      within(results).getByRole('heading', {
        name: 'Software Engineer — Example Company',
      }),
    ).toBeVisible();
    expect(
      within(results).getByText('Hiring platform').nextElementSibling,
    ).toHaveTextContent('Greenhouse');
    expect(
      within(results).getByText('Fields').nextElementSibling,
    ).toHaveTextContent('12');
    expect(
      within(results).getByText('Forms').nextElementSibling,
    ).toHaveTextContent('2');
    expect(
      within(results).getByText('Job posting details found'),
    ).toBeVisible();
    expect(
      within(results).getByText('Structured job data detected on this page.'),
    ).toBeVisible();
    expect(
      screen.queryByText('Reading the current page'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Scan current page' }),
    ).toBeEnabled();
  });

  it('reports an unrelated page without inventing job or platform detection', async () => {
    vi.mocked(sendRuntimeRequest)
      .mockResolvedValueOnce(snapshotResponse)
      .mockResolvedValueOnce(
        scanResponse({
          pageType: 'unrelated',
          ats: 'generic',
          title: '',
          fieldCount: 0,
          formCount: 0,
          hasJobPostingStructuredData: false,
          jobPosting: null,
        }),
      );
    render(<App />);
    await screen.findByText('Ready to use');
    fireEvent.click(screen.getByRole('button', { name: 'Scan current page' }));

    const results = await screen.findByRole('region', {
      name: 'Current page results',
    });
    expect(within(results).getByText('No job context detected')).toBeVisible();
    expect(
      within(results).getByRole('heading', { name: 'Untitled page' }),
    ).toBeVisible();
    expect(within(results).getByText('Generic page')).toBeVisible();
    expect(
      within(results).getByText('No job posting details found'),
    ).toBeVisible();
    expect(
      within(results).getByText(
        'No structured job data detected on this page.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText('Job posting details found'),
    ).not.toBeInTheDocument();
  });

  it('announces scan failures and allows a fresh scan to recover', async () => {
    vi.mocked(sendRuntimeRequest)
      .mockResolvedValueOnce(snapshotResponse)
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'SCAN_FAILED', message: 'This tab cannot be scanned.' },
      })
      .mockResolvedValueOnce(scanResponse());
    render(<App />);
    await screen.findByText('Ready to use');
    fireEvent.click(screen.getByRole('button', { name: 'Scan current page' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This tab cannot be scanned.',
    );
    const retry = screen.getByRole('button', { name: 'Scan current page' });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);

    await screen.findByRole('region', { name: 'Current page results' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(sendRuntimeRequest).toHaveBeenCalledTimes(3);
    expect(sendRuntimeRequest).toHaveBeenLastCalledWith({
      type: 'SCAN_ACTIVE_TAB',
    });
  });

  it('opens settings through extension messaging and closes only on success', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    vi.mocked(sendRuntimeRequest)
      .mockResolvedValueOnce(snapshotResponse)
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'OPEN_FAILED',
          message: 'Settings could not be opened.',
        },
      })
      .mockResolvedValueOnce({ ok: true, type: 'OPTIONS_OPENED' });
    render(<App />);
    await screen.findByText('Ready to use');
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Settings could not be opened.',
    );
    expect(close).not.toHaveBeenCalled();
    expect(sendRuntimeRequest).toHaveBeenLastCalledWith({
      type: 'OPEN_OPTIONS',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(sendRuntimeRequest).toHaveBeenLastCalledWith({
      type: 'OPEN_OPTIONS',
    });
  });
});
