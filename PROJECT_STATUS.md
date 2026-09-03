# Project Status

Last updated: 2026-09-03

## Current milestone

Milestone 1 — Extension foundation: **complete**.

## Completed

- Inspected the starting repository. It was empty and was not initialized as a Git repository.
- Created a self-contained `/extension` workspace using Manifest V3, TypeScript, React, Vite, modern CSS, and strict TypeScript settings.
- Created polished popup and settings/dashboard pages with responsive behavior and a development-only browser preview.
- Added a background service worker and an on-demand isolated-world content script.
- Limited permissions to `activeTab`, `scripting`, and `storage`; there are no blanket host permissions or persistent content scripts.
- Restricted `chrome.storage.local` to `TRUSTED_CONTEXTS`, preventing content-script access.
- Added strict runtime message validation and rejection of unknown message operations.
- Added a conservative current-page scanner that reports page type, ATS hint, title, URL, field/form counts, and JobPosting JSON-LD presence.
- Added known-host hints for Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS, Jobvite, and Taleo. These are hints only, not full adapters.
- Added a complete versioned profile schema foundation covering the requested personal, education, employment, project, skill, certification, preference, and answer-library shapes.
- Added explicit field-verification provenance so deterministic autofill can later require verified source paths.
- Added separate resume metadata and application-history domain models.
- Added validated profile and application-history repositories that preserve and report invalid stored data instead of silently overwriting it.
- Added `AIProvider`, `ATSAdapter`, `BrowserDriver`, application-field, fill-proposal, and confidence contracts for later milestones.
- Added a reproducible production build for extension pages, service worker, and standalone content-script bundle.
- Added a build-time audit that verifies required artifacts, Manifest V3, the reviewed permission set, and the absence of persistent host/content-script access.
- Added the architecture roadmap in `IMPLEMENTATION_PLAN.md`, installation/development instructions in `README.md`, and the threat model in `docs/SECURITY.md`.
- Updated the lint toolchain to the currently supported ESLint 10 line.

## Currently works

- `pnpm build` produces an unpacked extension in `extension/dist`.
- The popup displays profile readiness and application count.
- **Scan current page** requests temporary access to the active `http(s)` tab, injects the packaged content script, performs a conservative scan, and displays the result.
- Restricted/internal browser pages fail with a user-facing message instead of prompting for broader access.
- **Open settings** opens the settings dashboard.
- First install creates an empty versioned profile; no invented or imported facts are marked verified.
- Popup and dashboard visual smoke tests passed at desktop and extension-popup dimensions with no console errors.

## Verification results

- Prettier formatting check: passed.
- ESLint: passed with zero warnings.
- Strict TypeScript validation: passed.
- Vitest: 3 files, 10 tests passed.
- Vite/esbuild production build: passed.
- Manifest and output audit: passed.
- Visual browser smoke test: passed for popup and settings pages.

## Unfinished

- Milestone 2 profile editor, answer-library editor, job preferences UI, and profile import/export.
- Resume binary storage, PDF/DOCX parsing, imported-data review, and multiple-resume management.
- Detailed normalized job extraction and requirement classification.
- Match scoring, generic field detection, deterministic autofill, review sidebar, ATS adapters, AI provider, resume upload, multi-step state machine, tracker UI, queue, and assisted apply.
- Actual Chrome and Edge load-unpacked smoke tests on this machine.

## Bugs and limitations

- The scanner is intentionally coarse and proves the runtime pipeline only; it does not yet produce a normalized `JobPosting`.
- Job scanning is limited to user-invoked `http://` and `https://` tabs.
- Local extension storage is access-controlled but is not encryption at rest.
- Vite emits harmless third-party Zod comment-annotation warnings during bundling; the bundle and audit still pass.
- Profile and resume controls are deliberately disabled until Milestone 2 so the UI does not imply unimplemented safety-critical behavior works.
- The extension has not been installed automatically because browser-extension installation is a user-controlled browser action. Load `extension/dist` manually using the instructions below.

## Commands

```powershell
cd "C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension"
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
pnpm check
```

Individual commands:

```powershell
pnpm dev
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:dist
```

Load `C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension\dist` from `chrome://extensions` or `edge://extensions` with Developer mode enabled.

## Next recommended task

Implement Milestone 2 only: build the full verified profile, answer-library, and preferences editors; add multiple-resume metadata and IndexedDB-backed PDF/DOCX storage; require preview and explicit review before imported data becomes verified; add migrations and repository/UI tests; then update this status file. Do not add job scanning, match scoring, autofill, AI calls, or submission behavior yet.
