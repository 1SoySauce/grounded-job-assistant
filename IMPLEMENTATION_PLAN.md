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
- Add export, import, and intentional local-data deletion controls.

Exit criteria: all requested fields round-trip locally, migrations are tested, content scripts cannot read the records, and no unreviewed import becomes verified.

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

