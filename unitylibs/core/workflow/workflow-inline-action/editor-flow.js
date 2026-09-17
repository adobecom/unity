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

export async function editorUploadFlow(binder, file, originalSize = file.size) {
  binder.widgetRef?.setState(InlineActionState.LOADING);
  binder.widgetRef?.setProgress(0);
  const isFirstEditorLoad = !binder.widgetRef.editorEngine;
  const editorReady = binder.widgetRef?.ensureEditorEngine((name, data) => binder.trackEvent(name, data));
  try {
    const ok = await binder.uploadAsset(file, true);
    if (!ok) {
      binder.widgetRef?.setState(InlineActionState.INITIAL);
      return;
    }
    binder.widgetRef?.setProgress(100);
    const engine = await editorReady;
    binder.widgetRef?.setState(InlineActionState.COMPLETE);
    await engine?.setImage(URL.createObjectURL(file), originalSize, true);
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
  const bounds = engine.getSourceBounds();
  const dimensions = isResize ? engine.getResizeOutputDimensions() : null;
  const operations = buildOperations(binder, bounds, dimensions, engine.quality);
  const connectorFields = {
    verb: isResize ? 'resizeImage' : 'cropImage',
    connectorAssetId: binder.assetId,
    fileType: binder.filesData.type,
    operations,
    workflow: 'image-operations',
    includeWidgetType: false,
  };
  if (isResize) {
    if (engine.selectedRatioText) connectorFields.aspectRatio = engine.selectedRatioText;
  } else {
    connectorFields.aspectRatio = engine.selectedRatioText || 'freeform';
  }
  const payload = await binder.buildConnectorPayload(connectorFields);
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
