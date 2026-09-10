# Project Status

Last updated: 2026-09-10

## Current milestone and Git state

Milestone 2.5 — structured resume parsing implemented and automated checks passed; **manual Brave/Chrome verification pending**.

Branch: `milestone-2-5-resume-parsing`. No commits or pushes were made. The working changes are ready for manual review. Extension version remains **0.2.0**.

## Completed functionality

- My Profile: editable personal/contact fields, multiple education and employment entries, projects, all skill categories, and certifications. Add, edit, remove, review, and save are implemented. Required entry names, email, URL schemes, sizes, and unique IDs are validated.
- Profile verification: saving requires explicit accuracy confirmation. Editing resets confirmation. The repository derives verification from reviewed values; deleting data removes its verification. Unknown blank fields stay unknown. Stable history entry IDs prevent verification moving between entries.
- Answer Library: create, edit, remove, and save verified factual, reusable custom, AI-generation-allowed-later, and always-ask answers. Exact saved values are separate from profile facts. New entries default to always ask. Saved factual/custom values require explicit confirmation. Blank and duplicate questions/answers are rejected. Protected demographic categories are explicitly configured; generation mode is rejected for these categories. No AI generation occurs.
- Job Preferences: desired/excluded titles, title keywords, locations, workplace preferences, salaries, employment/role types, industries, and excluded companies. Empty salary values stay null. Negative amounts and desired salaries below the minimum are rejected.
- Multiple resumes: PDF/DOCX original files up to 10 MB, names, intended categories, MIME, filename, byte size, original modified time, added/updated timestamps, rename/metadata editing, and explicit deletion.
- Local resume extraction: PDF.js with a directly supplied packaged worker; bundled fonts/character maps. Mammoth raw-text extraction in a terminable DOCX worker. Files are checked by extension, MIME, signature, and parser. Parsing is bounded by 30 seconds and 200,000 text characters; PDFs are limited to 50 pages.
- Import review: extracted text and conservative suggestions become an **unverified draft**. Every nonblank personal value, history record, and skill category has an independently persisted decision. Genuine scalar conflicts default to Keep saved; new scalars and clearly new records default to Include; possible duplicates default to Exclude until individually approved as separate records; exact duplicates remain skipped. Confirmation applies only retained choices. Blank imported values never erase saved facts, excluded skills never remove saved skills, unrelated unverified facts are not promoted, and a consumed draft cannot be confirmed twice.
- Structured resume parsing: deterministic local section detection now proposes standalone names, contact/location data, multiple education and employment records, explicitly labeled majors/concentrations/minors, date ranges with source precision, responsibilities, explicitly mentioned employment technologies, Projects-section records and URLs, categorized skills, and explicit Certifications-section records. It uses no network or AI service.
- Confidence and provenance: every parser-created field/list suggestion carries a numeric score, high/medium/low classification, source section, source path, and source text. This metadata remains in the unverified draft and is displayed in grouped Contact, Education, Employment, Projects, Skills, and Certifications review cards; it is not copied into the verified profile as a fact.
- Duplicate handling: normalized exact history duplicates are displayed and skipped. Same-primary-field possible duplicates are displayed and cannot be appended until the user explicitly approves creating a separate record. Records are never automatically merged.
- UI: the four requested sections are enabled in the existing design; later sections remain disabled. Unsaved profile/answer/preference, resume-metadata, and review edits have navigation guards. Errors leave edits available and do not reset stored data.
- Milestone 1 preserved: popup/dashboard, active-tab scan, content script, scan heuristics, runtime message contracts, and permissions. Popup version reflects v0.2.0. Profile reads use a compatibility projection of the v2 source.
- Documentation: updated architecture plan, README, threat model, and detailed manual test guide.

## Storage architecture and versions

| Concept                     | Location                                           | Version / behavior                                                                                    |
| --------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Profile                     | `chrome.storage.local["gja.applicant.v2"].profile` | Profile schema 2, verification indexed by stable source paths                                         |
| Answer Library              | Same envelope, `answers`                           | Separate from profile and imports                                                                     |
| Job Preferences             | Same envelope, `preferences`                       | Separate from profile and answers                                                                     |
| Unverified drafts           | Same envelope, `imports`                           | Candidate + text + provenance + per-change decisions + resume ID; always unverified                    |
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
- All tests: **132 passed across 10 files** (includes the original Milestone 1 and Milestone 2 tests).
- Production build: passed, output at `extension/dist`.
- Separate dist/manifest audit: passed. It checks required runtime files, local parser workers/font assets, original permissions, and absence of new external/host access declarations.
- Git diff confirms the manifest changed only in version; content script, scanner, and message contracts are unchanged.
- No automated browser installation or Playwright implementation was performed. Real Brave/Chrome extension startup, worker execution, CSP, and browser persistence checks remain manual.

