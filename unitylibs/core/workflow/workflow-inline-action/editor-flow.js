import { getUnityLibs } from '../../../scripts/utils.js';
import { InlineActionState } from '../../widgets/inline-action/inline-action.js';
import { INLINE_ACTION_EVENTS } from '../../../scripts/analytics.js';

function buildOperations(binder, bounds, dimensions, quality) {
  const operations = [
    { type: 'crop', top: bounds.top, left: bounds.left, bottom: bounds.bottom, right: bounds.right },
  ];
  if (binder.operation === 'resize') {
    operations.push({ type: 'resize', width: dimensions.width, height: dimensions.height, unit: dimensions.unit, quality });
  }
  return operations;
}

export function buildImageOperationsPayload(binder, bounds, dimensions, quality) {
  return {
    operations: buildOperations(binder, bounds, dimensions, quality),
    outputMediaType: 'image/jpeg',
    assets: [{ id: binder.assetId }],
  };
}

// sourceImg is used rather than sharpImg, which may hold the quality-preview JPEG.
async function canvasResize(engine, bounds, width, height) {
  const img = engine.sourceImg;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(
    img,
    bounds.left,
    bounds.top,
    bounds.right - bounds.left,
    bounds.bottom - bounds.top,
    0,
    0,
    width,
    height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      engine.outputType,
      engine.encodeQuality(),
    );
  });
}

// uploadAsset overwrites the original-asset fields, so restore them after uploading a resized result.
async function uploadResizedAsset(binder, file) {
  const { assetId, originalAssetId, originalFileType } = binder;
  const ok = await binder.uploadAsset(file);
  binder.originalAssetId = originalAssetId;
  binder.originalFileType = originalFileType;
  if (!ok) binder.assetId = assetId;
  return ok;
}

// Resize defers the original upload until an asset is actually needed.
function ensureAssetUploaded(binder) {
  if (binder.assetId) return Promise.resolve(true);
  if (!binder.originalUploadPromise) {
    binder.originalUploadPromise = binder.uploadAsset(binder.originalFile)
      .then((ok) => {
        if (!ok) binder.assetId = null;
        return ok;
      })
      .finally(() => { binder.originalUploadPromise = null; });
  }
  return binder.originalUploadPromise;
}

function buildResizeDeeplinkFields(engine, offsets) {
  const pill = engine.selectedPill?.dataset;
  let pillMode = null;
  if (pill?.platform) pillMode = 'social';
  else if (pill?.ratioText) pillMode = 'standard';
  // A preset only applies while its tab is still open; otherwise the frame is freeform.
  const expandCropMode = pillMode && pillMode === engine.resizeTab ? pillMode : 'freeform';
  const { width, height } = engine.getResizeDimensions();
  const fields = {
    intent: 'resize',
    expandCropMode,
    offsetTop: offsets.top,
    offsetLeft: offsets.left,
    offsetRight: offsets.right,
    offsetBottom: offsets.bottom,
    dimensionsLocked: engine.locked,
    outputWidth: Math.round(width),
    outputHeight: Math.round(height),
    dimensionUnit: engine.unit,
  };
  if (expandCropMode === 'standard') fields.cropAspectRatioLock = pill.ratioText;
  if (expandCropMode === 'social') {
    fields.socialApp = pill.platform;
    fields.socialPostType = pill.name;
    if (pill.width && pill.height) {
      fields.outputWidth = Number(pill.width);
      fields.outputHeight = Number(pill.height);
    }
  }
  if (engine.outputType === 'image/jpeg') fields.downloadQuality = Math.round(engine.quality);
  return fields;
}

export async function editorUploadFlow(binder, file, originalSize = file.size) {
  binder.widgetRef?.setState(InlineActionState.LOADING);
  binder.widgetRef?.setProgress(0);
  const isFirstEditorLoad = !binder.widgetRef.editorEngine;
  const editorReady = binder.widgetRef?.ensureEditorEngine((name, data) => binder.trackEvent(name, data));
  const isResize = binder.operation === 'resize';
  try {
    if (isResize) {
      binder.originalFile = file;
      binder.originalFileType = binder.filesData.type;
      binder.widgetRef?.setProgress(100);
    } else {
      const ok = await binder.uploadAsset(file, true);
      if (!ok) {
        binder.widgetRef?.setState(InlineActionState.INITIAL);
        return;
      }
      binder.widgetRef?.setProgress(100);
    }
    const engine = await editorReady;
    if (isResize) engine?.setOutputType(file.type);
    binder.widgetRef?.setState(InlineActionState.COMPLETE);
    await engine?.setImage(URL.createObjectURL(file), originalSize, true);
    engine?.reset();
    if (isFirstEditorLoad) {
      const {
        leftPanel, rightPanel, moreMenu, socialMenu, unitMenu,
      } = binder.widgetRef.editorEngine;
      [leftPanel, rightPanel, moreMenu, socialMenu, unitMenu]
        .filter(Boolean)
        .forEach((panel) => binder.bindActionMapElements(panel));
    }
  } catch (e) {
    if (!e.analyticsTracked) binder.trackServerError('upload', e);
    binder.serviceHandler.showErrorToast(binder.uploadErrorOpts(), e, binder.lanaOptions);
    binder.widgetRef?.setState(InlineActionState.INITIAL);
  }
}

