---
name: unity-a11y
description: >
  Audit, fix, and instrument unitylibs components (vanilla JS/DOM, built with the shared
  `createTag` helper) to meet WCAG 2.1 AA accessibility standards. Use when the user asks to
  audit accessibility, fix ARIA issues, add keyboard navigation, make a component
  screen-reader friendly, improve focus management, check color contrast, address WCAG
  compliance, or add accessibility to a Unity widget/feature.
metadata:
  version: 1.0.0
  domain: Build and Code
  kind: skill
  tags: [accessibility, a11y, wcag, aria, unitylibs, keyboard, screen-reader]
compatibility:
  agents: [claude-code, codex, cursor]
  requirements:
    - Component file(s) under unitylibs/ in scope
#disable-model-invocation: true
---

# Web Accessibility — `unity-a11y`

Workflow for auditing, fixing, and instrumenting **unitylibs** components against WCAG 2.1 AA.
Unitylibs is vanilla JS/HTML/CSS (no React/Vue/Angular, no component library) — widgets are
built by hand with the `createTag(tag, attrs, content)` helper from `scripts/utils.js`, wired up
with native `addEventListener`. Every element here is local, custom code: there is no
SDK-managed component boundary to scope around, so audits/fixes apply to the full component.

## Keywords

audit accessibility, fix a11y, add ARIA, keyboard navigation, screen reader, focus management,
color contrast, WCAG compliance, aria-label, aria-describedby, role, tabindex, accessible component

## Purpose

- Audit unitylibs components and report ranked issues
- Fix existing accessibility violations
- Add WCAG 2.1 AA compliance to a new or bare widget/feature
- Flag issues that live outside the given file(s) (e.g. a widget's markup here vs. its event
  wiring in a sibling binder/workflow file) rather than silently editing files that weren't in
  scope

## Intake (required)

Before proposing a plan, confirm:

- which component file(s) under `unitylibs/` are in scope
- what the user wants: **audit** (report only), **fix** (apply changes), or **add** (instrument from scratch)
- whether there is a known issue list or the skill should discover issues first

One blocking question at a time when the above is unclear.

## Workflow

### Step 1 — Map the component

Read the file(s) in scope. Identify every interactive or structural element created via
`createTag` (buttons, anchors, inputs, drop zones, etc.), and note where its event listeners are
actually attached — in unitylibs, DOM construction and event wiring are often split across files
(a widget file builds the markup, a sibling binder/workflow file attaches `click`/`keydown`/`drag`
handlers). Trace that wiring before concluding an element is or isn't keyboard-operable — a
missing `keydown` handler in the file you're editing may already exist in its binder.

If the task scope is a single file but a real issue's root cause is in a different file, say so
explicitly rather than expanding scope without asking.

---

### Step 2 — Identify mode

Decide which branch to follow based on the user's intent:

| User intent | Mode |
|---|---|
| "audit", "check", "review", "what's wrong" | **Audit** |
| "fix", "resolve", "address", "correct" | **Fix** |
| "add accessibility", "make accessible", "add ARIA" | **Add** |

If intent is ambiguous, ask: "Do you want me to (1) audit and report issues, (2) fix existing issues, or (3) add accessibility to a new component?"

---

### Step 3 — Run the checklist

Walk every element through the checklist. Cover: semantics, accessible name, state and
relationships, keyboard and focus, forms, visual checks, dynamic updates, and WCAG criteria.

For widget-like components (dialogs, drop zones, combobox/listbox suggestion lists, progress/status,
etc. — the patterns actually used across unitylibs), look up the correct ARIA pattern before
proposing a fix.

→ Checklist + WCAG criteria: [references/checklist.md](references/checklist.md)
→ Widget patterns: [references/pattern-guide.md](references/pattern-guide.md)

---

### Step 4 — Execute mode

**Audit** — Report findings ranked by severity (Critical → Serious → Moderate → Minor). Do not edit code.
→ Output template: [assets/templates/audit-report.template.md](assets/templates/audit-report.template.md)

**Fix** — Apply targeted changes to the file(s) in scope. Do not touch layout, styling, or logic unrelated to accessibility, and don't reach into other files unless asked. If the fix originates from a design reference (e.g. a Figma link passed in from `/unity-a11y-jira`), pull the exact color/font-size/spacing off the relevant leaf node and verify the CSS you touch matches it — don't rely on eyeballing a screenshot. If the element has theme-conditional variants (`.light`/`.dark` or similar), re-verify contrast in every variant after editing a shared color rule, not just the variant you're actively looking at — splitting or consolidating a color rule can silently break contrast in a variant you didn't re-check.
→ Before/after patterns (using `createTag` + native `addEventListener`, matching this repo's actual style): [references/fix-patterns.md](references/fix-patterns.md)
→ Output template: [assets/templates/fix-report.template.md](assets/templates/fix-report.template.md) — fill this for every fix-mode run before ending the turn; a prose-only summary does not satisfy this step.

**Add** — Instrument the component from scratch: semantic HTML first, then ARIA roles/states, keyboard handling, focus management, live regions.
→ Add mode steps + patterns: [references/fix-patterns.md](references/fix-patterns.md)

---

### Step 5 — Output

Fill the structured output card for every run — this is a required step, not optional
documentation. Attach the relevant mode template. Do not end the turn with a prose-only recap in
place of these templates.

→ [assets/templates/output-card.template.yaml](assets/templates/output-card.template.yaml)

## Output (structured-first)

Fill [assets/templates/output-card.template.yaml](assets/templates/output-card.template.yaml) for every run — required, before the turn is considered done.

- Audit mode: also attach filled [assets/templates/audit-report.template.md](assets/templates/audit-report.template.md).
- Fix mode: also attach filled [assets/templates/fix-report.template.md](assets/templates/fix-report.template.md).

## Rules

- Never change visual layout, styling, or logic unrelated to accessibility.
- Prefer native semantic HTML over ARIA roles; add ARIA only where semantic HTML is insufficient.
- Never use positive `tabindex` values.
- Never remove `outline` / `focus-visible` styles without a replacement — if the widget's CSS
  already defines a focus-color custom property, reuse it rather than inventing or hardcoding a
  new one.
- If a fix requires a new design token or color change, flag it as out-of-scope and recommend a
  design-system update rather than hardcoding a value.
- Keep inline a11y comments to non-obvious ARIA choices only.
- Run `npm run lint:js` / `npm run lint:css` on touched files after fixing and confirm no new
  errors versus the pre-fix baseline (this repo has pre-existing lint debt — diff against it,
  don't try to fix unrelated lint errors).
