# prompt-upload widget (Citation Generator) — POC

First Acrobat Study Spaces widget. Renders a multi-file dropzone + search field with a
keyword→citation results dropdown. Two POC variants exist for an LCP comparison:

- **Option A (this branch, `citation-ui-a`)** — composes the shared primitives in
  [`core/widgets/shared/`](../shared/). Critical primitives are preloaded; `dropdown.js`
  and `citation-mock.js` are lazy-imported on first Search (after LCP).
- **Option B (`citation-ui-b`)** — the same widget with every primitive inlined into a
  single `prompt-upload.js` bundle (no shared imports).

## Requirements covered
1. Multi-file upload → straight to the transition screen (dropzone actionMap = `upload`).
2. Type a keyword + Search → dropdown of matching citations (mock data for POC).
3. Search CTA disabled until the user types.

## Placeholder authoring (hard-coded POC)
Author a marquee block followed by a `unity` metadata block. The unity block carries the
workflow/product/feature/widget classes:

```
Section
├── prompt-upload-marquee            (block; contains .foreground > .prompt-upload-container)
└── unity                            (metadata block)
    classes: workflow-prompt-upload product-acrobat feature-citation-generator widget-prompt-upload
```

Optional authored rows the widget reads (all have hard-coded fallbacks, so they are optional
for the POC):

| icon row | purpose | fallback |
|---|---|---|
| `icon-dropzone-label` | dropzone heading | "Upload source files" |
| `icon-dropzone-hint`  | file-type hint    | (none) |
| `icon-placeholder-prompt` / `icon-label-prompt` | search placeholder/label | "Search by URL, title, ISBN, DOI, or keywords" |
| `icon-generate` | Search CTA label | "Search" |
| `icon-legal-terms` | legal footer | (none) |

Limits / allowed file types / splash screen are hard-coded in
[`workflow-prompt-upload/target-config.json`](../../workflow/workflow-prompt-upload/target-config.json).

## Verify / measure LCP
Deploy the branch and load an authored stage page with `?unitylibs=citation-ui-a`
(vs `citation-ui-b`). Compare LCP, request count and bytes in Lighthouse/WebPageTest.
