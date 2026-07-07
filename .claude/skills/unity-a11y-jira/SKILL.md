---
name: unity-a11y-jira
description: >
  Fetch a Jira ticket and classify it. If it isn't accessibility-related, state that and give a
  complete, comment-thread-aware summary, then ask the user how they'd like to proceed. If it
  is accessibility-related, understand the bug (pulling any linked Figma design), resolve the
  affected unitylibs widget/file via codebase search — asking the user only if resolution is
  genuinely ambiguous — then hand off to /unity-a11y with that context already established.
  Use when the user gives a Jira ticket key or URL and wants it triaged, summarized, or solved.
metadata:
  version: 0.2.0
  domain: Build and Code
  kind: skill
  tags: [jira, triage, accessibility, ticket, summarize]
compatibility:
  agents: [claude-code, codex, cursor]
  requirements:
    - Access to the corp-jira MCP tools (search_jira_issues, get_jira_comments)
    - Figma MCP tools, for the accessibility route when a design link is present
    - unity-a11y skill present, for the accessibility route handoff
#disable-model-invocation: true
---

# Unity Accessibility Jira Router — `unity-a11y-jira`

Front door for a single Jira ticket. Always does the same first two steps (fetch, classify),
then splits into two routes: **accessibility** (resolve context, hand off to `/unity-a11y`,
which does the actual audit/fix) or **general** (summarize fully, then follow the user's lead —
this route doesn't own an execution path of its own, it just helps decide the next step).

## Keywords

jira ticket, triage ticket, summarize ticket, solve ticket, MWPW, accessibility ticket, WCAG
ticket, ticket to PR, what should I do about this ticket

## Purpose

- Fetch a ticket's summary, description, status, priority, labels, components, attachments, and
  full comment thread
- Classify whether it's accessibility-flavored or general, and say which signal decided it
- Accessibility route: understand the bug, pull any linked Figma design, resolve the affected
  unitylibs component file(s) by searching the codebase, then hand off to `/unity-a11y` — which
  owns the actual audit/fix/add workflow
- General route: produce a complete, up-to-date summary (comments included — the description
  alone is often stale relative to where the discussion landed), propose what to do next, then
  ask the user how they want to proceed and follow their answer
- Never guess a component file when resolution is genuinely ambiguous — ask instead

## Intake (required)

Before doing anything, confirm:

- The ticket key or URL (e.g. `MWPW-199553` or a `jira.corp.adobe.com/browse/...` link)
- Whether the user already knows the affected component file(s) — if so, skip resolution and go
  straight to `/unity-a11y` with that scope pre-filled

One blocking question at a time when the above is unclear.

---

## Workflow

### Step 1 — Fetch

Pull the ticket via the corp-jira MCP tools: summary, description, status, priority, labels,
components, attachments, and the **full comment thread**. Comments often carry the real,
current state of a ticket — a design confirmation, a scope change, a decision that supersedes
the original description — so don't stop at the description for either route.

### Step 2 — Classify

Decide **accessibility** vs. **general** using, in order of confidence:

1. Explicit signal: `Accessibility` component, an `a11y`/`WCAG_*`/`Accessibility_*` label, or a
   WCAG success-criterion reference (e.g. "3.3.2") in the description.
2. Strong keyword signal in summary/description: ARIA, screen reader, keyboard navigation,
   focus, contrast, accessible name, alt text, WCAG.
3. Ambiguous: ask the user rather than guessing — a mislabeled ticket sent down the wrong route
   wastes more time than one clarifying question.

State which signal drove the classification so it's auditable, not a black box.

### Step 3a — General route

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

### Step 3b — Accessibility route

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
   and hand a wrong file to `/unity-a11y`.
   - Check whether the relevant markup is conditionally rendered behind an authored content flag
     (an `.icon-*`/placeholder-row class a page author must add for the feature to render at
     all) — a recurring unitylibs anti-pattern where an accessibility feature exists in code but
     is silently disabled unless a content author opts in. If found, say so explicitly: it
     determines whether the real fix is code-level (make the feature unconditional, with a
     sensible fallback) or content-authoring (add the missing flag/row to the page) — those have
     different owners.
   - Once the primary file is resolved, grep for the same element id/class signature (e.g. a
     shared `id="promptInput"`-style anchor) across `unitylibs/` for sibling widgets sharing the
     same pattern. Note any sibling occurrences of the same bug class in the handoff context
     passed to `/unity-a11y` — don't silently expand scope to fix them, but don't let them go
     unmentioned either.
4. Once the file(s) are resolved, invoke `/unity-a11y` via the Skill tool with that scope already
   established, and with the bug understanding gathered here passed along as the known-issue
   context (so `/unity-a11y`'s own intake doesn't need to re-ask "discover vs. known issues" —
   it's already answered). Still let `/unity-a11y` ask its own mode question (audit/fix/add) —
   don't guess that on its behalf.
5. Relay `/unity-a11y`'s output; don't duplicate its checklist, patterns, or templates here.

---

## Rules

- Never state a component file as the fix target without having grepped/read it first.
- Never skip the comment thread when summarizing or classifying — it's frequently where the
  ticket's real, current state lives.
- Don't re-implement `/unity-a11y`'s checklist, patterns, or templates here — this skill only
  gets the right ticket to the right file(s) and hands off.
- If classification is borderline, or component resolution is ambiguous, say so and ask, rather
  than picking silently.
- The general route doesn't own an execution path — it proposes and asks, then follows the
  user's actual instruction rather than assuming what "solve" means for that ticket's domain.

## Output

For every run, report:

```yaml
ticket: "{KEY}"
classification: "{accessibility | general}"
classification_signal: "{the label/keyword/component that decided it}"
route_taken: "{unity-a11y handoff | summarize+propose}"
scope: "{resolved file(s), or 'unresolved — asked user'}"
figma_pulled: "{yes/link, or no}"
artifacts: "{unity-a11y output, or the ticket summary + proposed next step}"
open_questions: "{anything still needing user input}"
```
