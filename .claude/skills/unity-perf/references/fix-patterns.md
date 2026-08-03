# Core Web Vitals Fix Patterns

Before/after snippets for the recurring CWV-affecting patterns named in
[checklist.md](checklist.md). Match the actual file's style (`createTag`, native
`addEventListener`, existing helper names) rather than pasting verbatim. Every pattern here maps
to a specific metric — cite which one in the fix report.

---

## LCP / TBT — Parallelize independent async bootstrap steps

**Before** (serial — style load blocks the workflow import even though they're independent):
```js
async function init(el) {
  await loadStyle(`${base}/unity.css`);
  const { default: wfinit } = await import(`${base}/core/workflow/workflow.js`);
  return wfinit(el);
}
```

**After**:
```js
async function init(el) {
  const [, { default: wfinit }] = await Promise.all([
    loadStyle(`${base}/unity.css`),
    import(`${base}/core/workflow/workflow.js`),
  ]);
  return wfinit(el);
}
```

Only collapse steps into `Promise.all` when they're genuinely independent — if a later step reads
a value produced by an earlier one, keep the await chain and say why in the fix report. Cite
which metric this targets (LCP if Unity content is the LCP candidate; TBT regardless, since the
work still happens, just concurrently instead of serially).

---

## LCP — Correct eager/lazy assignment on generated media

**Before** (blanket lazy-loading, including the element that is actually the LCP candidate):
```js
images.forEach((src) => grid.append(createTag('img', { src, loading: 'lazy' })));
```

**After**:
```js
images.forEach((src, i) => grid.append(createTag('img', {
  src,
  loading: i < 4 ? 'eager' : 'lazy', // keep the first visible row eager
})));
```

Don't blanket-apply `loading="lazy"` to elements that are already above the fold — that delays
their paint instead of helping it. Decide per element based on whether Lighthouse actually flagged
it as the LCP candidate (Step 2.3), and say which case applies.

---

## CLS — Reserve layout space for async-loaded content

**Before** (container grows/shifts once content arrives):
```js
const container = createTag('div', { class: 'unity-preview' });
fetchPreview().then((data) => container.append(renderPreview(data)));
```

**After**:
```js
const container = createTag('div', { class: 'unity-preview', style: 'min-height: 240px' });
fetchPreview().then((data) => container.append(renderPreview(data)));
```

Prefer a CSS rule (`min-height`, `aspect-ratio`) sized to the actual expected content over an
inline style when the widget already has a stylesheet — the inline example above is illustrative
only. For images specifically, set explicit `width`/`height` attributes on the `<img>` itself so
the browser reserves space before the asset loads, rather than relying on a wrapper's CSS alone.

---

## INP — Debounce an input-heavy handler

**Before**:
```js
input.addEventListener('input', (e) => runSearch(e.target.value));
```

**After** (matching the existing `debounce` usage in `workflow-ai/action-binder.js`):
```js
const debouncedSearch = debounce((value) => runSearch(value), 200);
input.addEventListener('input', (e) => debouncedSearch(e.target.value));
```

State the chosen delay (e.g. 200ms, matching the existing debounced handlers elsewhere in the
repo) — this is a small user-visible timing change, call it out in the fix report.

---

## TBT — Defer non-critical synchronous work off the critical path

**Before** (a large synchronous loop runs as one uninterrupted long task during init):
```js
function renderGallery(items) {
  items.forEach((item) => grid.append(buildCard(item)));
}
```

**After** (yield back to the main thread between chunks):
```js
function renderGallery(items) {
  const chunks = chunk(items, 20);
  function renderNext() {
    if (!chunks.length) return;
    chunks.shift().forEach((item) => grid.append(buildCard(item)));
    requestIdleCallback ? requestIdleCallback(renderNext) : setTimeout(renderNext, 0);
  }
  renderNext();
}
```

Only do this for genuinely large item counts where the loop shows up as a long task in the
Lighthouse trace — for small, bounded lists this adds complexity without a measurable TBT benefit.

---

## LCP — Preconnect hint (suggest, don't apply unprompted)

```html
<link rel="preconnect" href="https://<unity-service-domain>">
```

Only propose this when the LCP element's asset is fetched from a Unity Service domain hit early.
Since no `preconnect` hints exist anywhere in the repo today, treat this as a suggestion to raise
with the user rather than something to add silently — it changes `<head>` markup outside the
file(s) named in scope.
