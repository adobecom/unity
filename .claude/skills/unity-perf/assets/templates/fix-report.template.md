## Core Web Vitals Fixes Applied — `{COMPONENT_NAME}`

**Scope:** {Full | Partial — root cause outside requested file(s): [{FILES}]}

| # | Metric | Change | Behavior change? |
|---|---|---|---|
| 1 | TBT/LCP | Parallelized style load + workflow import via `Promise.all` | No |
| 2 | INP | Added `debounce(200ms)` to search input handler | Yes — results now fire 200ms after last keystroke instead of every keystroke |
| 3 | CLS | Set explicit `width`/`height` on generated `<img>` | No |

**Lighthouse before/after** (platform: {Mobile (CLI default) | Desktop CLI-standard (--preset=desktop, 1350x940) | Desktop matching a DevTools-panel run (--screenEmulation.disabled, width=<W>)} — before and after must use the *same* variant):

| Metric | Before | After | Target |
|---|---|---|---|
| Overall score | XX | XX | ≥ 90 |
| LCP | X.Xs | X.Xs | ≤ 2.5s |
| CLS | X.XX | X.XX | ≤ 0.1 |
| INP | XXX ms | XXX ms | ≤ 200ms |
| TBT | XXX ms | XXX ms | ≤ 200ms |

*(Before and after must be measured on the **same platform** — a mobile "before" vs a desktop
"after" is not a valid comparison, since the LCP element itself can differ between them. If no URL
was available, state "unmeasured — no preview URL provided" instead of filling this table with
placeholder numbers.)*

**LCP element and breakdown (before vs. after):**

```
Element (before): {selector}   Element (after): {selector — re-derive, don't assume it's unchanged}
```

| Subpart | Before | After |
|---|---|---|
| Time to first byte | X ms | X ms |
| Resource load delay | X ms | X ms |
| Resource load duration | X ms | X ms |
| Element render delay | X ms | X ms |

*(Required whenever the fix targets LCP, or whenever a URL is available for re-measurement —
re-check the element itself each time per SKILL.md Step 2b.2, since a fix can change which
element wins LCP.)*

**Sibling files checked (same pattern):**
- `{FILE}` — {has the same pattern, fixed | different pattern, not affected: {why}}

**Noticed but out of scope (not a CWV issue, not pursued):**
- {e.g. "chunked-upload concurrency is uncapped in `chunkingUtils.js` — real inefficiency, but doesn't affect LCP/CLS/INP/TBT since it runs post-interaction; not fixed under this skill."}
