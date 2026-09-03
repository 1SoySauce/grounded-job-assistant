import { z } from 'zod';

export const ApplicationStatusSchema = z.enum([
  'saved',
  'applying',
  'applied',
  'interview',
  'rejected',
  'offer',
  'withdrawn',
]);

export const ApplicationRecordSchema = z.object({
  id: z.string().min(1).max(120),
  company: z.string().max(300),
  title: z.string().max(300),
  url: z.url().max(2_048),
  dateFound: z.iso.datetime(),
  dateApplied: z.iso.datetime().nullable(),
  matchScore: z.number().int().min(0).max(100).nullable(),
  status: ApplicationStatusSchema,
  ats: z.string().max(100),
  resumeId: z.string().max(120).nullable(),
  jobId: z.string().max(200).nullable(),
  notes: z.string().max(20_000),
});

export type ApplicationRecord = z.infer<typeof ApplicationRecordSchema>;
