# Firefly UI widgets (`core/widgets`)

`workflow-firefly/widget.js` (**UnityWidget**) holds **shared** logic (model picker, generate button, dropdown helpers).

- **PromptWidget** (`prompt-widget/prompt-widget.js`) extends it for the classic hero prompt bar (verbs, prompt suggestions, `createInpWrap`, etc.).
- **PromptWithStyleSelectWidget** (`prompt-with-style-select/prompt-with-style-select.js`) **does not import** `UnityWidget`; it inlines the same verb/model/Generate helpers when `targetCfg.promptWithStyleSelect` (parse Unity block, mount UI between hero and Unity block). Workflow `priorityLoad` skips `widget.css` / `widget.js` for `.widget-prompt-with-style`.

`workflow.js` picks the class: **PromptWidget** (Firefly + hero marquee), **PromptWithStyleSelectWidget** (Firefly + `promptWithStyleSelect`), or the workflow’s default `widget.js` export.

**`UnityWidget.initWidget()`** delegates to **`initPromptWidget`** (marquee path; used by the base class when a workflow still instantiates **UnityWidget** directly).

Add new layouts by exporting a **Widget subclass** and branching in `workflow.js` (or a future registry), reusing methods on **UnityWidget** without duplicating API calls.

## CSS layout (mirrors JS)

| Asset | Loaded by | Purpose |
|-------|-----------|---------|
| `workflow-firefly/widget.css` | Workflow `priorityLoad` (Firefly blocks that are not `.widget-prompt-with-style`) | Shared Firefly prompt bar primitives: dropdowns, sound UI, verb/model menus, autocomplete (no hero-marquee layout). |
| `widgets/prompt-widget/prompt-widget.css` | `loadStyle` inside **`initPromptWidget`** | Hero / upload / showcase marquee layout, sticky bar, responsive rules for that embed. |
| `widgets/prompt-with-style-select/prompt-with-style-select.css` | `loadStyle` inside **`mountPromptWithStyleSelectUI`** | Card UI + `.unity-prompt-with-style-select`–scoped widget primitives. |
