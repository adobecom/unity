---
name: unity-jira
description: >
  Fetch a Jira ticket and classify it. Try to map it to a specialized Unity skill (e.g.
  accessibility → /unity-a11y); if a match is found, resolve the context that skill needs
  (pulling any linked Figma design, resolving the affected unitylibs widget/file via codebase
  search — asking the user only if resolution is genuinely ambiguous) and hand off to it. If no
  skill matches, state that and give a complete, comment-thread-aware summary, then ask the user
  how they'd like to proceed. Use when the user gives a Jira ticket key or URL and wants it
  triaged, summarized, or solved.
metadata:
  version: 0.3.0
  domain: Build and Code
  kind: skill
  tags: [jira, triage, orchestrator, ticket, summarize]
compatibility:
  agents: [claude-code, codex, cursor]
  requirements:
    - Access to the corp-jira MCP tools (search_jira_issues, get_jira_comments)
    - Figma MCP tools, for routes whose resolution step needs a linked design
    - The mapped skill (e.g. unity-a11y) present, for a matched-route handoff
#disable-model-invocation: true
---

# Unity Jira Orchestrator — `unity-jira`

Front door for a single Jira ticket. Always does the same first two steps (fetch, classify),
then tries to **map** the ticket to a specialized Unity skill via the registry below. A match
hands off to that skill with the resolved context already established. No match falls back to
the **general** route (summarize fully, then follow the user's lead — this route doesn't own an
execution path of its own, it just helps decide the next step).

This skill is an orchestrator, not a solver: it never performs the actual audit/fix/build work
itself — that always belongs to the mapped skill.

## Keywords

jira ticket, triage ticket, summarize ticket, solve ticket, MWPW, ticket to PR, what should I do
about this ticket, route ticket, accessibility ticket, WCAG ticket

## Purpose

- Fetch a ticket's summary, description, status, priority, labels, components, attachments, and
  full comment thread
- Classify which registered skill (if any) the ticket maps to, and say which signal decided it
- Matched route: understand the bug, pull any linked design/context the mapped skill needs,
  resolve the affected unitylibs component file(s) by searching the codebase, then hand off to
  the mapped skill — which owns the actual audit/fix/build workflow
- General route (no match): produce a complete, up-to-date summary (comments included — the
  description alone is often stale relative to where the discussion landed), propose what to do
  next, then ask the user how they want to proceed and follow their answer
- Never guess a component file when resolution is genuinely ambiguous — ask instead
- Never guess a skill mapping when the signal is weak or absent — fall back to the general route

## Intake (required)

Before doing anything, confirm:

- The ticket key or URL (e.g. `MWPW-199553` or a `jira.corp.adobe.com/browse/...` link)
- Whether the user already knows the affected component file(s) and target skill — if so, skip
  resolution and go straight to that skill with scope pre-filled

One blocking question at a time when the above is unclear.

---

## Skill Mapping Registry

The set of skills this orchestrator can route to. Extend this table as new Unity skills are
added — each entry needs a signal set (how to recognize a matching ticket) and a resolution
recipe (what context that skill needs before handoff).

| Domain          | Target skill  | Signals                                                                                                                    |
|-----------------|---------------|------------------------------------------------------------------------------------------------------------------------------|
| Accessibility   | `/unity-a11y` | `Accessibility` component; `a11y`/`WCAG_*`/`Accessibility_*` label; WCAG success-criterion reference (e.g. "3.3.2"); keywords: ARIA, screen reader, keyboard navigation, focus, contrast, accessible name, alt text |
| *(none yet)*    | *(add here)*  | e.g. a future `unity-performance` skill: keywords like LCP, CLS, bundle size, slow load, perf regression                     |

If a ticket doesn't clearly match any row, don't force it — take the general route instead.

---

## Workflow

### Step 1 — Fetch

Pull the ticket via the corp-jira MCP tools: summary, description, status, priority, labels,
components, attachments, and the **full comment thread**. Comments often carry the real,
current state of a ticket — a design confirmation, a scope change, a decision that supersedes
the original description — so don't stop at the description for any route.

### Step 2 — Classify

Check the ticket against each row of the **Skill Mapping Registry**, in order of confidence:

1. Explicit signal: a component/label that directly names the domain (e.g. `Accessibility`).
2. Strong keyword signal in summary/description matching a row's keyword list.
3. Ambiguous or no row matches confidently: don't guess — take the general route. A mislabeled
   ticket sent down the wrong route wastes more time than one clarifying question or a plain
   summary.

State which signal (or lack thereof) drove the decision so it's auditable, not a black box.

### Step 3a — Matched route (registry hit)

1. Read the description and full comments for context — the actual expected fix is often stated
   in a comment, not the description (see MWPW-199553's precedent: the description named a
   control, a later comment supplied the actual expected fix and a Figma link).
2. If a Figma URL appears in the description or comments, pull its design context/screenshot —
   it's fine to fetch it whenever a link is present, it often carries the real expected outcome.
   The Figma MCP tools behave inconsistently in headless sessions: `get_design_context` often
   fails with "nothing selected" when called on a frame/container node, but succeeds when called
   on a specific leaf node id. Don't give up after one failure — fall back in this order:
   `get_screenshot` first (reliable, gives a visual reference), `get_metadata` for layout/
   bounding-box structure, then `get_design_context` targeted at individual leaf node ids (not
   containers) when exact typography/color values are needed.
