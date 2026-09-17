# AI Job Application Assistant — Implementation Plan

## Product principles

1. **Truth before automation.** Only verified profile, resume, and manually saved answer data may be treated as facts.
2. **Human-controlled submission.** The extension stops before any final submit-like action. Auto-submit is outside the MVP and must remain off by default if it is added later.
3. **Least privilege.** The MVP uses `activeTab`, `scripting`, and `storage`; it does not request blanket host access.
4. **Local-first data.** Applicant data stays in extension-owned local storage. Content scripts cannot read storage directly. AI receives only the minimum relevant, user-authorized context.
5. **Confidence is visible.** Mappings and generated answers must include their source, confidence, and review state.
6. **Adapters isolate site behavior.** Generic behavior lives in the core; ATS-specific behavior stays in an adapter.

## Repository layout

The repository was empty when work began, so the extension lives in a dedicated `/extension` workspace. This keeps the root available for future companion apps, shared packages, and project documentation.

```text
/
├── IMPLEMENTATION_PLAN.md
├── PROJECT_STATUS.md
└── extension/
    ├── public/                 # Manifest and static extension assets
    ├── scripts/                # Reproducible production build
    ├── src/
    │   ├── ai/                 # AIProvider contracts; no provider implementation yet
    │   ├── ats/                # ATSAdapter contracts and future adapters
    │   ├── autofill/           # Field proposals and review-confidence contracts
    │   ├── background/         # Trusted service worker and privileged operations
    │   ├── browser/            # BrowserDriver boundary for future Playwright support
    │   ├── components/         # Shared React UI
    │   ├── content/            # Isolated-world page bridge
    │   ├── pages/              # Popup and settings application roots
    │   ├── scanner/            # Page-observation logic
    │   ├── services/           # Typed extension messaging
    │   ├── storage/            # Validated repositories and storage access control
    │   ├── types/              # Domain and message contracts
    │   └── utils/              # Small pure helpers
    └── tests/                  # Unit tests and, later, sanitized DOM fixtures
```

## Runtime boundaries

```text
Popup / Settings UI
        │ typed, validated messages
        ▼
Background service worker ───────► trusted local storage
        │ explicit active-tab injection
        ▼
Content script ─────► page scanner / future ATS adapter
        │
        └── page DOM only; no direct profile or secret access
```

The future application engine will depend on a `BrowserDriver` interface. The extension DOM implementation can satisfy that interface first; a local Playwright companion can be introduced later without moving policy or matching logic into the browser driver.

## Milestones

### 1. Extension foundation — implemented in the first session

- Manifest V3 package for Chrome and Edge.
- React/Vite popup and settings pages.
- Background service worker and on-demand content script.
- Narrow permissions and trusted-context-only storage.
- Typed, runtime-validated message boundary.
- Minimal page-context scan to prove the extension pipeline.
- Versioned profile and application-history repositories.
- Lint, TypeScript, unit-test, and production-build commands.

### 2. Verified profile and resume storage

- Build the complete profile editor for personal details, education, employment, projects, skills, certifications, preferences, and answer-library entries.
- Mark imported data as unverified until the user reviews and saves it.
- Add IndexedDB-backed resume binary storage with metadata kept separate from `Profile`.
- Add PDF/DOCX parsing in a worker and a review-before-save flow.
- Add explicit review of extracted resume data and intentional entry/resume deletion controls. Full backup export/restore is a separate future portability feature, outside the requested Milestone 2 scope.

Implemented in v0.2.0 (manual browser verification pending):

- `gja.applicant.v2` is a single atomic Chrome local-storage record containing **separate** `profile`, `answers`, `preferences`, and `imports` objects. The profile itself is schema v2 and excludes answers/preferences. Resume binaries and metadata live together in IndexedDB database `gja-resumes`, database version 1, record schema version 2.
- Trusted settings UI calls the same validated repositories used by the background worker. No new profile-bearing runtime messages are exposed. Shared Web Locks and revision checks serialize writes across settings tabs and service-worker restarts. The popup/background use a read-only compatibility projection of v2 data.
- Migration validates v1, retains the original `gja.profile.v1` without changing it, copies all supported fields, and maps indexed history verification paths to stable entry IDs. Corrupt, unknown-field, and future-version records stop reads/writes with a recoverable error rather than resetting data.
- PDF.js uses a directly supplied packaged module-worker port, avoiding its blob-worker fallback on extension URLs. Standard fonts and character maps are packaged locally. DOCX raw-text extraction uses Mammoth in a terminable worker; document HTML is never rendered. PDF/DOCX parsing has time/text limits, and PDF parsing has a page limit.
- Extraction offers only unambiguous exact email and explicit GitHub/LinkedIn URL suggestions. Names, history, skills, credentials, and dates are manually entered alongside extracted text. This deliberately conservative resume-field mapping is independent of job scanning.
- Imported candidates persist as unverified drafts. Confirmation atomically merges nonempty contact values, appends reviewed history, unions skills, updates provenance, and removes the consumed draft. Contact conflicts need explicit replacement consent; existing history is never silently replaced. Unrelated unverified profile fields remain unverified.
- Profile and answer editors reset their confirmation whenever values change. Later milestone navigation remains disabled. Permissions and the Milestone 1 page scanner are unchanged.

Exit criteria: all requested fields round-trip locally, migrations are tested, content scripts cannot read the records, and no unreviewed import becomes verified.

