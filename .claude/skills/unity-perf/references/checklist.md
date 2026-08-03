# Core Web Vitals Checklist

Organized by the metric each item affects, not by file category — a pattern only earns a
checklist row here if it can move LCP, CLS, INP, or TBT. Walk only the buckets Step 1/2 of
SKILL.md flagged as relevant.

---

## Ownership and scope

- [ ] Confirmed the flagged element (LCP/CLS) or long-task script (TBT) is actually inside
      Unity's rendered DOM/execution before attributing the regression to it — see SKILL.md
      Step 2.3
- [ ] Flagged (not silently fixed) any real cause whose root cause is outside the requested file
      scope (e.g. a widget's own code is fine but a shared bootstrap sequence delays it)
- [ ] Checked whether the flagged element belongs to host-page/Milo-core markup that merely sits
      near the `.unity` block in the authored page — e.g. a `section-metadata` "background"
      image, a marquee hero image/heading. None of these are touched by any `unitylibs/` file;
      ruling Unity out here is not a failure to find the cause, it's the correct attribution.

---

## LCP (Largest Contentful Paint) — ≤ 2.5s

Only relevant when the LCP element is confirmed to be inside Unity's rendered DOM.

- [ ] The element/image that is the LCP candidate is not marked `loading="lazy"` — lazy-loading
      the actual LCP element delays it instead of helping it
- [ ] The LCP element's image/asset isn't blocked behind a serial await chain — e.g. `unity.js`'s
      `init()` awaiting `loadStyle()` then `import(workflow.js)` in sequence when they don't
      depend on each other; `workflow.js`'s widget-module import and action-binder import are
      similarly checked for whether they must be sequential
- [ ] The LCP element isn't hidden behind a CSS transition/opacity delay (`opacity: 0` →
      `opacity: 1` after a JS-driven delay) that pushes back its paint
- [ ] New feature/workflow code that renders the LCP candidate is reached via dynamic `import()`
      from `workflow.js`'s manifest, not a static import added to a shared entry point — a
      static import adds parse cost to every page before the LCP element can paint, even on
      pages where that workflow isn't used
- [ ] No web font tied to the LCP element blocks text rendering (check `font-display` behavior)
- [ ] If the LCP element's asset is fetched from a Unity Service domain rather than bundled with
      the page, a `<link rel="preconnect">` hint is a fix to *suggest* (none exist anywhere in
      the repo today — raise it, don't add it unprompted, since it touches `<head>` markup
      outside the named file scope)

---

## CLS (Cumulative Layout Shift) — ≤ 0.1

Only relevant when the shifting element is confirmed to be inside Unity's rendered DOM.

- [ ] Images/video generated via `createTag` specify explicit `width`/`height` (or an
      `aspect-ratio` CSS rule) so the browser reserves space before the asset loads
- [ ] A widget that mounts into the host page (dropzone, prompt bar, inline action) reserves its
      final layout size via CSS before its async content/data arrives, rather than growing/
      shrinking the page once content is available
- [ ] Content inserted after an async fetch (e.g. after a Unity Service response) lands in a
      pre-sized container/skeleton, not an empty element that expands on data arrival
- [ ] A CSS transition used to reveal Unity content doesn't itself shift surrounding layout
      (e.g. animating `height`/`margin` instead of `transform`/`opacity`)

---

## INP (Interaction to Next Paint) — ≤ 200ms

Only relevant to code that runs in response to a user interaction (click, keystroke, drag).

- [ ] Keystroke/search-input handlers are debounced (matching the existing pattern in
      `workflow-ai/action-binder.js` and `workflow-ai/widget.js`) — flag any input handler firing
      a network call or expensive DOM update on every keystroke with no debounce
- [ ] An interaction handler doesn't do heavy synchronous work (large DOM creation loop, JSON
      parse of a large payload, layout-forcing reads interleaved with writes) directly on the
      main thread during the interaction — defer non-critical work with
      `requestIdleCallback`/a microtask/next frame instead of doing it all before the next paint
- [ ] DOM reads and writes inside a loop triggered by an interaction are batched (all reads, then
      all writes), not interleaved in a way that forces layout recalculation mid-interaction

---

## TBT (Total Blocking Time) — ≤ 200ms

Concerned with main-thread-blocking JS during page load, regardless of whether the blocking code
renders the LCP element.

- [ ] Independent async bootstrap steps run concurrently (`Promise.all`) rather than serially
      awaited when they don't depend on each other
- [ ] New feature/workflow code is reached via dynamic `import()` from `workflow.js`'s manifest,
      not a static import added to a shared entry point — a static import adds parse/execute
      cost to every page's initial load, even pages that never activate that workflow
- [ ] Nothing new runs unconditionally in `unity.js` on every page load — code specific to a
      workflow belongs behind `core/workflow/`'s lazy `import()`, not the entry point
- [ ] A large synchronous loop (e.g. generating many `createTag` elements at once for a grid/
      gallery) is chunked or deferred rather than run as one uninterrupted long task

---

## Core Web Vitals reference table

| Metric | Target | What to check first |
|--------|--------|----------------------|
| **LCP** | ≤ 2.5 s | Is the LCP element inside Unity's DOM? If yes: lazy-loading, serial-await chains, hidden-then-revealed content |
| **CLS** | ≤ 0.1 | Missing width/height on media; unreserved space for async-loaded widget content |
| **INP** | ≤ 200 ms | Undebounced input handlers; heavy synchronous work in an interaction handler |
| **TBT** | ≤ 200 ms | Serial awaits in bootstrap/workflow init; a static import defeating code-splitting; large uninterrupted synchronous loops |
