# Firefly UI widgets (`core/widgets`)

**UnityWidget** (verb/model pickers, generate button, dropdown plumbing) is **inlined** in each variant bundle so the browser loads **one JS + one CSS** per layout (see `workflow.js` `priorityLibFetch`).

- **PromptWidget** (`prompt-widget/prompt-widget.js`) — classic hero prompt bar (`createInpWrap`, prompt suggestions, sound hooks). Exports **UnityWidget** for tests.
- **PromptWithStyleSelectWidget** (`prompt-with-style-select/prompt-with-style-select.js`) — Unity block class **`widget-prompt-with-style`**: parse authoring, mount card UI between hero and block.

`workflow.js` picks **PromptWidget** vs **PromptWithStyleSelectWidget** from the block class list (defaults to prompt-widget when `el` is missing).

**Keep the two `UnityWidget` copies identical** when changing shared behavior. For CSS, edit the shared block at the top of both merged variant files the same way (or extract a snippet and paste into both).

## CSS (mirrors JS)

| Asset | Loaded by | Purpose |
|-------|-----------|---------|
| `prompt-widget/prompt-widget.css` | Workflow `priorityLoad` (classic Firefly prompt) | Shared Firefly primitives + hero / upload / showcase layout. |
| `prompt-with-style-select/prompt-with-style-select.css` | Workflow `priorityLoad` (`widget-prompt-with-style`) | Same shared primitives + `.unity-prompt-with-style-select` layout. |
