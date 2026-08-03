---
name: unity-perf
description: >
  Audits and fixes Core Web Vitals regressions (LCP, CLS, INP, TBT) caused by unitylibs code —
  load sequencing (script/style fetch order, dynamic imports), DOM/media patterns
  (lazy-loading, layout shift, debounce), and main-thread blocking work. Measures via Lighthouse
  against a local or preview URL and attributes each regressed metric to whether the flagged
  element actually sits inside Unity's rendered DOM. Use when the user asks to check LCP/CLS/
  INP/TBT, audit or fix a Core Web Vitals regression, or investigate a Lighthouse score drop
  tied to a Unity workflow/feature/widget.
metadata:
  version: 0.3.0
  domain: Build and Code
  kind: skill
  tags: [performance, cwv, core-web-vitals, lighthouse, lcp, cls, inp, tbt, unitylibs]
compatibility:
  agents: [claude-code, codex, cursor]
  requirements:
    - Component/workflow file(s) under unitylibs/ in scope
    - For Lighthouse measurement (strongly recommended, not strictly required) — a running local
      dev server (`aem up` → localhost:3000) or a live preview URL with `?unitylibs=<branch_name>`.
      Lighthouse is not a pinned devDependency here (unlike @axe-core/playwright) — it's invoked
      ad hoc via `npx lighthouse`, which fetches on demand and requires network access.
#disable-model-invocation: true
---

# Performance — `unity-perf`

Workflow for auditing and fixing **Core Web Vitals** regressions in **unitylibs** code — LCP,
CLS, INP, and TBT only. This skill does not chase general performance hygiene (network retry
config, upload concurrency, caching TTLs); it exists to answer one question: *is a Unity-loaded
workflow/feature/widget causing a measurable Core Web Vital regression, and if so, which line of
code is responsible?*

Unity is loaded as a metadata block by other Milo blocks (`unitylibs/blocks/unity/`), which then
dynamically loads `core/workflow/` → `core/features/` / `core/widgets/` per workflow type. Almost
everything below `unity.js`'s `init()` is already lazy — nothing loads unless a `.unity` block
with a `workflow-*` class is present on the page. Because of that, **attribution is the hard
part**: Unity is a metadata block on a host Milo page, so the LCP/CLS element Lighthouse flags is
frequently owned by the host page (a hero image, a marquee), not by Unity. Never report a metric
as a "Unity regression" without first confirming the flagged element is actually inside Unity's
rendered DOM.

## Keywords

LCP, CLS, INP, TBT, Core Web Vitals, Lighthouse, largest contentful paint, cumulative layout
shift, interaction to next paint, total blocking time, perf regression, slow load, layout shift,
main-thread blocking

## Purpose

- Measure LCP, CLS, INP, and TBT for a page/URL and attribute any regressed metric to Unity's
  code (or rule Unity out, if the flagged element belongs to the host page)
- Audit a workflow/feature/widget for the specific code patterns that drive these four metrics
  and report ranked findings
- Fix the identified cause with a targeted, minimal change, then re-measure to confirm the metric
  improved
- Flag a cause whose root cause sits outside the given file(s) (e.g. a widget's DOM is fine but
  the shared bootstrap sequence delays its paint) rather than silently editing out-of-scope files

Out of scope for this skill: network retry/backoff tuning, chunked-upload concurrency, request
caching/TTLs, bundle-size hygiene not tied to a measured CWV impact — these may be real
improvements, but they aren't Core Web Vitals and belong to a general code-quality/perf pass, not
this skill. If you notice one, it's fine to mention it in passing, but it doesn't get a checklist
row, a severity rating, or a fix under this skill's scope unless it's shown to move LCP, CLS,
INP, or TBT.

## Intake (required)

Before proposing a plan, confirm:

- which file(s) under `unitylibs/` are in scope (a workflow, a feature, or a widget — CWV
  regressions live in the load/render path, so scope is almost always here, not a shared network
  util, unless that util is provably on the critical rendering path)
