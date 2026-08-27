# Unity Plug‑and‑Play Widget Architecture

*One reusable widget + a library of shared UI primitives that lets us onboard new Acrobat
Study Spaces verbs (and other Unity widgets) mostly through **authoring**, with little or no
new code — and, as measured below, with **no LCP penalty**.*

---

## 1. Executive summary (for PMs / managers)

- **Problem:** Each Unity widget used to be built standalone, so the same UI (dropzones,
  dropdowns, inputs, the widget shell) was copy‑pasted per widget. Every new verb meant
  forking a lot of code — slow to build, expensive to maintain, inconsistent for users.
- **What we built:** One reusable **base shell** + a small set of **shared UI primitives**.
  A widget is now *composed* from these pieces, and **which pieces appear is driven by the
  content‑authoring doc**, not hard‑coded per widget.
- **Proven across 4 layouts** (dropzone + prompt, prompt‑only, dropzone + search,
  dropzone‑only) — all from the *same* widget, differing only by authoring.
- **The payoff:** most new verbs are launched by **authoring alone (no code)**. A verb that
  needs a genuinely new element requires adding **one shared primitive once**, reusable by all
  future widgets.
- **Performance:** measured LCP for the modular approach is **equal to a single inlined
  bundle** (within run‑to‑run noise; see §6). The shared files are tiny and load in parallel,
  so they don't delay LCP.

**Net:** faster time‑to‑market for new verbs, far less duplicated code, consistent UX, no
performance regression.

---

## 2. How it works

Three layers, generic → specific:

```
┌─────────────────────────────────────────────────────────────┐
│  Base shell        core/widgets/shared/widget-base.js       │  ← same for every widget
│  · outer wrap, light/dark skin, sprite, page insertion      │
├─────────────────────────────────────────────────────────────┤
│  Shared primitives core/widgets/shared/                     │  ← build once, reuse everywhere
│  · dropzone.js · prompt-input.js · dropdown.js · shared.css │
├─────────────────────────────────────────────────────────────┤
│  Widget (per verb) prompt-upload.js                         │  ← thin: reads authoring,
│  · reads authoring flags → composes the primitives          │     composes primitives
└─────────────────────────────────────────────────────────────┘
```

- **Base shell** builds the container chrome and inserts the widget into the marquee. Reused untouched.
- **Shared primitives** are the reusable building blocks (dropzone, prompt/search input,
  dropdown/combobox, common CSS). No widget re‑implements these.
- **The widget** is thin — it reads authoring flags and assembles the primitives.

Composition rules keep it declarative:
- **Components are inferred from authored content.** The dropzone renders if any dropzone
  content is authored (`dropzone-label`, `dropzone-subtext`, `dropzone-style`,
  `select-file-text`, `drag-text`); the prompt renders if any prompt content is authored
  (`prompt-label`, `placeholder-text`, `prompt-dropdown-values`). The explicit
  `show-dropzone` / `show-prompt` flags are **optional overrides** — use them only to force an
  *empty* dropzone/prompt (no content).
- **Layout is inferred** from which components end up shown: dropzone + prompt → two columns;
  one of them → single column. The column divider only shows when both exist.
- **Per‑verb styling via a `pu-v-<verb>` class** (stamped automatically from the verb) + CSS
  variables — so each verb can tune sizes/spacing without touching JS (e.g. dropzone
  dimensions: `.pu-v-<verb> { --pu-dz-w: … }`).
- **Icons come from one shared sprite** via a single resolver `spriteIcon(name)` →
  `#unity-<name>-icon` (no per‑icon `if`s; add a symbol + author its name).

---

## 3. Supported layout variants (all one widget, authoring‑only)

| Variant | Verb example | Composition | Test URL |
|---|---|---|---|
| Dropzone + prompt | Presentation / Generate | dropzone content + `prompt-label` + `placeholder-text`, CTA + icon | _<placeholder — add URL>_ |
| Prompt only | Mind map | `placeholder-text` + CTA + icon (no dropzone content) | _<placeholder — add URL>_ |
| Dropzone + prompt dropdown | Citation generator | dropzone content (title inside) + `placeholder-text` + `search-icon` + `prompt-dropdown-values` | _<placeholder — add URL>_ |
| Dropzone only | Upload‑to‑redirect verbs | dropzone content + `dropzone-style: panel` (full‑width, "Select file" + drag/drop) | _<placeholder — add URL>_ |

---

## 4. Authoring reference

### 4a. Block classes (on the `unity` block)
| Class | Purpose |
|---|---|
| `workflow-prompt-upload` | Selects the workflow (loads its config + action‑binder). |
| `product-<name>` | Product context, e.g. `product-acrobat`. |
| `feature-<verb>` | The verb, e.g. `feature-citation-generator` (drives behavior + the `pu-v-<verb>` style variant). |
| `widget-<name>` | Selects the widget code, e.g. `widget-prompt-upload`. |

### 4b. Content rows (authoring flags)
Components are **inferred from content** (see §2) — you usually don't author `show-*` at all.

