import { describe, expect, it } from 'vitest';
import {
  RuntimeRequestSchema,
  RuntimeResponseSchema,
} from '../src/types/messages';

describe('runtime message validation', () => {
  it('accepts an allow-listed request', () => {
    expect(
      RuntimeRequestSchema.safeParse({ type: 'SCAN_ACTIVE_TAB' }).success,
    ).toBe(true);
  });

  it('rejects unknown operations and extra payloads', () => {
    expect(
      RuntimeRequestSchema.safeParse({ type: 'DELETE_ALL_DATA' }).success,
    ).toBe(false);
    expect(
      RuntimeRequestSchema.safeParse({
        type: 'SCAN_ACTIVE_TAB',
        injected: true,
      }).success,
    ).toBe(false);
  });

  it('rejects malformed scan responses', () => {
    expect(
      RuntimeResponseSchema.safeParse({
        ok: true,
        type: 'PAGE_SCAN',
        data: { pageType: 'job_posting' },
      }).success,
    ).toBe(false);
  });

  it('accepts the expanded coarse scan response with no normalized posting', () => {
    expect(
      RuntimeResponseSchema.safeParse({
        ok: true,
        type: 'PAGE_SCAN',
        data: {
          pageType: 'job_posting',
          ats: 'generic',
          title: 'Platform Support Engineer',
          url: 'https://careers.example.test/jobs/platform-support-engineer',
          fieldCount: 0,
          formCount: 0,
          hasJobPostingStructuredData: true,
          jobPosting: null,
          scannedAt: '2026-09-17T12:00:00.000Z',
        },
      }).success,
    ).toBe(true);
  });
});
