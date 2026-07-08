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

Also check whether the relevant markup is conditionally rendered behind an authored content flag
(an `.icon-*`/placeholder-row class a page author must add for the feature to render at all) — a
recurring unitylibs anti-pattern where an accessibility feature exists in code but is silently
disabled unless a content author opts in. If found, say so explicitly: it determines whether the
real fix is code-level (make the feature unconditional, with a sensible fallback) or
content-authoring (add the missing flag/row to the page) — those have different owners.

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

**Fix** — Apply targeted changes to the file(s) in scope. Do not touch layout, styling, or logic unrelated to accessibility, and don't reach into other files unless asked.

Only apply, without asking first, what the ticket/task directly names. Anything beyond that —
a sibling file that appears to share the same bug, a design-value mismatch found while
verifying fidelity, a related issue noticed along the way — gets **surfaced, not applied**:
name the file/property, say what you found, and ask whether to include it before touching it.
Discovering an extra issue is not authorization to fix it.

If the fix originates from a design reference (e.g. a Figma link passed in from `/unity-jira`), the following is a hard gate — not optional, not skippable when short on time — before the fix can be reported as done:

1. List every visual property you are adding or changing (color, font-size, font-weight, line-height, spacing, etc.). An accessibility fix that adds visible content (a label, focus ring, error text, etc.) always has visual properties, even if the ticket's wording only mentions structure/behavior.
2. For each property, pull the actual value from the relevant Figma **leaf node** (`get_design_context` / `get_metadata` targeted at that specific leaf id — not a parent frame, and not a guess from eyeballing a screenshot) and note the source node id.
3. Compare each pulled value against the CSS you're touching or adding. Do not assume existing CSS is already correct just because a rule with a plausibly-matching class name already exists — "a rule exists" and "the rule's values match the design" are different claims; verify the second one explicitly. If a value is out of scope for the named fix (e.g. it belongs to an element the ticket didn't ask about), surface it and ask rather than fixing it inline.
4. If the same bug pattern appears to exist in a sibling/similar file (same widget family, similar id/class naming), don't assume parity from naming similarity alone and don't silently skip it either — open the sibling's actual CSS/JS and check its structure independently. State explicitly what you found, then ask before fixing it: this is a new file outside the named scope, so silence is not consent.

If a pulled design value can't be matched without a broader design-token or shared-rule change (e.g. it would also recolor unrelated elements), don't hardcode it silently — flag it per the Rules below instead.

→ Before/after patterns (using `createTag` + native `addEventListener`, matching this repo's actual style): [references/fix-patterns.md](references/fix-patterns.md)
→ Output template: [assets/templates/fix-report.template.md](assets/templates/fix-report.template.md) — fill this for every fix-mode run before ending the turn, including the design-fidelity table when a design reference was used; a prose-only summary does not satisfy this step.

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
- When a fix is driven by a design reference, verify every touched visual property against the
  actual Figma leaf node value before considering the fix complete — an existing CSS rule with a
  plausibly-matching class name is not evidence that its values are correct. Do this in the same
  pass as the fix, not only when asked.
- Never apply a fix for anything beyond what the ticket/task directly names — including sibling
  files with a similar bug, design-value mismatches found while verifying fidelity, or any other
  issue noticed along the way — without asking the user first. Report the finding and wait for a
  yes; don't fix-then-mention.
- Keep inline a11y comments to non-obvious ARIA choices only.
- Run `npm run lint:js` / `npm run lint:css` on touched files after fixing and confirm no new
  errors versus the pre-fix baseline (this repo has pre-existing lint debt — diff against it,
  don't try to fix unrelated lint errors).
