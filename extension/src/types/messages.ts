import { z } from 'zod';
import { PageScanResultSchema } from './scanner';

export const RuntimeRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('GET_DASHBOARD_SNAPSHOT') }).strict(),
  z.object({ type: z.literal('SCAN_ACTIVE_TAB') }).strict(),
  z.object({ type: z.literal('OPEN_OPTIONS') }).strict(),
]);

export const ContentRequestSchema = z
  .object({
    type: z.literal('CONTENT_SCAN_PAGE'),
  })
  .strict();

export const DashboardSnapshotSchema = z.object({
  profileReady: z.boolean(),
  verifiedFieldCount: z.number().int().nonnegative(),
  applicationCount: z.number().int().nonnegative(),
});

const RuntimeErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const RuntimeResponseSchema = z.union([
  z.object({
    ok: z.literal(true),
    type: z.literal('DASHBOARD_SNAPSHOT'),
    data: DashboardSnapshotSchema,
  }),
  z.object({
    ok: z.literal(true),
    type: z.literal('PAGE_SCAN'),
    data: PageScanResultSchema,
  }),
  z.object({ ok: z.literal(true), type: z.literal('OPTIONS_OPENED') }),
  RuntimeErrorSchema,
]);

export type RuntimeRequest = z.infer<typeof RuntimeRequestSchema>;
export type ContentRequest = z.infer<typeof ContentRequestSchema>;
export type DashboardSnapshot = z.infer<typeof DashboardSnapshotSchema>;
export type RuntimeResponse = z.infer<typeof RuntimeResponseSchema>;
