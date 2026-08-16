// Crop/Resize's own upload + CTA-click flow, kept out of action-binder.js entirely so
// rbg users never fetch this code — dynamically imported only from the two call sites
// in action-binder.js that are already editor-only branches (uploadFile, executeActionMaps).

import { InlineActionState } from '../../widgets/inline-action/inline-action.js';

// buildCropPayload() is real and reusable as-is once a real Unity wrapper endpoint
// exists to actually send it to. No network call yet.
export function buildCropPayload(bounds, sourceUrl) {
  return {
    image: { source: { url: sourceUrl } },
    edits: { document: { crop: { bounds, hide: false } } },
  };
}

// Resize = crop-then-resample: bounds slice the frame, resize.width/height resamples
// it to the target output size. constrainProportions/resample/scaleStyles are fixed
// per the earlier payload discussion — pending confirmation, not user-facing yet.
export function buildResizePayload(bounds, dimensions, sourceUrl) {
  return {
    image: { source: { url: sourceUrl } },
    edits: {
      document: {
        crop: { bounds, hide: false },
        resize: {
          width: { unit: 'pixels_unit', value: dimensions.width },
          height: { unit: 'pixels_unit', value: dimensions.height },
          constrainProportions: true,
          resample: 'bicubic_sharper',
          scaleStyles: true,
        },
      },
    },
  };
}

// Only ever called from action-binder.js's uploadFile(), for operation !== 'removeBackground'.
// `binder` is the ActionBinder instance — reuses its shared uploadAsset()/error-handling
// rather than duplicating it, since that part genuinely is shared with rbg.
export async function editorUploadFlow(binder, file, originalSize = file.size) {
  binder.widgetRef?.setState(InlineActionState.LOADING);
  binder.widgetRef?.setProgress(0);
  try {
    const ok = await binder.uploadAsset(file, true);
    if (!ok) {
      binder.widgetRef?.setState(InlineActionState.INITIAL);
      return;
    }
    binder.widgetRef?.setProgress(100); // matches action-binder.js's PROGRESS.COMPLETE
    binder.widgetRef?.setState(InlineActionState.COMPLETE);
    await binder.widgetRef?.setEditorImage(URL.createObjectURL(file), originalSize);
  } catch (e) {
    if (!e.analyticsTracked) binder.trackServerError('upload', e);
    binder.serviceHandler.showErrorToast(binder.uploadErrorOpts(), e, binder.lanaOptions);
    binder.widgetRef?.setState(InlineActionState.INITIAL);
  }
}

// Only ever called from action-binder.js's executeActionMaps(), for the
// 'runEditorOperation' action (the crop/resize CTA — never wired up for rbg).
export async function runEditorOperation(binder) {
  const engine = binder.widgetRef?.editorEngine;
  if (!engine) return;
  const bounds = engine.getSourceBounds();
  const payload = binder.operation === 'resize'
    ? buildResizePayload(bounds, engine.getResizeDimensions(), binder.assetHref)
    : buildCropPayload(bounds, binder.assetHref);
  // eslint-disable-next-line no-console
  console.log(`[inline-action editor] ${binder.operation} payload`, payload);
}

export default { buildCropPayload, buildResizePayload, editorUploadFlow, runEditorOperation };
