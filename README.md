# Grounded Job Assistant

Grounded Job Assistant is a local-first Chrome and Microsoft Edge extension foundation for accurate, review-driven job application assistance. It is an original implementation and does not use proprietary code, APIs, branding, or assets from other job-application products.

The current working branch is **Milestone 2.5 (v0.2.0)**. It includes a verified applicant profile editor, Answer Library, Job Preferences, multiple PDF/DOCX resumes, local structured resume suggestions with confidence/provenance, duplicate warnings, and an explicit import/review workflow. It preserves the original popup and conservative user-invoked page scanner. Match scoring, autofill, AI calls, and application submission are not implemented.

## Prerequisites

- Node.js 24.15 or newer (the bundled document parsers and UI-test dependencies require a modern Node runtime)
- pnpm 11.19 (`corepack prepare pnpm@11.19.0 --activate`)
- Chrome 120+ or a current Microsoft Edge release

## Install and verify

From PowerShell:

```powershell
cd "C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension"
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
pnpm check
```

`pnpm check` runs linting, strict TypeScript validation, unit tests, and a production build. The unpacked extension is produced at:

```text
C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension\dist
```

## Load in Chrome

1. Run `pnpm build` after every source change.
2. Open `chrome://extensions`.
3. Enable **Developer mode** in the top-right corner.
4. Select **Load unpacked**.
5. Choose `C:\Users\Daniel\OneDrive\Desktop\Auto Job Application Extension\extension\dist`.
6. Pin **Grounded Job Assistant** from Chrome's Extensions menu.
7. Open a regular `http://` or `https://` page, click the extension, and select **Scan current page**.
8. Select **Open settings**, then My Profile, Resumes, Answer Library, or Job Preferences. No API key or environment configuration is required.

Chrome blocks extension injection on internal pages such as `chrome://extensions`; the popup reports that condition rather than requesting broader access.

## Load in Microsoft Edge

Use the same `dist` folder, but open `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**.

Brave uses the same build: open `brave://extensions`. If the extension is already installed, **Reload** its existing card instead of removing it; uninstalling deletes local data. Follow [the Milestone 2.5 structured parsing tests](docs/MILESTONE_2_5_MANUAL_TESTS.md) and [the Milestone 2 regression tests](docs/MILESTONE_2_MANUAL_TESTS.md) before using this build as your applicant source of truth.

## Current privacy model

- Permissions are limited to `activeTab`, `scripting`, and `storage`.
- There are no host permissions and no always-on content scripts.
- Page access occurs only after the user invokes a scan.
- Extension storage is restricted to trusted extension contexts; content scripts cannot access it.
- Local browser storage is not encryption at rest.
- The current build makes no network or AI requests.
- There is no submission feature in this milestone.

See [docs/SECURITY.md](docs/SECURITY.md) for the complete threat model.

## Development commands

```powershell
pnpm dev           # Vite UI development server
pnpm lint          # ESLint
pnpm typecheck     # strict TypeScript validation
pnpm test          # unit tests
pnpm test:watch    # watch-mode tests
pnpm build         # production extension bundle + manifest audit
pnpm verify:dist   # audit an existing dist folder
pnpm format:check  # formatting check
pnpm format        # apply formatting
pnpm check         # lint + types + tests + production build
```

## Milestone boundary

Profile, Answer Library, Job Preferences, and Resumes are enabled. Applications, AI Settings, and Automation Settings remain disabled. The Vite preview preserves the dashboard/popup preview; applicant editing requires the installed extension so it cannot accidentally create a second source of truth on localhost.

The applicant schema is v2. `gja.applicant.v2` separates profile, answers, preferences, and unverified drafts; `gja.profile.v1` is retained unchanged after migration. Resume metadata and original bytes live in the extension's IndexedDB. Stored files never become verified profile data automatically. Extraction suggests only unambiguous email and explicit GitHub/LinkedIn links; history, dates, and skills are manually mapped during review. PDFs have a 50-page limit, files a 10 MB limit, and extraction a 30-second deadline. Scanned PDFs require manual entry or a text-based replacement; there is no OCR.

For the architecture and ordered roadmap, see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). For the exact handoff state, see [PROJECT_STATUS.md](PROJECT_STATUS.md).