Tests cover v1 migration and retained originals, malformed/current/future/unknown-field data, failed migration writes, concurrent/stale writes, profile/history CRUD, skill edits, all answer modes, demographic restrictions, preferences, validation, draft isolation, conflict confirmation, repeat-import prevention, IndexedDB binary persistence/metadata/deletion/corruption, actual synthetic PDF/DOCX extraction, worker selection/cleanup/deadlines, and settings/resume UI behavior. Milestone 2.5 adds sanitized cases for heading normalization, inline headings, conservative name/contact mapping, ambiguous values, multiple education/employment entries, month/year and year-only ranges, Present/Current, bullet association, employment technologies, categorized skills, projects, certifications, missing sections, malformed text, confidence/provenance, exact duplicates, and possible-duplicate approval.

Manual Brave follow-up fixes add regression coverage for rejecting phone/URL contact tokens as countries, recognized and explicitly labeled countries, separate Major/Concentration/Minor education lines, title-plus-location and company-plus-location headers, ambiguous title suffixes that must remain untouched, composite skill labels, and wrapped multi-line project bullets that must not become projects.

The second Brave hardening pass separates institution/location and degree/graduation-date suffixes, stops inline labeled education values at the next label, reserves next-employment header lines before associating wrapped responsibilities, recognizes later URL-free projects using multiple contextual signals, omits uncertain header-like project lines rather than merging them into bullets, and compares only narrowly normalized phone/state/email forms for contact conflicts while preserving the saved display value.

The third Brave hardening pass pairs an immediately adjacent project-type descriptor with the stronger preceding title, preserves month/year text attached to titles, keeps later genuine project boundaries, and gives project name, description, responsibilities, technologies, and URLs independently traceable source text. Ten sanitized regressions cover paired, mixed, URL-free, dated, wrapped, ambiguous, and false-fragment layouts.

The import-review safety pass replaces global conflict and duplicate switches with per-field, per-history-record, and per-skill-category decisions. Decisions reset final confirmation when changed and persist with unverified drafts. The comparison UI uses indexed human-readable labels without UUIDs, balanced proportional columns, fully wrapped long values, and a keyboard-focusable horizontal scrolling region for narrow windows.

## Current limitations

- Resume interpretation remains heuristic and conservative. It works best with clear line-oriented section headings and conventional one-column ordering. Multi-column PDF text can interleave fields; institutions without education keywords, unusual job titles, narrative skill lists, split URLs, combined contact lines, and projects without strong header evidence may be omitted or require correction. Unusual descriptor wording may remain in description text or be omitted, and adjacent title-like lines without supporting bullets can remain ambiguous. The parser intentionally prefers missing a value to inventing one.
- Employment/company-role ordering and location parsing use nearby-line relationships. Unusual layouts may swap or omit fields; every proposal must be reviewed against its displayed source text.
- Formatting-equivalent contact comparison is intentionally narrow: phone punctuation and an optional US `1` prefix, US state full-name/abbreviation pairs, and email casing. Extensions, ambiguous regional names, and other identity fields are not fuzzily matched.
- Technology recognition inside employment is limited to an explicit local vocabulary plus explicit project/skill labels. It does not infer certifications or skills from general experience.
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
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify:dist
```

Prerequisite: Node.js 24.15+ and pnpm 11.19.0. No environment variables or API keys are needed.

## Manual browser tests to perform now

Follow [docs/MILESTONE_2_5_MANUAL_TESTS.md](docs/MILESTONE_2_5_MANUAL_TESTS.md) for exact Brave/Chrome structured-parsing steps, then retain the Milestone 2 regression checks in [docs/MILESTONE_2_MANUAL_TESTS.md](docs/MILESTONE_2_MANUAL_TESTS.md).

Use `brave://extensions` or `chrome://extensions` and **Reload** the existing extension to preserve its local data, or **Load unpacked** from:

`C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension\dist`

Verify representative PDF and DOCX layouts; grouped confidence/provenance; correction/removal; exact and possible duplicate behavior; confirmation reset-on-edit; raw text retention; no profile mutation before confirmation; OCR messaging; no external data requests; and the existing Milestone 1/2 regressions.

Do not commit or proceed to Milestone 3 until manual verification is complete.

## Exact next recommended milestone

**Milestone 3 — generic job-posting detection and normalized scanning only, after Milestone 2 manual verification.**

Read the status, implementation plan, and any manual-test findings first. Preserve the verified/unverified separation, repositories, migration behavior, review requirements, current tests, and permissions. Implement semantic/ARIA/JSON-LD job extraction into a normalized JobPosting with required/preferred/unknown qualification distinctions and sanitized DOM fixture tests. Do not add scoring, ATS-specific adapters, form autofill, AI calls, resume uploads to websites, navigation, queueing, or submission.