### 2.5. Structured resume parsing

Implemented on `milestone-2-5-resume-parsing` (manual browser verification pending):

- Added deterministic, local heading normalization and section boundaries for common Education, Employment/Experience, Projects, Skills, and Certifications variants, including capitalization, punctuation, whitespace, inline headings, and spaced-letter PDF artifacts.
- Added conservative candidates for a standalone header name, exact contact values, explicit location/country, multiple education and employment records, source-precision date ranges, responsibilities, technologies explicitly present in work text, clear Projects-section records/URLs, categorized skills, and explicit certification entries.
- Added per-suggestion numeric confidence, high/medium/low classification, source section/path, and exact source text. Metadata is persisted only with the unverified draft and displayed during review.
- Kept raw extracted text beside structured suggestions. Review supports editing, clearing values, removing whole proposed records, comparing saved values, saving an unverified draft, and explicit final confirmation. Any proposed-value edit resets confirmation.
- Added conservative normalized duplicate detection. Exact history matches are skipped; possible matches require explicit approval to append separately; uncertain records are never merged automatically.
- Kept PDF/DOCX binaries, workers, limits, permissions, and local-only extraction unchanged. No OCR, external API, network request, job scanning, scoring, ATS adapter, form parsing, autofill, navigation, queue, or submission behavior was added.
- Manual Brave hardening now rejects non-country contact tokens in location lines, reads separate Major/Concentration/Minor labels, separates conservative trailing US locations from employment titles/companies, requires stronger project-header evidence while joining wrapped bullet continuations, and maps meaningful composite skill labels by supported-category precedence.
- A second manual hardening pass tokenizes multiple education labels on one line, separates conservative institution/location and terminal graduation-date suffixes, prevents next-employment headers from entering prior responsibilities, combines stronger positive signals for later project boundaries, and normalizes only phone formatting, US state names, and email casing for conflict comparison without changing stored display values.
- A third project-boundary hardening pass pairs a stronger project title with an adjacent project-type descriptor, keeps attached title dates intact, preserves later genuine project boundaries, and records project name, description, responsibility, technology, and URL provenance independently.
- Import review now persists independent decisions for personal fields, history records, and skill categories. Conflicts safely default to keeping verified values, possible duplicates require per-record approval, and final confirmation applies only retained proposals. The comparison table uses readable indexed labels, proportional columns, wrapped values, and horizontal overflow at narrow widths.

Exit criteria: structured suggestions remain unverified, every parser proposal has confidence/provenance, duplicate and conflict gates require explicit action, raw text remains available, and all Milestone 1/2 regressions pass.

### 3. Job posting detection and normalized scanning

- Add semantic, ARIA, JSON-LD, and DOM-hierarchy extraction.
- Normalize title, company, location, compensation, description, requirements, ATS, URL, and requisition ID.
- Separate required, preferred, and unknown requirements.
- Add sanitized fixture tests before live-site tests.

### 4. Explainable match scoring

- Implement deterministic title, skill, education, seniority, location, compensation, and exclusion rules.
- Return a 0–100 score with strong matches, gaps, unknowns, and disqualifiers.
- Keep preferred qualifications from being scored as mandatory.

### 5. Generic form detection

- Discover native controls and accessible custom widgets by meaning rather than CSS class.
- Normalize fields into serializable descriptors; never retain DOM elements outside the content-script process.
- Add confidence and required/optional status.

### 6. Deterministic autofill

- Map only verified profile and exact saved-answer data.
- Dispatch framework-compatible input/change events.
- Present green/yellow/red review states and leave unresolved required fields empty.
- Stop before submit-like controls.

### 7–8. ATS adapters

- Harden Generic first, then Greenhouse, then Lever.
- Keep provider-specific selectors and navigation inside their adapters.
- Require fixture and integration coverage for each adapter.

### 9. AI question classification and grounded answers

- Implement `AIProvider` with the OpenAI Responses API behind the background worker.
- Keep API keys out of page and content-script contexts.
- Use structured output with answer, confidence, sources, and `needsUserInput`.
- Enforce answer-library → deterministic → local fuzzy/rules → AI hierarchy.

### 10–12. Resume upload, state machine, and tracker

- Recommend but allow overriding a resume.
- Verify the displayed upload filename.
- Add multi-step state transitions, MutationObserver rescans, recovery, and review gate.
- Track applications locally and flag likely duplicates.

### 13–15. Queue and assisted operation

- Add a user-managed job queue only after single-application filling is reliable.
- Process one job at a time and stop on missing data, low confidence, CAPTCHA, authentication, legal attestations, or final submission.
- Treat optional auto-submit as a separately designed, opt-in feature; it is not authorized by this plan.

## Cross-cutting verification

Each milestone should include:

- unit tests for pure policy and mapping logic;
- sanitized DOM fixtures for scanner and adapter behavior;
- strict TypeScript validation and linting;
- a production extension build;
- manual Chrome and Edge smoke tests for popup, settings, injection, restricted pages, and service-worker restart;
- updates to `PROJECT_STATUS.md`.

## Security workstream

Before applicant data entry is implemented, create `docs/SECURITY.md` with data-flow boundaries, storage limitations, attacker assumptions, secret handling, message validation, AI minimization, logging rules, and incident-safe diagnostics. Local extension storage is not encryption at rest; the UI and documentation must not imply otherwise.
