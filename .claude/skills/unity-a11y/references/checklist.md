# Component Accessibility Checklist

Run through this checklist during every audit, fix, and add-a11y task. Unitylibs has no
component-library boundary to scope around — every `createTag`-built element is local code, so
check all of it.

---

## Ownership and scope

- [ ] Confirmed whether the element's event wiring lives in the file being edited or in a
      sibling binder/workflow file — trace before concluding something is missing
- [ ] Flagged (not silently fixed) any real issue whose root cause is outside the requested file scope

---

## Semantics

- [ ] Element choice is correct for the interaction (button vs link vs input vs div)
- [ ] Native HTML is preferred before adding ARIA
- [ ] Heading levels are meaningful and not skipped
- [ ] Landmark elements (`main`, `nav`, `aside`, etc.) are used where appropriate

---

## Accessible name

- [ ] Every interactive control has an accessible name
- [ ] Icon-only controls have `aria-label` or visually hidden text
- [ ] Controls referencing visible text use `aria-labelledby` where appropriate
- [ ] Accessible name accurately describes the action or destination (not just "click here")

---

## State and relationships

- [ ] `aria-describedby` ids are valid and the referenced elements exist in the DOM
- [ ] Error messages are connected to invalid fields via `aria-describedby`
- [ ] `aria-invalid="true"` is set only when validation has actually failed
- [ ] `aria-expanded`, `aria-selected`, `aria-pressed`, `aria-current`, `aria-busy` are used only when the UI truly exposes those states
- [ ] Decorative icons have `aria-hidden="true"`

---

## Keyboard and focus

- [ ] All interactions can be completed with keyboard only
- [ ] Focus indicator is visible and has sufficient contrast
- [ ] Tab order follows logical reading order
- [ ] No positive `tabindex` values
- [ ] Dialogs, menus, and popovers move focus correctly on open
- [ ] Focus is restored to the trigger after dismissing temporary UI
- [ ] No focus trap (except intentional modal dialogs)

---

## Forms

- [ ] Every field has a programmatically associated label
- [ ] Required fields are marked (`aria-required="true"` or `required`)
- [ ] Errors are specific, visible, and connected to the field
- [ ] Related controls are grouped with `<fieldset>` + `<legend>` when needed
- [ ] Placeholder text is not the only label

---

## Visual checks

- [ ] Normal text contrast ≥ 4.5:1; large text ≥ 3:1
- [ ] UI component boundaries (input border, checkbox, button outline) contrast ≥ 3:1
- [ ] Focus indicators contrast ≥ 3:1 against adjacent colors
- [ ] Information is not conveyed by color alone
- [ ] UI is functional at 200% browser zoom

---

## Dynamic updates

- [ ] Async updates use `aria-live="polite"` (or `role="status"`)
- [ ] Error interrupts use `aria-live="assertive"` (or `role="alert"`) sparingly
- [ ] Loading states expose `aria-busy` when appropriate
- [ ] Live regions are always present in the DOM — text content is updated, not the container visibility

---

## Pattern conformance

- [ ] Widget matches a known pattern in [pattern-guide.md](pattern-guide.md)
- [ ] Simplest correct pattern chosen (no over-engineering toward complex widget when a native element suffices)
- [ ] Anti-patterns avoided: clickable div without full keyboard impl, placeholder-as-label, outline removal without replacement, ARIA to fix wrong element choice

---

## WCAG 2.1 AA — Component-Level Criteria

Ordered by frequency of violation.

| Criterion | Rule | Common violation |
|---|---|---|
| **4.1.2** | UI components expose name, role, value | `<div>` used as button/checkbox with no ARIA |
| **1.1.1** | Non-text content has text alternative | `<img>` missing `alt`; icon button missing label |
| **2.1.1** | All functionality operable via keyboard | Click-only handlers; no `onKeyDown`/`keyup` |
| **2.4.7** | Focus is always visible | `outline: none` with no replacement style |
| **1.4.3** | Text contrast ≥ 4.5:1 (normal), ≥ 3:1 (large) | Low-contrast secondary text or placeholder |
| **1.4.11** | UI component contrast ≥ 3:1 | Input border, checkbox border invisible on background |
| **3.3.1** | Errors identified in text, not color alone | Red border only; no error message text |
| **3.3.2** | Labels or instructions for inputs | Input with no `<label>` and no `aria-label` |
| **1.3.1** | Info and relationships via structure | Heading hierarchy skipped; table with no `<th>` |
| **2.4.3** | Focus order logical | `tabindex` breaks natural DOM order |
| **4.1.3** | Status messages programmatically determined | Toast/alert injected with no `role="status"` |
| **2.4.4** | Link/button purpose clear from label | "Read more" with no context; icon-only button |
| **1.4.1** | Color not the only visual means | Required-field asterisk color only |
| **1.3.5** | Identify input purpose | Personal data inputs missing `autocomplete` |

Full spec: [WCAG 2.1](https://www.w3.org/TR/WCAG21/)
