# Grounded Job Assistant

Grounded Job Assistant is a local-first Chrome and Microsoft Edge extension foundation for accurate, review-driven job application assistance. It is an original implementation and does not use proprietary code, APIs, branding, or assets from other job-application products.

The current release is **Milestone 1**. It installs, presents a popup and settings dashboard, creates protected versioned local storage, and can conservatively classify the active page after an explicit click. It does **not** yet import profiles or resumes, calculate match scores, autofill applications, call an AI provider, or submit anything.

## Prerequisites

- Node.js 20.19 or newer (Node.js 22 LTS is recommended)
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
8. Select **Open settings** to view the Milestone 1 dashboard.

Chrome blocks extension injection on internal pages such as `chrome://extensions`; the popup reports that condition rather than requesting broader access.

## Load in Microsoft Edge

Use the same `dist` folder, but open `edge://extensions`, enable **Developer mode**, and choose **Load unpacked**.

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

Profile configuration, resume upload, and supported-ATS application testing intentionally begin in Milestone 2 and later. Their controls are visible as future settings sections but are disabled so the UI does not imply that unimplemented safety-critical behavior works.

For the architecture and ordered roadmap, see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). For the exact handoff state, see [PROJECT_STATUS.md](PROJECT_STATUS.md).
