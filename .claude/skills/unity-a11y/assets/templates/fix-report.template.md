## Accessibility Fixes Applied — `{COMPONENT_NAME}`

**Scope:** {Full | Partial — root cause outside requested file(s): [{FILES}]}

| # | WCAG | Change |
|---|---|---|
| 1 | 1.1.1 | Added `alt="{DESCRIPTION}"` to `<img>` |
| 2 | 4.1.2 | Replaced `<div role="button">` with `<button>` |
| 3 | 2.1.1 | Added `keydown` listener with Enter/Space support |

**Flagged for design/tokens (out of scope):**
- Contrast issue on `.{CLASS}` requires a color token change — flag to design system team.
