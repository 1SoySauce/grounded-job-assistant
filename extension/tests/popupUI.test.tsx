// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { App } from '../src/pages/popup/App';
import { sendRuntimeRequest } from '../src/services/runtimeClient';
import type { JobPosting } from '../src/types/jobPosting';
import type { PageScanResult } from '../src/types/scanner';

vi.mock('../src/services/runtimeClient', () => ({
  sendRuntimeRequest: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const url = 'https://careers.example.test/jobs/technician-team-leader';
const scannedAt = '2026-10-01T12:00:00.000Z';

function posting(title: string | null = 'Technician Team Leader'): JobPosting {
  const unknown = {
    value: null,
    score: 0,
    confidence: 'low' as const,
    conflicted: false,
    provenance: [],
  };
  return {
    schemaVersion: 1,
    title:
      title === null
        ? unknown
        : {
            value: title,
            score: 0.95,
            confidence: 'high',
            conflicted: false,
            provenance: [
              {
                source: 'json_ld',
                locator: 'json-ld[0]$.title',
                excerpt: title,
              },
            ],
          },
    company: unknown,
    location: unknown,
    compensation: unknown,
    description: unknown,
    requirements: { required: [], preferred: [], unknown: [] },
    currentUrl: url,
    canonicalUrl: unknown,
    requisitionId: unknown,
    extractedAt: scannedAt,
  };
}

async function scanResult(overrides: Partial<PageScanResult>) {
  const scan: PageScanResult = {
    pageType: 'job_posting',
    ats: 'taleo',
    title: 'Position Description',
    url,
    fieldCount: 1,
    formCount: 0,
    hasJobPostingStructuredData: true,
    jobPosting: null,
    scannedAt,
    ...overrides,
  };
  vi.mocked(sendRuntimeRequest).mockImplementation(async (request) => {
    if (request.type === 'GET_DASHBOARD_SNAPSHOT') {
      return {
        ok: true,
        type: 'DASHBOARD_SNAPSHOT',
        data: {
          profileReady: false,
          verifiedFieldCount: 0,
          applicationCount: 0,
        },
      };
    }
    if (request.type === 'SCAN_ACTIVE_TAB') {
      return { ok: true, type: 'PAGE_SCAN', data: scan };
    }
    throw new Error(`Unexpected popup request: ${request.type}`);
  });

  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Scan current page' }));
  const heading = await screen.findByRole('heading', { level: 2 });
  expect(sendRuntimeRequest).toHaveBeenCalledWith({ type: 'SCAN_ACTIVE_TAB' });
  return heading;
}

describe('popup scan result title', () => {
  it('shows the normalized job title instead of the document title', async () => {
    const heading = await scanResult({ jobPosting: posting() });

    expect(heading).toHaveTextContent(/^Technician Team Leader$/);
    expect(screen.queryByText('Position Description')).not.toBeInTheDocument();
    expect(screen.getByText('Job posting')).toBeVisible();
    expect(screen.getByText('taleo')).toBeVisible();
    expect(screen.getByText('1 fields · 0 forms')).toBeVisible();
  });

  it.each([
    { name: 'no normalized posting', jobPosting: null },
    { name: 'a normalized posting without a title', jobPosting: posting(null) },
  ])('shows a neutral job label with $name', async ({ jobPosting }) => {
    const heading = await scanResult({ jobPosting });

    expect(heading).toHaveTextContent(/^Job posting detected$/);
    expect(screen.queryByText('Position Description')).not.toBeInTheDocument();
  });

  it.each([
    'application_form',
    'application_confirmation',
    'unrelated',
  ] as const)(
    'preserves the document title for %s even when a normalized title exists',
    async (pageType) => {
      const heading = await scanResult({
        pageType,
        title: 'Candidate portal',
        jobPosting: posting(),
      });

      expect(heading).toHaveTextContent(/^Candidate portal$/);
    },
  );

  it.each([
    'application_form',
    'application_confirmation',
    'unrelated',
  ] as const)(
    'preserves Untitled page for %s without a document title',
    async (pageType) => {
      const heading = await scanResult({ pageType, title: '' });

      expect(heading).toHaveTextContent(/^Untitled page$/);
    },
  );
});