| Flag (`:key:`) | Type | Default | What it does |
|---|---|---|---|
| `dropzone-label` | text | "Upload source files" | Dropzone heading. *(Infers the dropzone.)* |
| `dropzone-label-position` | `above` \| `inside` | `above` | Heading (and subtext) above the box, or inside it. |
| `dropzone-subtext` | text | — | Secondary line, e.g. supported file types. *(Infers the dropzone.)* |
| `dropzone-style` | `box` \| `panel` | `box` | `box` = compact box; `panel` = full‑width box with a "Select file" button + drag‑and‑drop text. *(Infers the dropzone.)* |
| `select-file-text` | text | "Select file" | Panel button label (`dropzone-style: panel`). *(Infers the dropzone.)* |
| `drag-text` | text | — | Panel drag‑and‑drop line (`dropzone-style: panel`). *(Infers the dropzone.)* |
| `placeholder-text` | text | (fallback) | Placeholder for the prompt input. *(Infers the prompt.)* |
| `prompt-label` | text | — | If set, shows a **visible** label above the input; else sr‑only (a11y). *(Infers the prompt.)* |
| `prompt-dropdown-values` | comma‑list | — | Options for the in‑bar prompt dropdown (e.g. APA editions); present → dropdown renders. *(Infers the prompt.)* |
| `cta-text` | text | "Generate" | Primary button label. |
| `cta-icon` | sprite name | — | Leading icon on the CTA (e.g. `sparkle`). |
| `search-icon` | sprite name | — | Leading icon in the input (e.g. `search`). |
| `show-dropzone` | `true`/`false` | (inferred) | **Optional override** — force the dropzone on even with no dropzone content authored. |
| `show-prompt` | `true`/`false` | (inferred) | **Optional override** — force the prompt on even with no prompt content authored. |
| `error-filesize`, `error-filetype`, `error-request`, … | text | — | Error messages shown by the workflow (consumed by the action‑binder). |

Limits (allowed types, max size, max files) + the transition/splash screen live in the
workflow's `target-config.json`, not the authoring doc.

### 4c. Icons (single generic mechanism)
All icons live in `sprite.svg` as `#unity-<name>-icon`. The row **key = the slot**, the
**value = the sprite name** — resolved by one helper, no per‑icon code:
- CTA: `:cta-icon: sparkle` → `#unity-sparkle-icon`
- Search field: `:search-icon: search` → `#unity-search-icon`

Add a new icon = add the symbol to `sprite.svg` + author its name. Zero code change.

---

## 5. Onboarding future widgets — the core benefit

- **New verb reuses existing components → authoring only, no code.** Any combination of
  dropzone + prompt + dropdown + CTA + icons is created purely by authoring the flags above
  (plus an optional `pu-v-<verb>` CSS block to tune sizes). Zero JS, zero new files.
- **New verb needs a brand‑new element → add one shared primitive.** Paid **once**, then
  reusable by every widget via a flag (this is how the `panel` dropzone was added).
- **Contrast with the old model:** widgets were forked wholesale, duplicating dropdown /
  upload / shell logic; a bug fix or a11y improvement had to be repeated in every copy. Now
  it's fixed once for all widgets.

Most upcoming Study Spaces verbs (mind map, presentation, quiz, flashcards, study guide,
citation, …) are **combinations of the same building blocks**, so per‑verb effort drops from
"build a widget" to "author a page."

---

## 6. Performance / LCP — measured, no penalty

Two builds were compared on the same authored pages:
- **Approach A** — modular (widget imports the shared `core/widgets/shared/` primitives).
- **Approach B** — a single inlined `prompt-upload.js` bundle (no shared imports).

**Measured LCP (Chrome DevTools live metrics; A = left, B = right):**

| Run (layout) | Approach A | Approach B |
|---|---|---|
| 1 | 5.95 s | 5.98 s |
| 2 | 6.21 s | 6.24 s |
| 3 | 5.93 s | 5.95 s |
| 4 | 5.91 s | 5.93 s |

- **A and B are effectively identical** — the delta is ~20–30 ms (A even marginally *lower*
  every run), which is well within run‑to‑run noise. **Modularity adds no LCP cost.**
- **CLS ≈ 0.04 ("good")** on both — the widget causes no meaningful layout shift.
- The high **absolute** LCP (~6 s) is the **local, throttled dev environment** (the LCP
  element is the hero marquee `img`, not the widget) — so treat the **A‑vs‑B delta**, not the
  absolute number, as the signal.

**Why there's no penalty — small files, loaded in parallel:**
- The render‑critical shared modules are tiny (widget‑base, dropzone, prompt‑input each ≈1 KB
  gzipped; dropdown ≈1.5 KB; `shared.css` ≈1 KB) — the whole modular bundle is only ~1–2 KB
  more gzipped than the single inlined file.
- They're **preloaded together in parallel** via `priorityLibFetch` (HTTP/2 multiplexed), so
  there's **no request waterfall** — the extra files download concurrently and don't sit on
  the LCP path.
- Interaction‑only code (e.g. the prompt results/search) is **lazy‑loaded on first use**, so
  it never competes with initial render at all.

**Conclusion:** the modular, plug‑and‑play architecture delivers the maintainability and
reuse benefits with **no measurable LCP regression** vs a hand‑inlined bundle.

---

## 7. Status & recommendation

- **Implemented:** base shell, shared primitives (dropzone incl. box + panel styles,
  prompt‑input, dropdown, CSS), authoring‑driven composition, per‑verb style variants,
  generic sprite‑icon mechanism, opt‑in component flags — validated across the four layouts
  in §3, with the LCP comparison in §6.
- **Recommendation:** adopt the modular approach (Approach A). New verbs are predominantly an
  **authoring** task; add a shared primitive only when a genuinely new UI element appears.