- what the user wants: **audit** (report only) or **fix** (apply changes)
- whether a URL is available for Lighthouse measurement (localhost via `aem up`, or a live page
  with `?unitylibs=<branch_name>` pointed at the branch under test). A measurement is strongly
  preferred — CWV claims without a number are guesses — but if no URL is available or offered,
  say so explicitly and fall back to the static checklist alone; don't block the run on it.
- **which platform to measure: mobile or desktop — and, for desktop, whether it needs to match a
  real Chrome DevTools Lighthouse-panel run exactly.** This is not cosmetic — Lighthouse's CLI
  default is *mobile* emulation (≈412px viewport, 4× CPU throttle, slow-4G). For desktop, there
  are two distinct things a "desktop run" can mean, verified from a user-supplied DevTools-panel
  JSON (do not assume; confirm from `configSettings` when in doubt):
  - `--preset=desktop` (CLI) forces a **fixed, emulated 1350×940 viewport**
    (`screenEmulation.disabled: false`).
  - Chrome DevTools' own embedded Lighthouse panel run with "Desktop" selected does **not** force
    that viewport — it sets `screenEmulation.disabled: true` (`channel: "devtools"`) and renders
    at whatever the real browser window's actual width is (a real example: 1728px, read from
    `fullPageScreenshot.screenshot.width`, not 1350). Both use the same default
    `throttlingMethod: "simulate"` network/CPU profile (`rttMs: 40, throughputKbps: 10240,
    cpuSlowdownMultiplier: 1`) — that part already matches without extra flags; the viewport width
    is the actual divergence, not the network throttle.
  **The LCP/CLS element is frequently different across all of these** — a narrower viewport can
  pick a text heading as LCP while a wider one picks a full-bleed hero/section-background image,
  and this is sensitive to viewport width at any threshold, not just mobile vs. desktop. Ask which
  the user wants:
  - **Mobile** (CLI default)
  - **Desktop, CLI-standard** (`--preset=desktop`, fixed 1350×940) — fine for a quick check, not
    for comparing against a number the user got from their own Chrome DevTools tab
  - **Desktop, matching a specific DevTools-panel run** — requires the real viewport width (ask
    the user, or read `fullPageScreenshot.screenshot.width`/height from their own exported JSON,
    or have them run `window.innerWidth`/`window.innerHeight` in that tab's console) — see Step 2
    for the exact flags.
  If the user doesn't care, say you're defaulting to mobile (the CLI default) and state that
  explicitly in the report. If the user supplies their own DevTools-exported JSON to compare
  against, always read `configSettings.channel` / `screenEmulation` /
  `fullPageScreenshot.screenshot.width` from it first — don't assume it matches either CLI
  variant.

If invoked via a handoff from an orchestrator (e.g. `/unity-jira`'s Handoff Contract —
`ticket`/`scope`/`known_issue`/`figma_refs`/`sibling_files`), treat those fields as already
answered — don't re-ask for scope or re-derive the known-issue context from the ticket yourself.
The **mode** question (audit/fix) is never part of that contract, so still ask it unless the
handoff explicitly states one. `figma_refs` rarely applies (no visual design target for a CWV
ticket); ignore it unless the ticket ties the regression to a design-driven asset (e.g. an
oversized hero image, a new web font affecting LCP).

**Orchestrator handoffs run ticket-scoped, not component-scoped.** When a `known_issue` is
supplied, that string *is* the entire scope of the run — not a starting point for a broader
sweep. Report and/or fix only the named issue. The one exception: `sibling_files` entries the
orchestrator already surfaced — those may be echoed back (still not auto-fixed). A standalone
invocation (no handoff) runs the full checklist per Step 3.

One blocking question at a time when the above is unclear.

## Workflow

### Step 1 — Map the component in the loading/render pipeline

Read the file(s) in scope and place them in Unity's actual load path — this determines which CWV
metric a given inefficiency can even affect:

- **`unitylibs/blocks/unity/unity.js`** — the entry point, runs on every page carrying a `.unity`
  metadata block. A serial-await chain here (style load → workflow import) can push out both TBT
  (main-thread work happens later but still counts) and, if Unity content is the LCP candidate,
  LCP itself.
- **`unitylibs/core/workflow/workflow.js`** — `priorityLibFetch()`/`priorityLoad()` build a
  per-workflow asset manifest and fetch it; `init()` then `await import()`s the widget module and
  action-binder. A serial (not concurrent) import chain here delays the widget's first paint —
  relevant to LCP only if the widget renders the LCP candidate, and to TBT regardless.
- **`core/features/*`, `core/widgets/*`** — reached only via dynamic `import()` from
  `workflow.js`. If new code here is statically imported from a shared entry point instead, it
  adds parse/execute cost to every page's initial load — a TBT risk even for pages that never use
  that workflow.
- **DOM/media inside a widget** — image/video elements, mount-time reflows, and input handlers
  are where CLS and INP regressions actually live. This is usually where the real fix is.

Trace whether the code in scope runs on every page load (bootstrap), only when a workflow is
active (widget/feature), or only on a specific user interaction (click, keystroke) — this decides
which metric (if any) it can affect. Code that runs after first paint and outside any user
interaction (e.g. background prefetch, a completed upload) cannot regress LCP, CLS, INP, or TBT
and is out of this skill's scope by definition.

If the task scope is a single file but the real cause is upstream (e.g. a widget's image is
correctly written but a shared bootstrap sequence delays the whole workflow's paint), say so
explicitly rather than expanding scope without asking.

---

### Step 2 — Measure (when a URL is available)

Run Lighthouse against the page before forming any theory about what's slow — don't guess which
metric is regressed from reading code alone when a URL exists to just check.

**Environment caveat — state this before running, not after:** if Lighthouse is being run via a
sandboxed/containerized shell (e.g. an agent's own CLI environment, headless Chrome under
`--no-sandbox`) rather than the user's own machine, the numbers are liable to be *worse than
real* — a CPU-starved container can produce single long-tasks of several seconds that no real
user would ever experience. This is not a rare edge case; it happened on the first real run of
this skill (see Step 2a). If the user can run Lighthouse locally and share the JSON instead, that
result is more trustworthy than one produced by an agent's own sandboxed run — say so and prefer
it when offered.

1. Run, using the platform confirmed at intake:
   ```bash
   # Mobile (Lighthouse CLI default — omit --preset, or pass --preset=mobile):
   npx lighthouse <url> \
     --output=json \
     --output-path=/tmp/lighthouse-report.json \
     --chrome-flags="--headless --no-sandbox" \
     --only-categories=performance

   # Desktop, CLI-standard (fixed, emulated 1350×940 viewport):
   npx lighthouse <url> \
     --output=json \
     --output-path=/tmp/lighthouse-report-desktop.json \
     --preset=desktop \
     --chrome-flags="--headless --no-sandbox" \
     --only-categories=performance

   # Desktop, matching a real Chrome DevTools Lighthouse-panel run:
   # DevTools' own panel disables screen emulation and renders at the real window width instead
   # of forcing 1350px. Get <WIDTH>/<HEIGHT> from the user (their real window's inner size, or
   # fullPageScreenshot.screenshot.width/height in their own exported JSON) — without it, headless
   # Chrome falls back to its own 800×600 default, which won't match either variant above.
   npx lighthouse <url> \
     --output=json \
     --output-path=/tmp/lighthouse-report-desktop-devtools-match.json \
     --preset=desktop \
     --screenEmulation.disabled \
     --chrome-flags="--headless --no-sandbox --window-size=<WIDTH>,<HEIGHT>" \
     --only-categories=performance
   ```
   Without `--preset=desktop` the CLI runs *mobile* emulation regardless of the machine it's on —
   this is the single most common reason an agent's LCP element disagrees with what a user saw in
   their desktop browser. Use a distinct `--output-path` per variant so runs don't overwrite each
   other. If the user asked for more than one, run each and report under its own labelled column.
   (If the user instead supplies their own Lighthouse JSON from a local or DevTools-panel run,
   skip straight to Step 2a with their file — and read `configSettings.channel` / `formFactor` /
   `screenEmulation` in that JSON to determine exactly which of the three variants above it is,
   rather than assuming.)

   **Even with matched settings, never promise byte-identical numbers between a CLI run and a
   live DevTools-panel run.** Settings-parity (viewport width, `screenEmulation`, throttling
   profile) makes the comparison methodologically fair — it does not make the two runs
   deterministic duplicates. They still differ in: the Chrome/Chromium build, a clean headless
   profile vs. the user's real one (extensions, cached service workers, cookies), real network
   jitter on the user's machine vs. wherever the CLI runs, and Lighthouse's own normal
   run-to-run variance (Step 2b.6). Say this explicitly whenever presenting a CLI run as a
   comparison point against a user-supplied DevTools JSON — match the settings, don't claim
   identical output.
2. Extract `categories.performance.score`, and the LCP/CLS/TBT audits (`audits['largest-contentful-paint']`,
   `audits['cumulative-layout-shift']`, `audits['total-blocking-time']`). INP typically requires
   real interaction and may not be measurable from a single Lighthouse navigation — note this if
   so, rather than reporting a fabricated INP number.
   Record which platform (mobile/desktop) produced these numbers — the LCP/CLS *element* is a
   property of the viewport width, so a metric value is meaningless in the report without its
   platform label.

---

### Step 2a — Validate the run before trusting any number in it

Do this **before** extracting anything into a report. A Lighthouse run can be internally
inconsistent in ways that look like a real finding but aren't — catch that here, not after
you've already written "FAIL" next to a number.

1. **Read `runWarnings`.** If Lighthouse itself flagged something (stored IndexedDB/cache data,
   an extension interfering, etc.), surface it verbatim in the report rather than silently
   discarding it — it's a caveat on every other number in the run, not just a footnote.
2. **Cross-check what's actually driving TBT before reporting it.** Pull `audits['bootup-time']`,
   `audits['long-tasks']`, and `audits['mainthread-work-breakdown']` and look at *which URLs* the
   time is attributed to:
   - If the largest contributors are real, requested page resources (a script the page actually
     loaded), the number is real — proceed to attribution (Step 2b).
   - If the largest contributors are `_lighthouse-eval.js`, `Unattributable`, or otherwise don't
     correspond to any URL the page requested, **treat the run as unreliable** — this is
     Lighthouse's own instrumentation overhead or a sign the execution environment (not the page)
     is the bottleneck. Do not report the raw score/TBT number as a finding or put it in the
     summary table as a PASS/FAIL. State explicitly that the run is invalid and either re-run,
     ask the user to run locally, or — if neither is possible — report the LCP/CLS numbers (which
     are less susceptible to this artifact) with TBT marked "unreliable — see note," not "FAIL."
   - A single long task in the multi-second range attributed to a non-page script is the
     signature to watch for — it is not something real page JS produces, at any level of
     inefficiency the checklist can find.
3. Only once the run passes this check does its score belong in a results table.

---

### Step 2b — Attribute

1. **For LCP:** pull the element from `audits['lcp-breakdown-insight'].details.items` — find the
   item with `"type": "node"` (the same array also holds a `"type": "table"` item with the
   timing subparts; don't confuse the two) and read its `.selector`/`.snippet`. Older Lighthouse
   versions may instead expose `audits['largest-contentful-paint-element'].details.items[0].node`
   — check both keys **by name**, don't infer which audit you're looking at from the shape of the
   object alone. A `{node, score}` pair can just as easily be `layout-shift-elements` (CLS) as an
   LCP audit — confirm the audit `id`/key before reading anything from it. This mistake happened
   in this skill's own dogfooding: a CLS-culprit node was briefly reported as the LCP element
   because both audits return the same `{node, score}` shape.
   For ground truth (or when the Lighthouse JSON's LCP audit is ambiguous/missing), read the
   browser's own LCP candidate directly instead of trusting a synthesized report:
   ```js
   new PerformanceObserver((list) => {
     const entries = list.getEntries();
     console.log(entries[entries.length - 1].element); // LCP can update; take the last entry
   }).observe({ type: 'largest-contentful-paint', buffered: true });
   ```
   This is what Lighthouse's own metric (and real-user CrUX data) is derived from, so it's the
   most authoritative source when available (e.g. via Playwright injection).

   **Running this via Playwright in practice:** this repo has `@playwright/test` in
   `package.json` but may not have `node_modules` installed in a given shell — check first, and
   if missing, `npm install playwright` from a scratch directory (ESM resolves `node_modules`
   from the script's own directory, so a script under `/tmp`/scratchpad needs its own install;
   it won't see the repo's). If Chromium hasn't been downloaded yet you'll get an
   `Executable doesn't exist` error — run `npx playwright install chromium` once, then re-run.
   Note this cross-check still executes in the same CPU-shared environment as any other
   in-session run: it fixes Lighthouse's own trace-attribution artifact (Step 2a), not
   sandbox CPU contention — a long task may still show up with generic
   `attribution: [{ name: 'self', containerType: 'window' }]` (no per-script URL) if the browser
   can't map it to a specific cross-origin script; don't over-attribute that to Unity either.
2. **The LCP element is a property of one specific run, not of the URL — and platform is the
   biggest driver of which element wins.** Under heavier throttling, an image may not have
   finished loading by the time LCP is measured, so the browser records a text node as the
   largest paint instead; under lighter/faster conditions the image wins once it actually renders.
   Separately and more predictably, **viewport width changes which element is the largest paint at
   all**: a mobile (≈412px) run can pick a text heading while a desktop (≈1350px) run of the very
   same URL picks a full-bleed hero/section-background image — this is exactly the
   mobile-vs-desktop split from intake, and it happened in this skill's own dogfooding (mobile LCP
   = an `<h1>`; desktop LCP = a `picture.section-background > img`). Two runs against the identical
   URL can legitimately report two different LCP elements — never assume identity carries over
   from a prior run, from a different platform, or even from the same URL later in the same
   conversation. Re-check per run, and always report the LCP element *with* the platform that
   produced it.
3. **Is the flagged element inside the Unity-rendered widget/dropzone, or elsewhere on the host
   page?**
   - Elsewhere → Unity is not the cause for that metric. State this and stop investigating it
     further; don't chase a host-page issue under a Unity perf ticket — even if it's a real,
     fixable anti-pattern (e.g. `loading="lazy"` on the actual LCP candidate), it's out of this
     skill's scope once attribution rules Unity out. Mention it once, in passing, as a finding
     for whoever owns that markup — don't adopt it as a unity-perf finding. This includes a
     `section-metadata` "background" image (a full-bleed section background Milo core renders
     from the section's metadata table) — it looks adjacent to the Unity block in the authored
     page but is decorated entirely by Milo core, not any `unitylibs/` file.
   - Inside Unity's DOM → continue to Step 3 for that metric.
4. **For CLS:** same method — check `audits['layout-shift-elements'].details.items` (or the
   `cumulative-layout-shift` audit's own `details` on older versions) for the actual contributing
   node(s), by audit key, before attributing.
5. **For TBT** (once validated per Step 2a): check the trace/long-tasks data for which script is
   executing. Attribute to a specific Unity file (bootstrap, workflow init, widget init) only if
   it actually appears as the long-task source — not by assumption.
6. To confirm a fix, re-run against the same URL and compare before/after. Lighthouse has
   run-to-run variance even on a valid run — a single run's absolute score isn't evidence of a
   fix on its own; a before/after comparison is.

Target thresholds: Overall ≥ 90, **LCP ≤ 2.5 s**, **CLS ≤ 0.1**, **INP ≤ 200 ms**, **TBT ≤ 200 ms**.

If no URL is available, skip Step 2/2a/2b and rely on Step 3's static checklist alone — say
explicitly that findings are unmeasured/theoretical until a URL is provided.

---

### Step 3 — Run the CWV checklist

Walk only the metric buckets relevant to what Step 1/2 found — e.g. if Lighthouse showed no CLS
regression and the code in scope doesn't touch layout, skip the CLS section.

**Standalone invocation** (no orchestrator handoff): walk every bucket relevant to the code's
position in the pipeline.

**Orchestrator handoff** (a `known_issue` was supplied): skip the full sweep. Use the checklist
only to confirm the correct pattern/fix for the *named* metric/issue.

→ Checklist: [references/checklist.md](references/checklist.md)
→ Before/after fix patterns: [references/fix-patterns.md](references/fix-patterns.md)

---

### Step 4 — Execute mode

**Audit** — Report findings ranked by severity, grouped by which CWV metric they affect. Do not
edit code. On an orchestrator handoff, the report has exactly one row: the `known_issue`.
→ Output template: [assets/templates/audit-report.template.md](assets/templates/audit-report.template.md)

**Fix** — Apply targeted changes to the file(s) in scope, aimed at the specific metric identified
in Step 2/3. Do not touch layout, styling, or logic that doesn't affect a Core Web Vital, and
don't reach into other files unless asked.

Only apply, without asking first, what the ticket/task directly names. Anything beyond that — a
sibling workflow with the same anti-pattern, a non-CWV inefficiency noticed along the way — gets
**surfaced, not applied**: name the file/pattern, say what you found, and ask before touching it.

Before reporting a fix as done:
1. Confirm the change doesn't alter *correctness* — a debounce delay or lazy/eager reassignment
   is a user-visible timing change, not just a perf tweak; state it explicitly (e.g. "search
   results now debounce by 200ms" or "hero image changed from lazy to eager since it's the LCP
   candidate").
2. If the same pattern appears in a sibling file (same workflow family), don't assume parity from
   naming similarity alone and don't silently skip it either — check the sibling's actual code
   independently, state what you found, then ask before fixing it.
3. If a URL is available, re-measure per Step 2 and report the before/after numbers for the
   specific metric the fix targeted.

→ Before/after patterns: [references/fix-patterns.md](references/fix-patterns.md)
→ Output template: [assets/templates/fix-report.template.md](assets/templates/fix-report.template.md) — required for every fix-mode run; a prose-only summary does not satisfy this step.

---

### Step 5 — Output

Fill the structured output card for every run — required, not optional. Attach the relevant mode
template. Do not end the turn with a prose-only recap in place of these templates.

Whenever Lighthouse was run, the report must always print, explicitly and in full — not just
reference internally or leave for a follow-up question:
- the CWV scores (overall + LCP/CLS/INP/TBT, each with its PASS/FAIL/UNRELIABLE status)
- the LCP element (selector + snippet)
- the full LCP breakdown table (TTFB, resource load delay, resource load duration, element
  render delay)

This holds even when the LCP element is ruled out as not-Unity — attribution doesn't excuse
omitting the numbers from the report; it just changes whether a fix gets proposed for them.

→ [assets/templates/output-card.template.yaml](assets/templates/output-card.template.yaml)

- Audit mode: also attach filled [assets/templates/audit-report.template.md](assets/templates/audit-report.template.md) — including its "LCP element and breakdown" section.
- Fix mode: also attach filled [assets/templates/fix-report.template.md](assets/templates/fix-report.template.md) — including its before/after "LCP element and breakdown" section.

## Rules

- Stay strictly scoped to LCP, CLS, INP, and TBT. A real inefficiency that doesn't move one of
  these four metrics doesn't belong in this skill's findings, severity ratings, or fixes — mention
  it in passing at most, and say it's out of this skill's scope.
- Never report a metric as caused by Unity without first checking (Step 2b) that the flagged
  element/script is actually inside Unity's rendered DOM or execution — attribute before fixing.
- Never read an LCP/CLS element from a `{node, score}`-shaped object without confirming which
  `audits[...]` key it came from — that shape is shared by unrelated audits (LCP vs. CLS culprit
  data look identical). Never assume an LCP element found in one run still applies to a later run
  of the same URL — throttling/timing conditions change which element actually wins LCP; re-derive
  it per run (Step 2b.1-2).
- Confirm the platform (mobile/desktop, and — for desktop — CLI-standard vs. matching a real
  DevTools-panel run) at intake and carry it into every measurement, table, and before/after
  comparison. The Lighthouse CLI default is *mobile*; `--preset=desktop` alone gives a fixed
  1350×940 viewport, which is **not** what Chrome DevTools' own Lighthouse panel does — the panel
  disables screen emulation and renders at the real window width. Confirm which one a
  user-supplied JSON actually is via `configSettings.channel`/`screenEmulation`, never assume.
  Never compare a mobile run against a desktop expectation, or a CLI-standard desktop run against
  a DevTools-panel run at a different width, and never present a metric or LCP element without
  stating exactly which variant produced it — the same URL can yield a different LCP element and
  timing per viewport width, and matched settings still don't guarantee identical numbers across
  a CLI run and a live DevTools-panel run (Step 2, "Even with matched settings...").
- Never put a Lighthouse number in a results table or headline summary without first passing
  Step 2a's validation. A caveat buried in a footnote is not enough — if `bootup-time`/
  `long-tasks` attribute the bulk of TBT to `_lighthouse-eval.js` or `Unattributable` rather than
  a real page URL, the row goes in as "unreliable," never as "FAIL." This happened on this
  skill's first real run (a sandboxed CLI execution reported 12.5s TBT and a 36/100 score driven
  by a 10-second `_lighthouse-eval.js` task; a clean local run of the same URL showed 0ms TBT and
  a high-90s score) — treat that as the expected failure mode of a sandboxed run, not a fluke.
- When a URL is available, tell the user up front (Step 2) that a sandboxed/CLI Lighthouse run
  can read worse than real, and prefer a user-supplied local-run JSON over the agent's own
  sandboxed run when both are on the table.
- On an orchestrator handoff (a `known_issue` is supplied), stay strictly ticket-scoped: no full
  checklist, no bonus findings, no widened audit.
- Never change layout, styling, or logic unrelated to the identified CWV cause.
- A debounce delay, or an eager/lazy loading reassignment, is a user-visible behavior change as
  well as a perf fix — state the new value and why, don't tune it silently.
- Prefer the existing shared lazy-load helper (`createIntersectionObserver` in `utils.js`, the
  `wirePreviewVideo` pattern in `inline-action.js`) over inventing a one-off implementation.
- Never apply a fix for anything beyond what the ticket/task directly names — including sibling
  files with a similar pattern or any other issue noticed along the way — without asking the
  user first. Report the finding and wait for a yes; don't fix-then-mention.
- Don't rely on a single Lighthouse run as proof of a regression or a fix — variance is real;
  compare before/after runs against the same URL.
- Run `npm run lint:js` on touched files after fixing and confirm no new errors versus the
  pre-fix baseline (this repo has pre-existing lint debt — diff against it, don't try to fix
  unrelated lint errors).
