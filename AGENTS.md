# AGENTS Guide for `panda_frontend`

## Purpose
- This document is for coding agents working in this repository.
- It captures the current, evidence-based commands and coding conventions.
- Do not invent scripts or tooling that are not configured in this repo.

## Project Snapshot
- Stack: React 18 + React Router + Vite 5.
- Language: JavaScript/JSX (no TypeScript configured).
- Package manager: npm (lockfile is `package-lock.json`).
- Entry points: `src/main.jsx`, `src/App.jsx`.

## Source of Truth Files
- `package.json` for runnable scripts.
- `vite.config.js` for dev server/build behavior.
- `README.md` for local setup and required env vars.
- `src/api/listingApi.js` for API/error-handling conventions.
- `src/pages/*.jsx` for component/state patterns.
- `src/styles/global.css`, `src/styles/layout.css` for design/layout system.

## Existing Rule Files
- `.cursor/rules/`: not present.
- `.cursorrules`: not present.
- `.github/copilot-instructions.md`: not present.
- Additional local rule exists in `AGENT.md`:
  - Do not insert the literal `r`n token into code; use real line breaks.

## Setup and Environment
- Install dependencies:
  - `npm install`
- Required environment variables (`.env`):
  - `VITE_API_BASE_URL` (example: `http://localhost:9111`)
  - `VITE_NAVER_MAP_CLIENT_ID`

## Build / Run Commands (Currently Configured)
- Dev server:
  - `npm run dev`
  - Defined in `package.json` as `vite`.
  - Dev port is `5173` from `vite.config.js`.
- Production build:
  - `npm run build`
  - Defined as `vite build`.
- Preview production build:
  - `npm run preview`
  - Defined as `vite preview`.

## Lint / Test / Typecheck Status
- Lint command: not configured.
- Test command: not configured.
- Typecheck command: not configured.
- No test runner config files found (Vitest/Jest/Playwright/Cypress).
- No TS config found (`tsconfig.json` absent).

## Single-Test Execution
- There is currently no supported single-test command because tests are not configured.
- Do not claim single-test support unless a test runner is added.
- If adding tests later, document exact commands here (example pattern only):
  - file-level: `<runner command> <path-to-test-file>`
  - case-level: `<runner command> -t "<test name>"`
- Keep this section strictly synchronized with actual `package.json` scripts.

## Practical Agent Workflow
- Before coding:
  - Read `package.json`, `README.md`, and touched feature files.
  - Confirm whether required env vars are used by changed flows.
- While coding:
  - Keep changes focused and minimal.
  - Match existing file structure and naming style.
- Before finishing:
  - Run what exists (`npm run build` when relevant).
  - If a command is missing (lint/test/typecheck), state it explicitly.

## Code Style: Enforced vs Observed

### Enforced (Config-Driven)
- There is no explicit lint/format/type tooling enforced in repo config.
- Treat current conventions as pattern-based, not tool-enforced.

### Observed (Pattern-Driven)
- Use functional React components and hooks.
- Keep helper functions in the same module when tightly coupled to one page.
- Use optional chaining and nullish coalescing for defensive reads.
- Prefer early returns for guard clauses.
- Use async/await with `try/catch/finally` for async UI actions.

## Imports and Module Usage
- Import order is typically:
  - React/hooks first.
  - Router/framework imports next.
  - Local api/components/constants imports after.
  - CSS imports alongside page/app entry where needed.
- Use relative imports (`./` and `../`) consistently.
- Prefer named exports for utility/api/constants modules.
- Page components are usually default exports.

## Naming Conventions
- Components: PascalCase (`MapListingPage`, `CreateListingPage`).
- Functions/helpers: camelCase (`formatRoomType`, `openListingDetail`).
- Constants: UPPER_SNAKE_CASE for fixed values and labels.
- State setters follow React convention (`foo`, `setFoo`).
- Boolean names use `is/has/can` prefixes where reasonable.

## Types and Data Handling
- Project is JavaScript-first; do runtime validation and safe coercion.
- Normalize external data close to boundaries:
  - API layer parses and shapes response/errors.
  - Page layer adapts detail/list payloads for display.
- For nullable data, provide stable fallbacks in render paths.
- Avoid leaking backend shape differences across UI; normalize once.

## API and Error Handling
- Route all network calls through `src/api/listingApi.js` patterns.
- In request wrappers:
  - Set JSON headers unless body is `FormData`.
  - Parse text body carefully; tolerate non-JSON responses.
  - Throw `Error` with user-meaningful message when `!response.ok`.
  - Preserve server details on error object when available.
- In UI layers:
  - Catch and surface concise user-facing error messages.
  - Use `finally` to reset loading flags.
  - Revert optimistic updates on failure.

## State and UI Patterns
- Derive computed collections with `useMemo` when inputs are explicit.
- Keep view-state local to page unless shared globally.
- Use refs for mutable third-party integration objects (map instances, markers).
- Ensure mobile and desktop behavior both work before finalizing.
- Preserve existing UX behavior (sheet modes, overlays, dialogs).

## Styling and CSS
- Reuse existing CSS variables in `src/styles/global.css`.
- Keep layout and component classes aligned with `src/styles/layout.css`.
- Prefer class-based styling for reusable UI blocks.
- Inline styles are present; only use them when local and specific.
- Keep responsive behavior intact (`@media (max-width: 768px)`).

## Routing and Navigation
- Routes are declared in `src/App.jsx`.
- Keep route additions explicit and consistent with existing path style.
- Use `Link` for in-app navigation and `useNavigate` for action redirects.

## Do / Do Not
- Do:
  - Follow existing patterns in `src/pages` and `src/api`.
  - Make minimal, localized changes for bug fixes.
  - Keep Korean UI copy consistent with nearby strings.
- Do not:
  - Introduce unrelated refactors during a small fix.
  - Add unconfigured tooling commands to docs as if they exist.
  - Break API error shape expectations used by pages.

## Verification Checklist for Agents
- Confirm touched flows in dev server (`npm run dev`) when possible.
- Run `npm run build` for integration-level confidence.
- Verify no accidental route regressions in `src/App.jsx`.
- Verify env var usage for map/API flows still matches README.
- If lint/test/typecheck are requested, first add and document tooling.

## Maintenance Notes
- Update this file whenever scripts or tooling change.
- Keep command examples exact and runnable.
- If Cursor/Copilot rule files are added later, mirror them here.
- If `AGENT.md` changes, sync relevant constraints into this file.
