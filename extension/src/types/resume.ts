import { z } from 'zod';

export const ResumeMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(120),
  displayName: z.string().trim().min(1).max(200),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  targetRoles: z.array(z.string().trim().max(200)).max(100),
  verified: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ResumeMetadata = z.infer<typeof ResumeMetadataSchema>;
