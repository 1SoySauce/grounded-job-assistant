import { z } from 'zod';

export const PageTypeSchema = z.enum([
  'job_posting',
  'application_form',
  'application_confirmation',
  'unrelated',
]);

export const AtsProviderSchema = z.enum([
  'greenhouse',
  'lever',
  'ashby',
  'workday',
  'smartrecruiters',
  'icims',
  'jobvite',
  'taleo',
  'generic',
]);

export const PageScanResultSchema = z.object({
  pageType: PageTypeSchema,
  ats: AtsProviderSchema,
  title: z.string().max(500),
  url: z.url().max(2_048),
  fieldCount: z.number().int().nonnegative(),
  formCount: z.number().int().nonnegative(),
  hasJobPostingStructuredData: z.boolean(),
  scannedAt: z.iso.datetime(),
});

export type PageType = z.infer<typeof PageTypeSchema>;
export type AtsProvider = z.infer<typeof AtsProviderSchema>;
export type PageScanResult = z.infer<typeof PageScanResultSchema>;
