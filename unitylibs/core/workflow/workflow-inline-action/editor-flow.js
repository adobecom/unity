// Crop/Resize's own upload + CTA-click flow, kept out of action-binder.js entirely so
// rbg users never fetch this code — dynamically imported only from the two call sites
// in action-binder.js that are already editor-only branches (uploadFile, executeActionMaps).

import { getUnityLibs } from '../../../scripts/utils.js';
import { InlineActionState } from '../../widgets/inline-action/inline-action.js';

// Shared by both the imageOperations request (below) and the "Open in Firefly"
// connector payload (runEditInFirefly) — crop sends only a crop operation; resize
// sends crop-then-resize (bounds slice the frame, resize resamples to the target
// output size). Field names already match getSourceBounds()'s own shape
// (top/left/right/bottom) directly. `dimensions` is engine.getResizeOutputDimensions()
// — already converted to whichever unit the user selected in the Custom tab's unit
// dropdown (px/in/cm/mm; always px for Standard/Social, which have no unit picker).
function buildOperations(binder, bounds, dimensions, quality) {
  const operations = [
    { type: 'crop', top: bounds.top, left: bounds.left, bottom: bounds.bottom, right: bounds.right },
  ];
  if (binder.operation === 'resize') {
    operations.push({ type: 'resize', width: dimensions.width, height: dimensions.height, unit: dimensions.unit, quality });
  }
  return operations;
}

// Confirmed contract for POST {apiEndPoint}/providers/imageOperations. outputMediaType
// is fixed to 'image/jpeg' regardless of the user's original upload type.
export function buildImageOperationsPayload(binder, bounds, dimensions, quality) {
  return {
    operations: buildOperations(binder, bounds, dimensions, quality),
    outputMediaType: 'image/jpeg',
    assets: [{ id: binder.assetId }],
  };
}

// Only ever called from action-binder.js's uploadFile(), for guest/anonymous crop and
// resize users (signed-in users skip this entirely — see signedInFlow's
// performOperation param). `binder` is the ActionBinder instance — reuses its shared
// uploadAsset()/error-handling rather than duplicating it, since that part genuinely is
// shared with rbg.
export async function editorUploadFlow(binder, file, originalSize = file.size) {
  binder.widgetRef?.setState(InlineActionState.LOADING);
  binder.widgetRef?.setProgress(0);
  try {
    const ok = await binder.uploadAsset(file, true);
    if (!ok) {
      binder.widgetRef?.setState(InlineActionState.INITIAL);
      return;
    }
    // The editor panel (and its .ia-cta-accent/.ia-editor-reupload) is built lazily
    // inside setEditorImage() the first time only — action-binder.js's one-time
    // action-map scan at page load ran before this DOM existed, so it needs binding
    // here, once, right after it's actually created. Captured before setEditorImage()
    // runs, since that call is what sets widgetRef.editorEngine for the first time.
    const isFirstEditorLoad = !binder.widgetRef.editorEngine;
    binder.widgetRef?.setProgress(100); // matches action-binder.js's PROGRESS.COMPLETE
    binder.widgetRef?.setState(InlineActionState.COMPLETE);
    await binder.widgetRef?.setEditorImage(URL.createObjectURL(file), originalSize);
    if (isFirstEditorLoad) binder.bindActionMapElements(binder.widgetRef.editorEngine.rightPanel);
  } catch (e) {
    if (!e.analyticsTracked) binder.trackServerError('upload', e);
    binder.serviceHandler.showErrorToast(binder.uploadErrorOpts(), e, binder.lanaOptions);
    binder.widgetRef?.setState(InlineActionState.INITIAL);
  }
}

