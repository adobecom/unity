# Fix Patterns (unitylibs)

Before/after patterns for the most frequent WCAG violations, written in this repo's actual
conventions: `createTag(tag, attrs, content)` (the shared DOM-building helper) and native
`addEventListener`.

## Add Mode Steps

1. Read the component and check whether its event listeners are attached in the same file or a
   sibling binder/workflow file — trace before concluding a handler is missing.
2. Identify the component's interaction model: static display, interactive widget, form,
   drop zone/upload, dialog, or live-updating region.
3. Apply additions in this order:
   - Semantic HTML first (replace `<div>`/`<span>` with the correct native element)
   - ARIA roles, labels, states — only where semantic HTML is insufficient
   - Keyboard interaction (focus management, key handlers)
   - Focus-visible indicator (never leave `outline: none` without a replacement)
   - Live regions for dynamic content
4. Add an inline comment only for non-obvious ARIA choices.

---

## Missing image alt text (WCAG 1.1.1)

```js
// before (broken) — no alt, screen readers announce the filename or nothing useful
createTag('img', { src: profileSrc });
```

```js
// after (fixed)
// informative
createTag('img', { src: profileSrc, alt: `Profile photo of ${name}` });

// decorative
createTag('img', { src: dividerSrc, alt: '' });
```

---

## Icon-only button missing label (WCAG 1.1.1, 4.1.2)

```js
// before (broken) — button has no accessible name, announced as just "button"
const btn = createTag('button', { type: 'button' });
btn.innerHTML = '<svg><use xlink:href="#icon-trash"></use></svg>';
```

```js
// after (fixed)
const btn = createTag('button', { type: 'button', 'aria-label': 'Delete item' });
btn.innerHTML = '<svg aria-hidden="true"><use xlink:href="#icon-trash"></use></svg>';
```

If this codebase already has a shared helper for building sprite-icon markup, reuse it (and
confirm it marks the `<svg>` `aria-hidden="true"`) instead of hand-rolling new markup.

---

## `<div>`/`<span>` used as interactive element (WCAG 4.1.2, 2.1.1)

```js
// before (broken) — no role, no keyboard support; invisible to keyboard/screen-reader users
const btn = createTag('div', { class: 'btn' }, 'Submit');
btn.addEventListener('click', handleClick);
```

Prefer a native `<button>`:

```js
// after (fixed)
const btn = createTag('button', { type: 'button', class: 'btn' }, 'Submit');
btn.addEventListener('click', handleClick);
```

If a native `<button>` is blocked by a styling constraint and an `<a>` is reused instead, add
`role="button"` and cover both activation paths:

```js
// after (fixed) — anchor reused as a button
const el = createTag('a', {
  href: '#', role: 'button', tabindex: '0', class: 'btn',
}, 'Submit');
el.addEventListener('click', (e) => { e.preventDefault(); handleClick(e); });
el.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(e); }
});
```

---

## Form input missing label (WCAG 3.3.2, 4.1.2)

```js
// before (broken) — placeholder is not a label; disappears once the user types
const input = createTag('input', { type: 'email', placeholder: 'Email address' });
```

```js
// after (fixed)
const label = createTag('label', { for: 'email-input' }, 'Email address');
const input = createTag('input', { id: 'email-input', type: 'email', autocomplete: 'email' });
```

If a sibling widget already renders the same kind of label with a fallback default (e.g.
`labelText || 'Prompt'` for an unauthored placeholder), match its established fallback text and
pattern rather than inventing new copy — grep sibling widgets for the same field id/class before
writing a new default string.

When a visible label isn't feasible (common for compact prompt/search inputs):

```js
// after (fixed) — aria-label in place of a visible <label>
const textarea = createTag('textarea', {
  id: 'prompt-input', 'aria-label': 'Describe what you want to generate',
});
```

---

## Input error not announced (WCAG 3.3.1, 4.1.3)

