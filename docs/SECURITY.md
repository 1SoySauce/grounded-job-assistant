# Security and Privacy Threat Model

## Scope

This document covers the browser-extension architecture. It treats resumes, profile fields, application answers, history, preferences, and future AI credentials as sensitive data. The Milestone 1 build does not call an AI service, upload a resume, fill a form, navigate an application, or submit an application.

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

| Asset | Main risks | Current controls |
| --- | --- | --- |
| Applicant profile | Page exfiltration, accidental overwrite, over-broad logging | Trusted-context-only storage, schema validation, fail-closed reads, no profile logging |
| Application history | Corruption, duplication, unauthorized page access | Versioned validated repository, trusted-context-only storage |
| Resume files | Exfiltration, wrong-file upload | Not implemented; planned for IndexedDB with explicit selection and filename verification |
| AI API key | Page access, bundle leakage, logging | Not implemented; future calls must be background-only and keys must never enter content/page contexts |
| Application answers | Fabrication, sensitive inference, unintended submission | Verification provenance model, sensitive categories, review gate, no autofill/submission in Milestone 1 |
| Browser privileges | Persistent tracking across sites | No host permissions and no persistent content scripts; only `activeTab`, `scripting`, and `storage` |

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

