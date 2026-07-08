# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Unity is a Milo bootstrap project that provides interactivity components and features for Adobe.com. It bridges Unity Service (backend) and Unity UI (frontend) for operations like background removal, background changes, and Acrobat redirects. It is an Adobe Helix/Franklin (EDS) project (v7, see `helix-version.txt`), with content managed via SharePoint (mounted in `fstab.yaml`).

Core functionality is loaded from `/unitylibs` at runtime. Version can be overridden per-request via a `?unitylibs=<branch_name>` query param, which is useful for testing a feature branch against live content.

## Commands

### Local dev
```
sudo npm install -g @adobe/aem-cli   # one-time
aem up                                 # serves at http://localhost:3000
```

### Lint
```
npm run lint             # JS + CSS
npm run lint:js          # eslint . (airbnb-base config)
npm run lint:css         # stylelint on unitylibs/blocks/**/*.css and unitylibs/styles/*.css
npm run lint:fix         # auto-fix both
```

### Unit tests (Web Test Runner)
```
npm test                                    # all unit tests with coverage
npm test test/utils/ObjectUtils.test.js     # single test file
npm run test:watch                          # watch mode
npm run test:coverage                       # runs tests then enforces 80% coverage threshold (scripts/check-coverage.js)
```
Unit tests live under `test/`, mirroring the structure of `unitylibs/`. They use Chai for assertions and Sinon for mocks/stubs.

### E2E tests (Nala, built on Playwright)
```
npm run nala stage                                            # full E2E run against stage
npm run nala stage firefly.test.cjs                           # single feature file
npm run nala stage @pdf-express                                # filter by tag
npm run nala stage @pdf-express browser=firefox mode=ui        # extra options: browser, device, mode (headed/ui/debug)
npm run nala <env> unitylibs=<feature-branch>                 # test a branch's unitylibs against an environment
```
`<env>` is one of `main | stage | local | libs`. Tests live in `nala/features/`, organized by feature; each feature typically has a `.test.cjs` (test), `.page.cjs` (page object), and `.spec.cjs` (test data).

## Architecture

- **`unitylibs/`** — the actual Unity library code, versioned/loaded dynamically by the `unity` block.
  - `blocks/unity/` — the Milo metadata block that bootstraps and loads Unity core. Other Milo blocks (Marquee, Aside, etc.) reference `unity` as a metadata block to opt into Unity functionality.
  - `core/workflow/` — orchestrates feature loading and execution; supports both v1 and v2 workflow architectures.
  - `core/features/`, `core/widgets/` — individual feature implementations and their UI widgets (e.g. firefly, PDF operations).
  - `utils/` — shared utilities (FileUtils, NetworkUtils, ObjectUtils, chunkingUtils, device-detection, experiment-provider, etc.).
  - `scripts/scripts.js` — main client-side entry point, loaded from `head.html`; sets up locale config, decorates content, loads core styles.
- **`acrobat/`** — Adobe Acrobat integration bootstrap (`bootstrap.js`), a large pre-bundled/compiled file.
- **`nala/`** — the custom E2E test framework layered on Playwright (`playwright.config.cjs` points its testDir here). `nala/utils/nala.run.cjs` is the CLI entry used by the `npm run nala` script.
- **`test/`** — unit tests, mirroring `unitylibs/` layout 1:1.
- **`fstab.yaml`** — Helix content mount point (SharePoint), not application code.
- **`head.html`** — the HTML head template that loads `unitylibs/scripts/scripts.js` (module) / `fallback.js` (nomodule) and `unitylibs/styles/styles.css`.

Since Unity itself is loaded as a metadata block by other Milo blocks, changes to `unitylibs/blocks/unity/` affect how *any* Milo block on adobe.com can opt into Unity behavior — check for cross-block usage before changing its public contract.

## Contribution conventions (from CONTRIBUTING.md)

- Requires a signed Adobe CLA; uses a commit-then-review process (approved maintainers can merge without waiting).
- PR title format: `MWPW-xxxx - Summarize changes in 50 characters or less`.
- Commit messages should start with the GitHub issue ID (e.g. `#123`); use `[trivial]` for changes with no associated issue.
- Minimum 2 approvals required per PR.
- Releases are fully automated via `semantic-release` based on commit messages.

## Available skills

### `unity-a11y`

Audits, fixes, and instruments **unitylibs** components (vanilla JS/DOM, built with the shared `createTag` helper) to meet WCAG 2.1 AA accessibility standards.

**Use for:** auditing accessibility, fixing ARIA issues, adding keyboard navigation, screen-reader support, focus management, color contrast, or instrumenting a new/bare widget from scratch.

**Requires:** component file(s) under `unitylibs/` in scope.

**Modes:** audit (report only) / fix (apply changes) / add (instrument from scratch).

---

### `unity-jira`

Orchestrator for a single Jira ticket: fetches it (including the full comment thread), classifies it against a registry of specialized Unity skills, and either hands off to a matching skill with resolved context or falls back to summarizing the ticket and asking how to proceed.

**Use for:** triaging, summarizing, or solving a Jira ticket given its key or URL.

**Requires:** access to the corp-jira MCP tools; the mapped skill (e.g. `unity-a11y`) present for a matched-route handoff.

**Routes:** matched skill handoff (currently: accessibility → `unity-a11y`) / general (summarize + propose + ask).

---