3. Identify the bug and resolve the affected component file(s) under `unitylibs/`: search for
   markup/class names/copy quoted in the ticket (`grep`/Explore), cross-referenced against the
   page/block named in the ticket and anything the Figma pull showed. If nothing matches
   confidently, or more than one plausible component is found, **stop and ask** — do not guess
   and hand a wrong file to the mapped skill.
   - A class-name grep match is not sufficient on its own when the same class names are shared
     across multiple widget folders — this repo has several (e.g. `.unity-act-btn`/`.gen-btn`
     exist identically in both `unitylibs/core/widgets/prompt-bar*` (Firefly) and
     `unitylibs/core/workflow/workflow-ai/` (Illustrator — "ai" there is Adobe's internal
     abbreviation for Illustrator, not "AI"). Cross-check the actual product named in the
     ticket's URL/summary against which folder owns that product before finalizing resolution;
     don't resolve to `workflow-ai` for a Firefly ticket just because the class names match.
     Example: a ticket whose URL points at a Firefly product page (e.g. contains `ai-photo-editor`
     or `ai-painting-generator`) should resolve to `prompt-bar*`, even though the identical
     `.unity-act-btn`/`.gen-btn` selectors also exist in `workflow-ai/widget.css` and would
     otherwise look like a match.
   - Once the primary file is resolved, grep for the same id/class/pattern signature across
     `unitylibs/` for sibling widgets that share the same code pattern. Note any sibling
     occurrences of the same bug class in the handoff context passed to the mapped skill. Don't
     silently expand scope to fix them, but don't let them go unmentioned either.
   - Before writing anything into the handoff about a sibling file's state — "already correct",
     "reference implementation", "not affected" — read that file yourself and verify the actual
     behavior, not just a surface-level grep match. A subagent's summary is a lead, not a
     verified conclusion; don't launder it into a stated fact in the handoff. If it's genuinely
     infeasible to verify before handing off, say the item is *unverified* and let the mapped
     skill check it, rather than asserting it's fine.
   - Domain-specific inspection (e.g. an accessibility-authoring-flag anti-pattern, a
     performance-budget check) belongs to the mapped skill's own workflow, not here — this step
     only locates and hands off the file(s); it doesn't diagnose the domain-specific root cause.
4. Once the file(s) are resolved, invoke the mapped skill (e.g. `/unity-a11y`) via the Skill tool
   with that scope already established, and with the bug understanding gathered here passed
   along as the known-issue context (so the mapped skill's own intake doesn't need to re-ask
   "discover vs. known issues" — it's already answered). Still let the mapped skill ask its own
   mode questions (e.g. audit/fix/add) — don't guess those on its behalf.
5. Relay the mapped skill's output; don't duplicate its checklist, patterns, or templates here.

### Step 3b — General route (no registry match)

1. Summarize the ticket **completely and up to date**: problem statement, environment/repro
   steps, priority — folded together with whatever the comment thread actually settled on. If
   comments changed the scope, revealed the real root cause, or reached a decision that
   contradicts the original description, say so explicitly and lead with the current state, not
   the stale one.
2. Propose what to do next — a proportional, ticket-level suggestion (e.g. likely area of the
   codebase, an open question that needs a PM/design answer, a suggested priority), not a deep
   investigation. This is a suggestion, not a plan the user has committed to.
3. Ask the user how they'd like to proceed.
4. Proceed according to their answer, using whatever's actually appropriate to that ask — this
   route doesn't hardcode a fixed execution path or hand off to a specific downstream skill; use
   judgment and the tools already available.

---

## Rules

- Never state a component file as the fix target without having grepped/read it first.
- The same standard applies in reverse: never state that a file is *unaffected*, *already
  correct*, or a *reference implementation* without having grepped/read it yourself first. A
  research subagent's classification ("OK, not affected") describes what it checked, not
  necessarily the full runtime behavior — verify the claim yourself before repeating it as
  settled fact in the handoff.
- Never skip the comment thread when summarizing or classifying — it's frequently where the
  ticket's real, current state lives.
- Don't re-implement a mapped skill's checklist, patterns, or templates here — this skill only
  gets the right ticket to the right skill and file(s), then hands off.
- If classification is borderline, or component resolution is ambiguous, say so and ask, rather
  than picking silently.
- Adding a new mapped skill means adding a row to the **Skill Mapping Registry** with its own
  signals — don't hardcode a new domain's routing logic outside that table.
- The general route doesn't own an execution path — it proposes and asks, then follows the
  user's actual instruction rather than assuming what "solve" means for that ticket's domain.

## Output

For every run, report:

```yaml
ticket: "{KEY}"
classification: "{matched skill name, or 'general'}"
classification_signal: "{the label/keyword/component that decided it}"
route_taken: "{<skill> handoff | summarize+propose}"
scope: "{resolved file(s), or 'unresolved — asked user'}"
figma_pulled: "{yes/link, or no}"
artifacts: "{mapped skill output, or the ticket summary + proposed next step}"
open_questions: "{anything still needing user input}"
```