async function performEditorOperation(binder) {
  const engine = binder.widgetRef?.editorEngine;
  if (!engine) return false;
  const bounds = engine.getSourceBounds();
  const dimensions = binder.operation === 'resize' ? engine.getResizeOutputDimensions() : null;

  if (binder.operation === 'resize') {
    try {
      const { width, height } = engine.getResizeDimensions();
      const blob = await canvasResize(engine, bounds, Math.round(width), Math.round(height));
      const ok = await uploadResizedAsset(binder, new File([blob], binder.filesData.name, { type: blob.type }));
      if (!ok) return false;
      binder.resultAssetId = binder.assetId;
      binder.resultBlob = blob;
      binder.resultUrl = URL.createObjectURL(blob);
      binder.filesData.type = blob.type;
      await engine.setImage(binder.resultUrl, engine.originalSize);
      engine.reset();
      return true;
    } catch (e) {
      if (!e.analyticsTracked) binder.trackServerError(binder.operation, e);
      binder.serviceHandler.showErrorToast(binder.uploadErrorOpts(), e, binder.lanaOptions);
      return false;
    }
  }

  const payload = buildImageOperationsPayload(binder, bounds, dimensions, engine.quality);
  try {
    const res = await binder.serviceHandler.postCallToService(
      binder.apiConfig.endPoint.imageOperations,
      { body: JSON.stringify(payload) },
      binder.uploadErrorOpts(),
    );
    binder.resultAssetId = res.assetId;
    binder.resultUrl = res.outputUrl;
    binder.assetId = res.assetId;
    binder.filesData.type = 'image/jpeg';
    await engine.setImage(res.outputUrl, engine.originalSize);
    engine.reset();
    return true;
  } catch (e) {
    if (!e.analyticsTracked) binder.trackServerError(binder.operation, e);
    binder.serviceHandler.showErrorToast(binder.uploadErrorOpts(), e, binder.lanaOptions);
    return false;
  }
}

export async function runEditorOperation(binder, el) {
  const engine = binder.widgetRef?.editorEngine;
  if (!engine) return;
  engine.setBusy(true, el);
  try {
    const ok = await performEditorOperation(binder);
    if (!ok) return;
    if (el?.dataset?.nba) {
      const label = el.textContent?.trim() || el.dataset.nba;
      binder.trackEvent(INLINE_ACTION_EVENTS.nbaClick(label), {
        assetId: binder.resultAssetId,
        action: 'redirect',
        verb: el.dataset.nba,
      });
      await binder.handleConnector(el);
    } else {
      binder.trackEvent(INLINE_ACTION_EVENTS.DOWNLOAD, { assetId: binder.resultAssetId, action: 'redirect' });
      await binder.handleConnector(null, true);
    }
  } finally {
    engine.setBusy(false, el);
  }
}

export async function resetEditor(binder) {
  const engine = binder.widgetRef?.editorEngine;
  if (!engine) return;
  binder.trackEvent(INLINE_ACTION_EVENTS.RESET);
  binder.assetId = binder.originalAssetId;
  if (binder.originalFileType) binder.filesData.type = binder.originalFileType;
  await engine.setImage(engine.originalImageUrl, engine.originalSize);
  engine.reset();
}

export async function runEditInFirefly(binder, el) {
  const engine = binder.widgetRef?.editorEngine;
  if (!engine) return;
  binder.trackEvent(`${el?.textContent?.trim() || 'Open in Firefly'}|UnityWidget`, {
    assetId: binder.resultAssetId,
    action: 'redirect',
  });
  const isResize = binder.operation === 'resize';

  if (isResize) {
    engine.setBusy(true, el);
    try {
      if (!(await ensureAssetUploaded(binder))) return;
    } finally {
      engine.setBusy(false, el);
    }
  }

  const bounds = engine.getSourceBounds();
  const fireflyBounds = {
    left: bounds.left,
    top: bounds.top,
    right: engine.naturalW - bounds.right,
    bottom: engine.naturalH - bounds.bottom,
  };
  const connectorFields = {
    verb: isResize ? 'resizeImage' : 'cropImage',
    connectorAssetId: binder.assetId,
    fileType: binder.filesData.type,
    workflow: 'image-operations',
    includeWidgetType: false,
  };
  if (!isResize) {
    connectorFields.operations = buildOperations(binder, fireflyBounds, null, engine.quality);
    connectorFields.aspectRatio = engine.selectedRatioText || 'freeform';
  }
  const payload = await binder.buildConnectorPayload(connectorFields);
  if (isResize) Object.assign(payload.payload, buildResizeDeeplinkFields(engine, fireflyBounds));
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
  resetEditor,
  runEditInFirefly,
};
