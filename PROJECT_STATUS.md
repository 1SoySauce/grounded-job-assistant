# Project Status

Last updated: 2026-09-09

## Current milestone and Git state

Milestone 2 — implemented and automated checks passed; **manual Brave/Chrome verification pending**.

Branch: `milestone-2-profile-data`. No commits or pushes were made. The working changes are ready for manual review. Extension version: **0.2.0**.

## Completed functionality

- My Profile: editable personal/contact fields, multiple education and employment entries, projects, all skill categories, and certifications. Add, edit, remove, review, and save are implemented. Required entry names, email, URL schemes, sizes, and unique IDs are validated.
- Profile verification: saving requires explicit accuracy confirmation. Editing resets confirmation. The repository derives verification from reviewed values; deleting data removes its verification. Unknown blank fields stay unknown. Stable history entry IDs prevent verification moving between entries.
- Answer Library: create, edit, remove, and save verified factual, reusable custom, AI-generation-allowed-later, and always-ask answers. Exact saved values are separate from profile facts. New entries default to always ask. Saved factual/custom values require explicit confirmation. Blank and duplicate questions/answers are rejected. Protected demographic categories are explicitly configured; generation mode is rejected for these categories. No AI generation occurs.
- Job Preferences: desired/excluded titles, title keywords, locations, workplace preferences, salaries, employment/role types, industries, and excluded companies. Empty salary values stay null. Negative amounts and desired salaries below the minimum are rejected.
- Multiple resumes: PDF/DOCX original files up to 10 MB, names, intended categories, MIME, filename, byte size, original modified time, added/updated timestamps, rename/metadata editing, and explicit deletion.
- Local resume extraction: PDF.js with a directly supplied packaged worker; bundled fonts/character maps. Mammoth raw-text extraction in a terminable DOCX worker. Files are checked by extension, MIME, signature, and parser. Parsing is bounded by 30 seconds and 200,000 text characters; PDFs are limited to 50 pages.
- Import review: extracted text and conservative exact contact suggestions become an **unverified draft**. Drafts can be edited, saved, reopened, discarded, or explicitly confirmed. Confirmation alone promotes reviewed facts into the profile. Existing/profile and proposed values are displayed for comparison. Conflicting contact replacements require an additional explicit choice. Blank imported values never erase saved facts; history appends and skills combine. Unrelated unverified facts are not promoted. A consumed draft cannot be confirmed twice.
- UI: the four requested sections are enabled in the existing design; later sections remain disabled. Unsaved profile/answer/preference, resume-metadata, and review edits have navigation guards. Errors leave edits available and do not reset stored data.
- Milestone 1 preserved: popup/dashboard, active-tab scan, content script, scan heuristics, runtime message contracts, and permissions. Popup version reflects v0.2.0. Profile reads use a compatibility projection of the v2 source.
- Documentation: updated architecture plan, README, threat model, and detailed manual test guide.

## Storage architecture and versions

| Concept                     | Location                                           | Version / behavior                                                                                    |
| --------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Profile                     | `chrome.storage.local["gja.applicant.v2"].profile` | Profile schema 2, verification indexed by stable source paths                                         |
| Answer Library              | Same envelope, `answers`                           | Separate from profile and imports                                                                     |
| Job Preferences             | Same envelope, `preferences`                       | Separate from profile and answers                                                                     |
| Unverified drafts           | Same envelope, `imports`                           | Candidate profile + extracted text + original resume ID; status always unverified                     |
| Applicant envelope          | `gja.applicant.v2`                                 | Schema 2, monotonic revision, atomic write                                                            |
| Original Milestone 1 data   | `gja.profile.v1`                                   | Retained unchanged after successful migration for recovery                                            |
| Resume originals + metadata | IndexedDB `gja-resumes`, store `resumes`           | Database version 1; record/metadata schema 2; original ArrayBuffer and metadata share one transaction |
| Application history         | Existing `gja.applications.v1`                     | Unchanged                                                                                             |

Trusted settings UI and the background use shared validated repositories. Web Locks serialize applicant writes across extension contexts; revision checks reject stale tab updates. IndexedDB transactions and resume revisions protect file metadata edits/deletions. Chrome local storage is restricted to `TRUSTED_CONTEXTS`; no applicant information is sent to content scripts or external services.