```js
// before (broken) — only a visual cue; nothing ties the error to the field for AT
input.classList.add('input-error');
const error = createTag('span', { class: 'error-text' }, 'Please enter a valid email address.');
input.after(error);
```

```js
// after (fixed)
input.setAttribute('aria-invalid', 'true');
input.setAttribute('aria-describedby', 'email-error');
const error = createTag('span', { id: 'email-error', role: 'alert' }, 'Please enter a valid email address.');
input.after(error);
```

---

## Combobox/listbox not keyboard accessible (WCAG 2.1.1, 4.1.2)

```js
// before (broken) — no roles, no aria-expanded, no keyboard handling; mouse-only
const combo = createTag('div', { class: 'combo' }, selectedLabel);
combo.addEventListener('click', toggleOpen);
const list = createTag('ul', { class: 'options-list' });
options.forEach((opt) => list.append(createTag('li', {}, opt.label)));
```

If a similar combobox/listbox already exists elsewhere in this codebase, match its established
roles and keyboard handling rather than inventing a new one:

```js
// after (fixed)
const combo = createTag('div', {
  role: 'combobox',
  'aria-expanded': String(isOpen),
  'aria-haspopup': 'listbox',
  'aria-controls': 'options-list',
  tabindex: '0',
}, selectedLabel);
combo.addEventListener('keydown', handleComboKeydown);

const list = createTag('ul', { id: 'options-list', role: 'listbox', 'aria-label': 'Options' });
options.forEach((opt) => {
  list.append(createTag('li', {
    id: opt.id, role: 'option', 'aria-selected': String(opt.id === selectedId),
  }, opt.label));
});
```

---

## Dialog focus management (WCAG 2.1.2, 2.4.3)

```js
// before (broken) — no role/aria-modal, no focus moved on open, no focus restored on close
const dialog = createTag('div', { class: 'dialog' });
dialog.append(createTag('h2', {}, title), closeBtn);

function openDialog() { dialog.style.display = 'block'; }
function closeDialog() { dialog.style.display = 'none'; }
```

```js
// after (fixed)
const dialog = createTag('div', {
  role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title', tabindex: '-1',
});
dialog.append(createTag('h2', { id: 'dialog-title' }, title), closeBtn);

function openDialog(triggerEl) {
  dialog.style.display = 'block';
  dialog.focus();
  dialog.dataset.trigger = triggerEl ? '' : undefined;
}
function closeDialog(triggerEl) {
  dialog.style.display = 'none';
  triggerEl?.focus();
}
```

---

## Dynamic content not announced (WCAG 4.1.3)

```js
// before (broken) — visible to sighted users, but silent to screen readers:
// no role/aria-live, and wrapping it in aria-hidden hides it from AT entirely
const status = createTag('div', { class: 'loading-content', 'aria-hidden': 'true' });

const alertEl = createTag('div', { class: 'error-toast' });
```

```js
// after (fixed)
// Polite — status/progress updates. Don't wrap this container (or a parent) in
// aria-hidden="true" while it's visible — that silently hides it from screen readers
// even though sighted users can see it.
const status = createTag('div', {
  class: 'loading-content', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
});

// Assertive — errors only, since it interrupts immediately.
const alertEl = createTag('div', { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': 'true' });
```

---

## Focus indicator removed (WCAG 2.4.7)

```css
/* before (broken) — outline removed with no replacement; keyboard users lose all focus visibility */
.btn:focus {
  outline: none;
}
```

Reuse the widget's own existing focus-color custom property if its CSS already defines one — don't
hardcode a new color:

```css
/* after (fixed) */
.btn:focus-visible {
  outline: 2px solid var(--focus-color, #005fcc);
  outline-offset: 2px;
}
```

---

## Generic link text (WCAG 2.4.4)

```js
// before (broken) — meaningless out of context when a screen reader lists all links on the page
createTag('a', { href: articleHref }, 'Read more');
```

```js
// after (fixed)
createTag('a', { href: articleHref, 'aria-label': `Read more about ${articleTitle}` }, 'Read more');
```
