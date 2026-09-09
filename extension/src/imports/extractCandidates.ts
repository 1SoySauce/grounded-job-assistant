import { emptyApplicant, type ImportDraft } from '../types/applicant';

// Conservative exact-text suggestions only. History and dates require manual mapping.
export function createImportDraft(resumeId: string, text: string): ImportDraft {
  if (text.length > 200_000)
    throw new Error('Extracted text exceeds the 200,000 character limit.');
  const candidate = emptyApplicant().profile;
  const emails = [
    ...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
  ];
  if (emails.length === 1) candidate.personal.email = emails[0]!;
  for (const [key, domain] of [
    ['linkedinUrl', 'linkedin.com'],
    ['githubUrl', 'github.com'],
  ] as const) {
    const urls = [
      ...new Set(
        (text.match(/https?:\/\/[^\s<>]+/g) ?? []).filter((value) => {
          try {
            return new URL(value).hostname.replace(/^www\./, '') === domain;
          } catch {
            return false;
          }
        }),
      ),
    ];
    if (urls.length === 1) candidate.personal[key] = urls[0]!;
  }
  return {
    id: crypto.randomUUID(),
    resumeId,
    status: 'unverified',
    text,
    createdAt: new Date().toISOString(),
    candidate,
  };
}