Migration copies supported v1 data into separate v2 concepts, preserves existing verification and timestamps, converts indexed history verification paths to stable entry IDs, and retains the original v1 record. Invalid, future-version, or unknown-field records stop operations with an error instead of being discarded. Failed storage writes leave existing data intact. Damaged resume bytes/metadata block modification rather than triggering deletion.

Deleting a resume removes its binary and metadata atomically. Its separately saved import drafts and already confirmed profile values intentionally remain; the UI explains this. Users can discard drafts separately.

## Verification results

Performed on Windows with Node.js **24.19.0**, pnpm **11.19.0**:

- Formatting check: passed.
- ESLint: passed, zero warnings.
- Strict TypeScript: passed.
- All tests: **66 passed across 9 files** (includes the original 10 Milestone 1 tests).
- Production build: passed, output at `extension/dist`.
- Separate dist/manifest audit: passed. It checks required runtime files, local parser workers/font assets, original permissions, and absence of new external/host access declarations.
- Git diff confirms the manifest changed only in version; content script, scanner, and message contracts are unchanged.
- No automated browser installation or Playwright implementation was performed. Real Brave/Chrome extension startup, worker execution, CSP, and browser persistence checks remain manual.

Tests cover v1 migration and retained originals, malformed/current/future/unknown-field data, failed migration writes, concurrent/stale writes, profile/history CRUD, skill edits, all answer modes, demographic restrictions, preferences, validation, provenance, draft isolation, conflict confirmation, repeat-import prevention, IndexedDB binary persistence/metadata/deletion/corruption, actual synthetic PDF/DOCX extraction, worker selection/cleanup/deadlines, and settings/resume UI behavior.

## Current limitations

- Resume interpretation is deliberately conservative: only a single unambiguous email and explicit GitHub/LinkedIn URLs are suggested automatically. Names, dates, history, skills, credentials, and other fields must be manually mapped/corrected alongside the extracted text.
- There is no OCR. Image-only, encrypted, damaged, complex, or oversized documents may require manual entry or a different file. A failed extraction retains the original file for retry/removal.
- Imported history appends; semantic duplicate-history detection is not implemented. Review existing history before confirming.
- Parser deadlines do not impose a hard operating-system memory limit on hostile compressed documents.
- Chrome local storage and IndexedDB are local and access-controlled, not encrypted at rest. Browser profile deletion/uninstall removes extension data.
- Full backup export/restore and a corruption-repair UI are not implemented. Original v1 data is retained and malformed data is never silently reset.
- The v1-compatible salary fields remain numbers without separate currency/pay-period fields. Keep values in matching units and record those units explicitly in the salary Answer Library answer.
- Vite emits the preexisting harmless Zod comment-annotation warnings. Node parser fixture tests emit PDF diagnostic warnings for missing optional fixture font data and intentionally invalid PDF input; assertions pass. Production fonts and character maps are packaged.
- Vite's web preview is for the foundation UI. Applicant editing requires the installed extension and fails with a clear message on localhost.
- No Milestone 3 features were added.

## Exact commands

```powershell
cd "C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension"
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:dist
```

Prerequisite: Node.js 24.15+ and pnpm 11.19.0. No environment variables or API keys are needed.

## Manual browser tests to perform now

Follow [docs/MILESTONE_2_MANUAL_TESTS.md](docs/MILESTONE_2_MANUAL_TESTS.md) for exact Brave/Chrome steps.

Use `brave://extensions` or `chrome://extensions` and **Reload** the existing extension to preserve its local data, or **Load unpacked** from:

`C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension\dist`

Verify profile/history CRUD and persistence; accuracy checkboxes and reset-on-edit; all answer modes and demographic restrictions; every preference; multiple PDF/DOCX files; unverified review before confirmation; contact conflict replacement; resume rename/delete; extraction failures; restart persistence; two-tab stale-write handling; no external data requests; and Milestone 1 scanner/popup regressions.

Do not commit or proceed to Milestone 3 until manual verification is complete.

## Exact next recommended milestone

**Milestone 3 — generic job-posting detection and normalized scanning only, after Milestone 2 manual verification.**

Read the status, implementation plan, and any manual-test findings first. Preserve the verified/unverified separation, repositories, migration behavior, review requirements, current tests, and permissions. Implement semantic/ARIA/JSON-LD job extraction into a normalized JobPosting with required/preferred/unknown qualification distinctions and sanitized DOM fixture tests. Do not add scoring, ATS-specific adapters, form autofill, AI calls, resume uploads to websites, navigation, queueing, or submission.
