# prompt-upload widget (Citation Generator) — POC, Option B (inlined)

This branch (`citation-ui-b`) is the **LCP control**: the widget is a single
`prompt-upload.js` bundle with every primitive (dropzone, prompt input, dropdown,
shell) and the citation mock inlined — there is **no `core/widgets/shared/` layer**.
`priorityLibFetch` for `workflow-prompt-upload` stays at baseline (sprite + widget
js/css only). Compare against `citation-ui-a` (shared primitives).

## Requirements covered
1. Multi-file upload → straight to the transition screen (dropzone actionMap = `upload`).
2. Type a keyword + Search → dropdown of matching citations (mock data for POC).
3. Search CTA disabled until the user types.

## Placeholder authoring (hard-coded POC)
Marquee block + a `unity` metadata block carrying:
`workflow-prompt-upload product-acrobat feature-citation-generator widget-prompt-upload`.
Authored icon rows (`icon-dropzone-label`, `icon-placeholder-prompt`, `icon-generate`,
`icon-legal-terms`, …) are optional — all have hard-coded fallbacks. Limits / allowed
types / splash live in `workflow-prompt-upload/target-config.json`.

## Measure LCP
Load an authored stage page with `?unitylibs=citation-ui-b` vs `citation-ui-a`;
compare LCP, request count and bytes in Lighthouse/WebPageTest.
