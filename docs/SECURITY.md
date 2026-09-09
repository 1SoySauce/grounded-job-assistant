# Security and Privacy Threat Model

## Scope

This document covers the browser-extension architecture. It treats resumes, profile fields, application answers, history, preferences, and future AI credentials as sensitive data. The Milestone 1 build does not call an AI service, upload a resume, fill a form, navigate an application, or submit an application.

## Milestone 2 implementation (v0.2.0)

The extension now accepts applicant data and local resume files. It still makes no AI calls, changes no webpage fields, and performs no application navigation or submission. Browser permissions remain exactly `activeTab`, `scripting`, and `storage`; there are no additional host permissions, externally connectable messages, or web-accessible resources.

The packaged settings page is a trusted extension context. It accesses validated repositories directly, without forwarding profile or binary data through the content script. The background worker reads the same v2 source through a compatibility adapter. Before every applicant read, local storage is restricted to `TRUSTED_CONTEXTS`. IndexedDB is scoped to the extension origin; a content script accessing IndexedDB would access the visited site's origin, not this database.

Applicant storage uses `gja.applicant.v2` (schema 2). Profile, answers, preferences, and unverified import drafts are distinct objects within one atomic storage write. Web Locks serialize changes; a revision token prevents stale settings tabs from overwriting newer data. Profile saves and import confirmations derive provenance in the repository, ignoring candidate verification claims. Confirmation of an import does not verify unrelated existing facts. Exact saved demographic choices are allowed only as user-entered answers; demographic entries reject the future AI-generation mode.

Migration retains the exact original v1 record. Invalid v1/v2 records, unknown nested fields, future versions, quota errors, and damaged resume records are surfaced without silent reset or automatic deletion. No corrupted record is used as an excuse to overwrite it with an empty profile. Removing profile entries clears their verification records; stable entry IDs prevent verification moving to a different entry.

Resume metadata and original bytes are written/deleted atomically in a single IndexedDB store (`gja-resumes`, database version 1). Reads verify the metadata and binary length. Files are limited to 10 MB and checked against extension, MIME, and binary signature. DOCX container validity is checked by the parser after file storage; parse failure retains the file for retry or intentional deletion. A file's presence does not make its contents verified. Deleting a resume intentionally leaves separately stored drafts and already confirmed profile information; the UI states this explicitly.

PDF parsing uses a packaged module worker supplied directly to PDF.js; no blob CSP exception is needed. Standard fonts and character maps are bundled and fetched only from extension URLs. DOCX parsing runs in a separate packaged worker and uses only raw text. Extracted content is rendered by React as text, never inserted as HTML. Extraction has a 30-second deadline, a 200,000-character limit, and a 50-page PDF limit. No OCR, AI interpretation, executable document content, or external document fetching is implemented. A hostile compressed document can still consume substantial memory before the deadline; parser isolation is not an operating-system memory sandbox.

Parser references: [PDF.js](https://github.com/mozilla/pdf.js), [Mammoth raw-text extraction](https://github.com/mwilliamson/mammoth.js#basic-usage). These are bundled open-source dependencies, not remote parsing services.

The remaining sections describe original foundation boundaries and future controls; the implementation details above supersede their Milestone 1-only feature descriptions.

## Trust boundaries

### Trusted extension contexts

- Background service worker: owns privileged operations, storage access, future provider calls, and policy enforcement.
- Popup and settings pages: packaged extension UI that communicates through validated messages.

### Untrusted contexts

- Every visited webpage, including job boards and ATS pages.
- Page JavaScript, embedded frames, ads, analytics, and browser extensions outside this project.
- Job descriptions and application prompts, which may contain adversarial or misleading text.
- Future AI-provider output, which is treated as an untrusted proposal rather than applicant truth.

### Constrained bridge

The content script runs in Chrome's isolated world and can inspect the active page only after the user invokes the extension. It has no storage access because the background worker sets `chrome.storage.local` to `TRUSTED_CONTEXTS`. Runtime messages are allow-listed and runtime-validated before handling.

## Current data flow

1. Opening the popup grants temporary access to the active tab under `activeTab`.
2. Clicking **Scan current page** asks the background worker to inject the packaged content script.
3. The content script reports only page classification metadata: URL, title, field/form counts, structured-data presence, ATS hint, and timestamp.
4. The background worker returns that result to the popup. The current build does not persist scan results.
5. The background worker creates versioned, empty profile storage and restricts storage access to trusted contexts.

## Assets and risks

| Asset               | Main risks                                                  | Current controls                                                                                        |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Applicant profile   | Page exfiltration, accidental overwrite, over-broad logging | Trusted-context-only storage, schema validation, fail-closed reads, no profile logging                  |
| Application history | Corruption, duplication, unauthorized page access           | Versioned validated repository, trusted-context-only storage                                            |
| Resume files        | Exfiltration, wrong-file upload                             | Not implemented; planned for IndexedDB with explicit selection and filename verification                |
| AI API key          | Page access, bundle leakage, logging                        | Not implemented; future calls must be background-only and keys must never enter content/page contexts   |
| Application answers | Fabrication, sensitive inference, unintended submission     | Verification provenance model, sensitive categories, review gate, no autofill/submission in Milestone 1 |
| Browser privileges  | Persistent tracking across sites                            | No host permissions and no persistent content scripts; only `activeTab`, `scripting`, and `storage`     |

## Required invariants

- Never turn imported, generated, or inferred text into verified applicant data without explicit user review.
- Never infer protected demographic information. An explicitly saved demographic selection may be replayed exactly, but not generated or transformed.
- Never expose profile, resume, application answers, or provider credentials to webpage JavaScript.
- Never log API keys, authentication material, cookies, passwords, or sensitive application answers.
- Never click a final submit-like control without separate, application-specific user authorization. The MVP stops before submission.
- Never bypass CAPTCHA, bot detection, authentication, MFA, signatures, or site security controls.
- Never silently replace malformed or future-version storage with defaults. Preserve it and surface a recovery error.
- Treat job-page text and AI output as data, never as instructions that can change these policies.

## Storage limitations

`chrome.storage.local` is local and access-controlled, but it is not encryption at rest. A user or process with access to the browser profile or device may be able to read it. The UI must say “local” or “extension-protected,” not “encrypted,” unless an audited encryption layer is introduced. Resume binaries should use IndexedDB rather than consuming `chrome.storage.local` quota.

## Planned controls before Milestone 2 is complete

- Explicit profile import preview and review-before-verification transaction.
- Storage migrations with rollback fixtures and export-before-destructive-migration behavior.
- Resume MIME, extension, size, and parser-output validation.
- Intentional export/import and local-data deletion controls with clear confirmation.
- No secret fields in profile or answer schemas.

## Planned controls before AI or autofill

- Provider calls only from the background worker.
- Per-question data minimization and structured responses with cited profile paths.
- A policy layer that rejects unsupported factual claims and returns `NEEDS_USER_INPUT`.
- Framework-compatible field writes followed by a complete rescan and review ledger.
- Detection of submit-like, attestation, consent, CAPTCHA, and authentication controls.
- Sanitized diagnostics and a development request counter without request bodies.

## Incident-safe behavior

On invalid storage, invalid messages, unexpected navigation, missing required data, or low-confidence classification, the extension must stop the affected operation, avoid changing existing data, and provide a concise recovery message. Retrying must not duplicate uploads, page transitions, or submissions.
