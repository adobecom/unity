# Firefly UI widgets (`core/widgets`)

`workflow-firefly/widget.js` (**UnityWidget**) holds **shared** logic (model picker, generate button, dropdown helpers). **PromptWidget** (`prompt-widget/prompt-widget.js`) extends it for the classic hero prompt bar (verbs, prompt suggestions, `createInpWrap`, etc.).

**`UnityWidget.initWidget()`** only **dispatches** to one of:

| Module | When | Role |
|--------|------|------|
| `prompt-with-style-select/prompt-with-style-select.js` → **`initPromptWithStyleSelectWidget`** | `targetCfg.mountInUnityBlock` | Parse Unity block (style thumbnails + previews), mount UI between hero and Unity block. |
| `prompt-widget/prompt-widget.js` → **`initPromptWidget`** | Default | Classic prompt bar inside the hero / marquee `.copy` region. |

Add new layouts by exporting an `init*(widget)` function and branching in `UnityWidget.initWidget()` (or future registry), reusing methods on **UnityWidget** without duplicating API calls.

## CSS layout (mirrors JS)

| Asset | Loaded by | Purpose |
|-------|-----------|---------|
| `workflow-firefly/widget.css` | Workflow `priorityLoad` (all Firefly inits) | Shared Firefly prompt bar primitives: dropdowns, sound UI, verb/model menus, autocomplete (no hero-marquee layout). |
| `widgets/prompt-widget/prompt-widget.css` | `loadStyle` inside **`initPromptWidget`** | Hero / upload / showcase marquee layout, sticky bar, responsive rules for that embed. |
| `widgets/prompt-with-style-select/prompt-with-style-select.css` | `loadStyle` inside **`mountPromptWithStyleSelectUI`** | Card UI + `.unity-prompt-with-style-select`–scoped widget primitives. |