// Only ever called from action-binder.js's executeActionMaps(), for the
// 'runEditorOperation' action (the crop/resize CTA — never wired up for rbg). Performs
// the real crop/resize via imageOperations, then reuses rbg's own
// handleConnector(el, true) for the download-vs-redirect decision — first-time users
// get a local download + redirect, returning users just redirect — since that logic
// doesn't need to differ from rbg's own download button once resultAssetId/resultUrl
// are set. `el` is null: none of handleConnector's isDownload=true branches (verb
// resolution, connector payload) actually read it.
//
// The result also becomes the new "current" state on acom itself — same convention as
// removeBackground's own resultAssetId (subsequent NBA/connector actions there already
// operate on the result, not the original upload). Concretely: the editor's displayed
// image swaps to the cropped/resized output, binder.assetId points at it so any further
// crop/resize or "Open in Firefly" applies to THIS image, and the selection resets to a
// fresh, full-image state (same as a brand new upload) since the old selection's
// percentages don't mean the same thing once the image itself has changed.
export async function runEditorOperation(binder) {
  const engine = binder.widgetRef?.editorEngine;
  if (!engine) return;
  const bounds = engine.getSourceBounds();
  const dimensions = binder.operation === 'resize' ? engine.getResizeOutputDimensions() : null;
  const payload = buildImageOperationsPayload(binder, bounds, dimensions, engine.quality);
  // TEMPORARY: remove before production — lets the payload be checked against the real
  // contract while it's still being verified.
  // eslint-disable-next-line no-console
  console.log(`[inline-action editor] ${binder.operation} imageOperations payload`, payload);
  try {
    // Response shape assumed to match removeBackground's own provider endpoint
    // (assetId/outputUrl) — unconfirmed specifically for imageOperations.
    const res = await binder.serviceHandler.postCallToService(
      binder.apiConfig.endPoint.imageOperations,
      { body: JSON.stringify(payload) },
      binder.uploadErrorOpts(),
    );
    binder.resultAssetId = res.assetId;
    binder.resultUrl = res.outputUrl;
    binder.assetId = res.assetId;
    // outputMediaType is always fixed to 'image/jpeg' (see buildImageOperationsPayload)
    // — the current asset really is a jpeg now, regardless of what was first uploaded,
    // so any later connector call's fileType should say so too.
    binder.filesData.type = 'image/jpeg';
    // originalSize is preserved as-is (not reset to 0) — it still means "the very first
    // upload's size," which is what the resize readout's "Original size" label means.
    await engine.setImage(res.outputUrl, engine.originalSize);
    engine.reset();
  } catch (e) {
    if (!e.analyticsTracked) binder.trackServerError(binder.operation, e);
    binder.serviceHandler.showErrorToast(binder.uploadErrorOpts(), e, binder.lanaOptions);
    return;
  }
  await binder.handleConnector(null, true);
}

// Only ever called from action-binder.js's executeActionMaps(), for the
// 'runEditInFirefly' action (the "Open in Firefly" CTA). Unlike runEditorOperation, no
// imageOperations call happens here — the ORIGINAL uploaded asset is sent as-is, along
// with the user's selected crop/resize parameters, so Firefly applies them on its own
// side. Both go through the same connector mechanism rbg's own download/nba calls use
// (buildConnectorPayload/callConnector), not a separate endpoint, and both share the
// same `operations` array shape imageOperations itself receives — but crop and resize
// are treated as two distinct workflows with slightly different payloads:
//  - crop: CONFIRMED contract — verb 'cropImage', mandatory cropAspectRatioLock
//    ('freeform' when unlocked, else the authored ratio string).
//  - resize: NOT YET CONFIRMED — this is our own proposed shape until the real
//    contract exists. width/height already travel inside `operations` (the resize
//    op), so the only other info worth passing is the aspect ratio lock, and only
//    when one is actually meaningful (a Standard preset) — Social selections carry
//    literal pixel dimensions with no named ratio, and Custom/freeform has nothing to
//    lock to, so the field (aspectRatioLock, kept distinct from crop's
//    cropAspectRatioLock) is omitted entirely rather than defaulted.
export async function runEditInFirefly(binder) {
  const engine = binder.widgetRef?.editorEngine;
  if (!engine) return;
  const isResize = binder.operation === 'resize';
  const bounds = engine.getSourceBounds();
  const dimensions = isResize ? engine.getResizeOutputDimensions() : null;
  const operations = buildOperations(binder, bounds, dimensions, engine.quality);
  const connectorFields = {
    verb: isResize ? 'resizeImage' : 'cropImage',
    connectorAssetId: binder.assetId,
    fileType: binder.filesData.type,
    operations,
  };
  if (isResize) {
    if (engine.selectedRatioText) connectorFields.aspectRatioLock = engine.selectedRatioText;
  } else {
    connectorFields.cropAspectRatioLock = engine.selectedRatioText || 'freeform';
  }
  const payload = await binder.buildConnectorPayload(connectorFields);
  // TEMPORARY: remove before production — lets the payload be checked against the real
  // contract (especially resize's, which is only our own proposal right now) while
  // it's still being verified.
  // eslint-disable-next-line no-console
  console.log(`[inline-action editor] ${binder.operation} EditInFirefly connector payload`, payload);
  try {
    const { default: isDesktop } = await import(`${getUnityLibs()}/utils/device-detection.js`);
    await binder.callConnector(payload, { openInSameTab: !isDesktop(), useSplashProgress: false });
  } catch (e) {
    binder.serviceHandler.showErrorToast(binder.uploadErrorOpts(), e, binder.lanaOptions);
  }
}

export default {
  buildImageOperationsPayload,
  editorUploadFlow,
  runEditorOperation,
  runEditInFirefly,
};
