## Core Web Vitals Audit — `{COMPONENT_NAME}`

**Scope:** {Full | Partial — root cause outside requested file(s): [{FILES}]}

### Lighthouse measurement

```
Platform: {Mobile (CLI default) | Desktop CLI-standard (--preset=desktop, 1350x940) | Desktop matching a DevTools-panel run (--screenEmulation.disabled, width=<W>)}
Run validated (Step 2a): {Yes | No — see note below}
runWarnings: {none | verbatim text from Lighthouse's runWarnings array}

Overall score:  XX / 100   [PASS/FAIL/UNRELIABLE]
LCP:            X.Xs       [PASS/FAIL]  — element: {selector/snippet} — in Unity DOM: Yes/No
CLS:            X.XX       [PASS/FAIL]  — element in Unity DOM: Yes/No
INP:            XXX ms     [PASS/FAIL] (or N/A if not measurable — needs real interaction)
TBT:            XXX ms     [PASS/FAIL/UNRELIABLE]  — long task attributed to: {real URL/file, or "not Unity", or "_lighthouse-eval.js / Unattributable — see note"}
```

State the platform explicitly — mobile, CLI-standard desktop, and DevTools-panel-matching desktop
runs of the same URL can each report a different LCP/CLS element and different timings, so a
metric block without its exact variant label is ambiguous. If more than one variant was measured,
repeat this block once per variant rather than merging them.

Use **UNRELIABLE**, never FAIL, when Step 2a's cross-check shows the dominant long-task/bootup-time
contributor isn't a real page URL (e.g. `_lighthouse-eval.js`, `Unattributable`) — that's the
signature of a sandboxed/CPU-starved run, not a real regression. State the likely cause (agent-run
Lighthouse in a constrained environment) and, if possible, note that a clean local run is needed
to get a trustworthy number.

*(Omit this section entirely and state "no URL available — findings below are unmeasured" if
Lighthouse wasn't run.)*

### LCP element and breakdown

Required whenever Lighthouse was run — don't fold this into the summary line above or drop it,
even when the element is ruled out as not-Unity. Pull straight from `lcp-breakdown-insight` (or
`largest-contentful-paint-element` on older Lighthouse versions) per Step 2b.1.

```
Element:    {selector, e.g. "main > div.section > picture.section-background > img"}
Snippet:    {the node's outerHTML snippet, e.g. `<img loading="lazy" ... width="3840" height="1744">`}
In Unity DOM: {Yes | No — <reason, e.g. "Milo-core section-background image">}
```

| Subpart | Duration | % of LCP |
|---|---|---|
| Time to first byte | X ms | X% |
| Resource load delay | X ms | X% |
| Resource load duration | X ms | X% |
| Element render delay | X ms | X% |

Call out whichever subpart dominates and what it implies (e.g. a large "resource load delay" on a
`loading="lazy"` element means the browser deferred the fetch, not that the network was slow) —
but only propose a fix for it if the element is confirmed inside Unity's DOM; otherwise state it
as a finding for whoever owns that markup, per the ownership/scope rule.

### Issues

| # | Metric | Severity | Location | Issue | Recommendation |
|---|---|---|---|---|---|
| 1 | LCP | Critical | `unity.js:init()` | Style load and workflow import awaited serially, delaying LCP element | Parallelize via `Promise.all` (see fix-patterns.md) |
| 2 | CLS | Serious  | `.unity-preview` container | No reserved space before async content loads | Set `min-height`/`aspect-ratio` |
| 3 | INP | Moderate | search `<input>` | No debounce on keystroke handler | Add `debounce(fn, 200)` |
| 4 | TBT | Minor    | gallery render loop | Large synchronous `forEach` shows up as a long task | Chunk with `requestIdleCallback` |

Only include rows for issues that were shown (via measurement) or reasoned (via the checklist) to
actually affect one of the four metrics. A real inefficiency that doesn't move LCP/CLS/INP/TBT
does not get a row here — mention it separately as out of scope if noticed.

### Summary

Critical: {N}  Serious: {N}  Moderate: {N}  Minor: {N}
Estimated effort: {Low | Medium | High}
