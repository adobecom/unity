# Component Pattern Guide (unitylibs)

Common ARIA/interaction patterns for unitylibs-style components: vanilla JS/DOM, built with the
shared `createTag` helper and native `addEventListener`. Prefer native HTML and established
platform behavior before building any custom widget logic.

## Buttons and links

- Use `<button>` for in-place actions; `<a href>` for real navigation.
- If an `<a>` must be reused for an in-page action (no real destination), add `role="button"` and
  make sure both `click` (with `preventDefault`) and `keydown` for Enter/Space are wired. In this
  codebase, markup and event wiring are sometimes split across files (a widget file builds the DOM,
  a sibling binder/workflow file attaches handlers) — check both before concluding a handler is
  missing.
- Icon-only controls must have an accessible name (`aria-label` or visually hidden text).
- Never use a clickable `<div>` or `<span>` unless all button behavior (keyboard, role, focus) is
  fully implemented.

## Drop zones and file upload

- Standard pattern: keep the real `<input type="file">` hidden from assistive tech
  (`aria-hidden="true"` + `tabindex="-1"`), triggered by a separate, fully keyboard-accessible
  button. Drag-and-drop on the surrounding drop-zone container is a pointer-only enhancement
  layered on top — the container itself can be excluded from the tab order (`tabindex="-1"`) as
  long as the equivalent button inside it is reachable and operable by keyboard.
- Anti-pattern to watch for: loading/progress content that becomes visible inside a drop zone
  during upload must not be `aria-hidden="true"` while it's shown — that silently hides status
  from screen readers even though sighted users can see it. Check whether a wrapper's `aria-hidden`
  state was inherited/copied from a different (genuinely hidden) state before reusing it for
  dynamic content.

## Forms, text inputs, and textareas

- Every field must have a programmatically associated label — a visible `<label for>`, or
  `aria-label` when no visible label fits (common for compact prompt/search inputs).
- Connect helper text and error messages to the field via `aria-describedby`.
- Mark `aria-invalid="true"` only when validation has actually failed.
- Placeholder text is never a substitute for a label.

## Combobox and listbox (suggestion/autocomplete lists)

- Standard pattern: `role="combobox"` on the input/trigger, `role="listbox"` on the options
  container, `role="option"` on each item, `aria-expanded` reflecting open/closed state, and
  either `aria-activedescendant` or per-option `aria-selected` to track the active choice. Wire
  ArrowDown/ArrowUp to move selection, Enter to commit, Escape to close.
- High-risk pattern — verify accessible name, expanded state, and keyboard movement explicitly;
  don't assume it's correct just because the roles are present. If a similar combobox/listbox
  already exists elsewhere in this codebase, match its established roles and keyboard behavior
  rather than inventing a new convention.

## Dialogs (modals, splash/transition screens)

- Standard pattern: `role="dialog"`, `aria-modal="true"`, `tabindex="-1"` on the dialog container,
  with a labelled heading (`aria-labelledby` pointing at it).
- Move focus into the dialog on open (to the dialog itself or its first focusable element).
- Restore focus to the invoking control on close.
- Constrain keyboard focus while modal behavior is active (no tabbing to content behind the
  dialog).

## Status, progress, alerts, and toasts

- Progress/loading indicators: expose progress via `role="progressbar"` with
  `aria-valuenow`/`aria-valuemin`/`aria-valuemax`, or via a `role="status"` / `aria-live="polite"`
  container for simpler loading text — either way, the live region must actually be reachable by
  assistive tech; don't wrap it (or a parent) in `aria-hidden="true"` while it's visible.
- Error toasts/alerts need `role="alert"` / `aria-live="assertive"` — reserve this for genuine
  errors only, since it interrupts immediately.
- Announcements should be concise and action-oriented; don't fire repeated/noisy live-region
  updates.
- Live regions must always be present in the DOM — update their text content, not their
  container's visibility/existence.

## Images, icons, and SVG sprites

- Decorative visuals: `alt=""` (images) or `aria-hidden="true"` (inline SVG/sprite icons).
- Meaningful visuals: descriptive `alt` text, or `aria-label` on the containing control if the
  visual itself isn't independently interactive.
- `role="presentation"` / `role="none"` is only valid on elements the ARIA-in-HTML spec allows it
  for (e.g. `<img>`). It is **not** valid on `<video>`, `<audio>`, or most other embedded/replaced
  elements — use `aria-hidden="true"` there instead. Check the permitted-roles table for an
  element type before reusing a decorative technique on it.
