import { createTag, loadStyle, getUnityLibs, getUnityPromptConfigsBaseUrl } from '../../../scripts/utils.js';

const svgUse = (id, className = '') => `<svg aria-hidden="true"${className ? ` class="${className}"` : ''}><use xlink:href="#${id}"></use></svg>`;
const MORE_TRIGGER_ICON = 'icon-aspect-ratio';
const MIN_PCT = 10;
const IDLE_MS = 3000;
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_EDGES = {
  nw: ['left', 'top'],
  n: ['top'],
  ne: ['right', 'top'],
  e: ['right'],
  se: ['right', 'bottom'],
  s: ['bottom'],
  sw: ['left', 'bottom'],
  w: ['left'],
};
const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
export const zoomScale = (zoom) => 1 + ((zoom / 100) * 9);
const scaleAroundCenter = (px, size, factor) => (size / 2) + ((px - (size / 2)) * factor);

async function loadAspectRatios(operation) {
  try {
    const url = `${getUnityPromptConfigsBaseUrl()}/unity/configs/prompt/cropandresize.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch aspect ratios: ${res.status}`);
    const { content } = await res.json();
    const rows = content?.data;
    return Array.isArray(rows) ? rows.filter((row) => row.module === operation) : [];
  } catch (e) {
    window.lana?.log(`Message: Error loading aspect ratios, Error: ${e}`);
    return [];
  }
}

function parseRatioString(ratio) {
  const [w, h] = ratio.split(':').map(Number);
  return h ? w / h : null;
}

function aspectRatioValue(row) {
  if (row.ratio) return parseRatioString(row.ratio);
  if (row.width && row.height) return row.width / row.height;
  return null;
}

function composeAspectLabel(row) {
  const name = row.name || row.group || '';
  if (row.width && row.height) return `${name} ${row.width} x ${row.height}`.trim();
  if (row.ratio) return `${name} ${row.ratio}`.trim();
  return name;
}

function groupCropRows(rows) {
  return {
    pillRows: rows.filter((r) => !r.group),
    moreRows: rows.filter((r) => r.group),
  };
}

function resizeRowKind(row) {
  if (row.platform) return 'social';
  if (row.ratio) return 'standard';
  return 'custom';
}

function groupResizeRows(rows) {
  const buckets = [];
  const byGroup = new Map();
  rows.forEach((row) => {
    if (!byGroup.has(row.group)) {
      const bucket = { group: row.group, kind: resizeRowKind(row), rows: [] };
      byGroup.set(row.group, bucket);
      buckets.push(bucket);
    }
    byGroup.get(row.group).rows.push(row);
  });
  return buckets;
}

const UNIT_OPTIONS = ['px', 'in', 'cm', 'mm'];
const DPI = 300;
const PX_PER_UNIT = { px: 1, in: DPI, cm: DPI / 2.54, mm: DPI / 25.4 };
const unitToPx = (value, unit) => value * PX_PER_UNIT[unit];
const pxToUnit = (px, unit) => {
  const value = px / PX_PER_UNIT[unit];
  return unit === 'px' ? Math.round(value) : Math.round(value * 100) / 100;
};

export function containBox(naturalW, naturalH, viewportW, viewportH) {
  const cs = Math.min(viewportW / naturalW, viewportH / naturalH);
  return { cs, w: naturalW * cs, h: naturalH * cs };
}

export function centeredRect(ratio, naturalW, naturalH, viewportW, viewportH) {
  const effectiveRatio = ratio || (naturalW / naturalH);
  const { w: boxW, h: boxH } = containBox(naturalW, naturalH, viewportW, viewportH);
  let fitW = boxW;
  let fitH = boxW / effectiveRatio;
  if (fitH > boxH) {
    fitH = boxH;
    fitW = boxH * effectiveRatio;
  }
  const offsetX = (viewportW - boxW) / 2;
  const offsetY = (viewportH - boxH) / 2;
  const x = offsetX + ((boxW - fitW) / 2);
  const y = offsetY + ((boxH - fitH) / 2);
  return {
    x: (x / viewportW) * 100,
    y: (y / viewportH) * 100,
    w: (fitW / viewportW) * 100,
    h: (fitH / viewportH) * 100,
  };
}

export function frameFromDimensions(width, height, naturalW, naturalH, viewportW, viewportH, anchorRect = null) {
  const { cs } = containBox(naturalW, naturalH, viewportW, viewportH);
  const iw = (naturalW * cs) / viewportW;
  const ih = (naturalH * cs) / viewportH;
  const wPct = clamp((width / naturalW) * iw * 100, MIN_PCT, 100);
  const hPct = clamp((height / naturalH) * ih * 100, MIN_PCT, 100);
  const centerX = anchorRect ? anchorRect.x + (anchorRect.w / 2) : 50;
  const centerY = anchorRect ? anchorRect.y + (anchorRect.h / 2) : 50;
  return {
    x: clamp(centerX - (wPct / 2), 0, 100 - wPct),
    y: clamp(centerY - (hPct / 2), 0, 100 - hPct),
    w: wPct,
    h: hPct,
  };
}

function edgeDelta(movesNeg, movesPos, delta) {
  if (movesNeg) return -delta;
  if (movesPos) return delta;
  return 0;
}

export function imageBoundsPct(naturalW, naturalH, viewportW, viewportH, zoom = 0) {
  const { w: dispW, h: dispH } = containBox(naturalW, naturalH, viewportW, viewportH);
  const offsetX = (viewportW - dispW) / 2;
  const offsetY = (viewportH - dispH) / 2;
  const scale = zoomScale(zoom);
  const leftPx = scaleAroundCenter(offsetX, viewportW, scale);
  const topPx = scaleAroundCenter(offsetY, viewportH, scale);
  const rightPx = scaleAroundCenter(offsetX + dispW, viewportW, scale);
  const bottomPx = scaleAroundCenter(offsetY + dispH, viewportH, scale);
  return {
    left: clamp((leftPx / viewportW) * 100, 0, 100),
    top: clamp((topPx / viewportH) * 100, 0, 100),
    right: clamp((rightPx / viewportW) * 100, 0, 100),
    bottom: clamp((bottomPx / viewportH) * 100, 0, 100),
  };
}

export function resizeRect(base, handle, dxPct, dyPct, ratioLock, bounds = { left: 0, top: 0, right: 100, bottom: 100 }) {
  const edges = HANDLE_EDGES[handle] || [];
  const movesLeft = edges.includes('left');
  const movesRight = edges.includes('right');
  const movesTop = edges.includes('top');
  const movesBottom = edges.includes('bottom');
  const anchorX = movesLeft ? base.x + base.w : base.x;
  const anchorY = movesTop ? base.y + base.h : base.y;
  let newW = Math.max(base.w + edgeDelta(movesLeft, movesRight, dxPct), MIN_PCT);
  let newH = Math.max(base.h + edgeDelta(movesTop, movesBottom, dyPct), MIN_PCT);
  if (ratioLock) {
    if (movesLeft || movesRight) newH = newW / ratioLock;
    else if (movesTop || movesBottom) newW = newH * ratioLock;
  }
  const maxW = movesLeft ? anchorX - bounds.left : bounds.right - anchorX;
  const maxH = movesTop ? anchorY - bounds.top : bounds.bottom - anchorY;
  if (newW > maxW || newH > maxH) {
    if (ratioLock) {
      const scale = Math.min(maxW / newW, maxH / newH);
      newW *= scale;
      newH *= scale;
    } else {
      newW = Math.min(newW, maxW);
      newH = Math.min(newH, maxH);
    }
  }
  newW = Math.max(newW, MIN_PCT);
  newH = Math.max(newH, MIN_PCT);
  const left = movesLeft ? anchorX - newW : anchorX;
  const top = movesTop ? anchorY - newH : anchorY;
  return {
    x: clamp(left, bounds.left, bounds.right - newW),
    y: clamp(top, bounds.top, bounds.bottom - newH),
    w: newW,
    h: newH,
  };
}

export function rectPctToSourceBounds(rect, naturalW, naturalH, viewportW, viewportH, zoom = 0) {
  const { cs, w: dispW, h: dispH } = containBox(naturalW, naturalH, viewportW, viewportH);
  const offsetX = (viewportW - dispW) / 2;
  const offsetY = (viewportH - dispH) / 2;
  const scale = zoomScale(zoom);
  const unscale = (px, size) => scaleAroundCenter(px, size, 1 / scale);
  const leftPx = unscale((rect.x / 100) * viewportW, viewportW);
  const topPx = unscale((rect.y / 100) * viewportH, viewportH);
  const rightPx = unscale(((rect.x + rect.w) / 100) * viewportW, viewportW);
  const bottomPx = unscale(((rect.y + rect.h) / 100) * viewportH, viewportH);
  const left = clamp(Math.round((leftPx - offsetX) / cs), 0, naturalW);
  const top = clamp(Math.round((topPx - offsetY) / cs), 0, naturalH);
  const right = clamp(Math.round((rightPx - offsetX) / cs), left, naturalW);
  const bottom = clamp(Math.round((bottomPx - offsetY) / cs), top, naturalH);
  return { left, top, right, bottom };
}

function buildFrame() {
  const frame = createTag('div', { class: 'ia-frame' });
  ['v1', 'v2', 'h1', 'h2'].forEach((k) => frame.append(createTag('div', { class: `ia-grid ia-grid--${k}` })));
  HANDLES.forEach((h) => frame.append(createTag('div', {
    class: `ia-handle ia-handle--${h}`,
    'data-handle': h,
    role: 'presentation',
  })));
  return frame;
}

const KNOWN_SLIDER_MODES = new Set(['zoom', 'quality']);

function buildToggleButton(mode, label, iconHref, isActive) {
  const btn = createTag('button', {
    type: 'button',
    class: `ia-toggle__btn${isActive ? ' is-active' : ''}`,
    'data-mode': mode,
    'aria-label': label,
  });
  if (iconHref) btn.append(createTag('img', { src: iconHref, alt: '', loading: 'lazy', class: 'ia-btn-icon' }));
  btn.append(createTag('span', { class: 'ia-toggle-label' }, label));
  return btn;
}

function buildAdjustBar(parsedData) {
  const bar = createTag('div', { class: 'ia-adjust-bar' });
  const toggle = createTag('div', { class: 'ia-toggle' });
  const { sliderModes } = parsedData;
  sliderModes.forEach(({ mode, label, iconHref }, i) => toggle.append(buildToggleButton(mode, label, iconHref, i === 0)));
  const startMode = sliderModes[0]?.mode;
  const slider = createTag('input', {
    type: 'range',
    class: 'ia-slider',
    autocomplete: 'off',
    min: '0',
    max: '100',
    value: startMode === 'quality' ? '100' : '0',
  });
  const val = createTag('span', { class: 'ia-val' }, startMode === 'quality' ? '100%' : '1.0x');
  bar.append(toggle, slider, val);
  return bar;
}

function buildProcessingOverlay() {
  const overlay = createTag('div', { class: 'ia-processing-overlay' });
  overlay.append(
    createTag('div', { class: 'ia-processing-gradient' }),
    createTag('div', { class: 'ia-processing-mask' }),
    createTag('div', { class: 'ia-processing-dots' }),
  );
  return overlay;
}

export function buildEditorLeftPanel(parsedData) {
  const leftPanel = createTag('div', { class: 'ia-editor-left-panel' });
  const viewport = createTag('div', { class: 'ia-viewport' });
  const blurImg = createTag('img', { class: 'ia-img', alt: '', draggable: 'false' });
  const sharpImg = createTag('img', { class: 'ia-img', alt: '', draggable: 'false' });
  const frameClip = createTag('div', { class: 'ia-frame-clip' });
  frameClip.append(buildFrame());
  viewport.append(
    createTag('div', { class: 'ia-imglayer ia-imglayer--blur' }, createTag('div', { class: 'ia-imgbox' }, blurImg)),
    createTag('div', { class: 'ia-imglayer ia-imglayer--sharp' }, createTag('div', { class: 'ia-imgbox' }, sharpImg)),
    frameClip,
  );
  leftPanel.append(viewport);
  if (parsedData.sliderModes.length) leftPanel.append(buildAdjustBar(parsedData));
  leftPanel.append(buildProcessingOverlay());
  return leftPanel;
}

function buildIconButton(tag, attrs, iconHref, label) {
  const el = createTag(tag, attrs);
  if (iconHref) el.append(createTag('img', { src: iconHref, alt: '', loading: 'lazy', class: 'ia-btn-icon' }));
  el.append(createTag('span', {}, label));
  return el;
}

function toggleTriggerSpinner(btn, isBusy) {
  if (!btn) return;
  const icon = btn.querySelector('.ia-btn-icon');
  if (isBusy) {
    btn.classList.add('is-loading');
    if (icon) icon.style.display = 'none';
    if (!btn.querySelector('.ia-btn-spinner')) {
      btn.prepend(createTag('span', { class: 'ia-btn-spinner', 'aria-hidden': 'true' }));
    }
  } else {
    btn.classList.remove('is-loading');
    if (icon) icon.style.display = '';
    btn.querySelector('.ia-btn-spinner')?.remove();
  }
}

function buildDropdownCloseButton() {
  return createTag('button', { type: 'button', class: 'ia-dropdown-close', 'aria-label': 'Close' });
}

function buildAspectPill(row, isActive = false) {
  const label = composeAspectLabel(row);
  const attrs = {
    type: 'button',
    class: `ia-aspect-pill${isActive ? ' is-active' : ''}`,
    'data-ratio': aspectRatioValue(row) ?? '',
    'data-label': label,
  };
  if (row.ratio) attrs['data-ratio-text'] = row.ratio;
  if (row.width && row.height) {
    attrs['data-width'] = row.width;
    attrs['data-height'] = row.height;
  }
  return buildIconButton('button', attrs, row.icon, label);
}

function buildCtaRow(isCrop, parsedData) {
  const row = createTag('div', { class: 'ia-cta-row' });
  const downloadLabel = parsedData.downloadLabel || (isCrop ? 'Crop and download' : 'Resize and download');
  const editLabel = parsedData.editLabel || 'Open in Firefly';
  row.append(
    buildIconButton('button', { type: 'button', class: 'ia-cta-accent ia-editor-download' }, parsedData.downloadIconHref, downloadLabel),
    buildIconButton('button', { type: 'button', class: 'ia-cta-outline ia-editor-open-in-firefly' }, parsedData.editIconHref, editLabel),
  );
  return row;
}

function buildCropAspectSection(parsedData) {
  const section = createTag('div', { class: 'ia-aspect-section' });
  section.append(createTag('p', { class: 'ia-aspect-heading' }, parsedData.aspectRatioLabel || 'Aspect ratio'));
  const row = createTag('div', { class: 'ia-aspect-row ia-aspect-row--scroll' });
  const { pillRows, moreRows } = groupCropRows(parsedData.aspectRows || []);
  pillRows.forEach((r, i) => row.append(buildAspectPill(r, i === 0)));
  if (moreRows.length) {
    const more = createTag('div', { class: 'ia-more' });
    const moreMenu = createTag('div', { class: 'ia-more-menu hide' });
    moreRows.forEach((r) => {
      const label = composeAspectLabel(r);
      const ratioVal = aspectRatioValue(r);
      const opensFirefly = ratioVal === null;
      moreMenu.append(buildIconButton('button', {
        type: 'button',
        class: `ia-more-opt${opensFirefly ? ' ia-editor-open-in-firefly' : ''}`,
        'data-ratio': ratioVal ?? '',
        'data-label': label,

        ...(r.icon && { 'data-icon': r.icon }),
        ...(r.ratio && { 'data-ratio-text': r.ratio }),
      }, r.icon, label));
    });
    moreMenu.append(buildDropdownCloseButton());
    const moreTrigger = buildIconButton('button', {
      type: 'button',
      class: 'ia-aspect-pill ia-more-trigger',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
    }, undefined, moreRows[0].group);
    moreTrigger.insertAdjacentHTML('afterbegin', svgUse(MORE_TRIGGER_ICON, 'ia-btn-icon'));
    more.append(moreTrigger, moreMenu);
    row.append(more);
  }
  const rowViewport = createTag('div', { class: 'ia-aspect-row-viewport' });
  rowViewport.append(row);
  section.append(rowViewport, buildCtaRow(true, parsedData));
  return section;
}

function buildDimensionField(labelText, className) {
  const field = createTag('div', { class: 'ia-dim-field' });
  field.append(
    createTag('label', { class: 'ia-dim-label' }, labelText),
    createTag('input', { type: 'number', class: className, min: '0', step: 'any', inputmode: 'decimal' }),
  );
  return field;
}

function buildUnitPicker() {
  const wrap = createTag('div', { class: 'ia-more' });
  const menu = createTag('div', { class: 'ia-unit-menu hide' });
  UNIT_OPTIONS.forEach((unit) => {
    menu.append(createTag('button', { type: 'button', class: 'ia-unit-opt', 'data-unit': unit }, unit));
  });
  menu.append(buildDropdownCloseButton());
  const trigger = createTag('button', {
    type: 'button',
    class: 'ia-dim-unit ia-unit-trigger',
    'data-unit': 'px',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
  });
  trigger.append(
    createTag('span', { class: 'ia-unit-label' }, 'px'),
    createTag('span', { class: 'ia-unit-chevron', 'aria-hidden': 'true' }),
  );
  wrap.append(trigger, menu);
  return wrap;
}

function buildCustomDetail(parsedData) {
  const detail = createTag('div', { class: 'ia-resize-detail-panel', 'data-tab': 'custom' });
  const fields = createTag('div', { class: 'ia-dim-fields' });
  fields.append(
    buildDimensionField(parsedData.widthLabel || 'Width', 'ia-width-input'),
    createTag('button', { type: 'button', class: 'ia-dim-lock is-active', 'aria-label': 'Lock aspect ratio', 'aria-pressed': 'true' }, '🔒'),
    buildDimensionField(parsedData.heightLabel || 'Height', 'ia-height-input'),
    buildUnitPicker(),
  );
  detail.append(fields);
  return detail;
}

function buildStandardDetail(standardRows) {
  const detail = createTag('div', { class: 'ia-resize-detail-panel hide', 'data-tab': 'standard' });
  const grid = createTag('div', { class: 'ia-aspect-row' });
  standardRows.forEach((r) => grid.append(buildAspectPill(r)));
  detail.append(grid);
  return detail;
}

function buildSocialDetail(socialRows, platforms) {
  const detail = createTag('div', { class: 'ia-resize-detail-panel hide', 'data-tab': 'social' });
  const grids = createTag('div', { class: 'ia-social-grids' });
  platforms.forEach((platform) => {
    const grid = createTag('div', { class: 'ia-aspect-row ia-social-grid hide', 'data-platform': platform });
    socialRows
      .filter((r) => r.platform === platform)
      .forEach((r) => grid.append(buildAspectPill(r)));
    grids.append(grid);
  });
  detail.append(grids);
  return detail;
}

function buildResizeAspectSection(parsedData) {
  const section = createTag('div', { class: 'ia-aspect-section' });
  const header = createTag('div', { class: 'ia-aspect-header-row' });
  header.append(createTag('p', { class: 'ia-aspect-heading' }, parsedData.aspectRatioLabel || 'Aspect ratio'));
  const row = createTag('div', { class: 'ia-aspect-row' });
  const buckets = groupResizeRows(parsedData.aspectRows || []);
  const customBucket = buckets.find((b) => b.kind === 'custom');
  const standardBucket = buckets.find((b) => b.kind === 'standard');
  const socialBucket = buckets.find((b) => b.kind === 'social');
  const platforms = socialBucket ? [...new Set(socialBucket.rows.map((r) => r.platform))] : [];
  row.append(createTag('button', {
    type: 'button',
    class: 'ia-resize-tab is-active',
    'data-tab': 'custom',
  }, customBucket?.group || 'Custom'));
  if (standardBucket) {
    row.append(createTag('button', { type: 'button', class: 'ia-resize-tab', 'data-tab': 'standard' }, standardBucket.group));
  }
  if (socialBucket) {
    const social = createTag('div', { class: 'ia-more' });
    const socialMenu = createTag('div', { class: 'ia-social-menu hide' });
    platforms.forEach((platform) => {
      socialMenu.append(createTag('button', { type: 'button', class: 'ia-social-opt', 'data-platform': platform }, platform));
    });
    socialMenu.append(buildDropdownCloseButton());
    const socialTrigger = createTag('button', {
      type: 'button',
      class: 'ia-resize-tab ia-social-trigger',
      'data-tab': 'social',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
    }, socialBucket.group);
    social.append(socialTrigger, socialMenu);
    row.append(social);
  }
  const originalSizeLabel = parsedData.originalSizeLabel || 'Original size';
  const newSizeLabel = parsedData.newSizeLabel || 'New size';
  const readout = createTag('p', { class: 'ia-size-readout' }, `${originalSizeLabel}: -- ${newSizeLabel}: --`);
  const details = [buildCustomDetail(parsedData)];
  if (standardBucket) details.push(buildStandardDetail(standardBucket.rows));
  if (socialBucket) details.push(buildSocialDetail(socialBucket.rows, platforms));
  header.append(row);
  section.append(header, ...details, readout, buildCtaRow(false, parsedData));
  return section;
}

function buildFurtherSection(parsedData) {
  const section = createTag('div', { class: 'ia-further-section' });
  section.append(createTag('p', { class: 'ia-further-heading' }, parsedData.nbaHeading || 'Take your image further'));
  const grid = createTag('div', { class: 'ia-further-grid' });
  parsedData.nbaPills.forEach(({ nba, label, iconHref }) => {
    grid.append(buildIconButton('button', { type: 'button', class: 'ia-further-pill', 'data-nba': nba }, iconHref, label));
  });
  const gridViewport = createTag('div', { class: 'ia-further-grid-viewport' });
  gridViewport.append(grid);
  section.append(gridViewport);
  return section;
}

export function buildEditorRightPanel(parsedData) {
  const isCrop = parsedData.operation === 'crop';
  const rightPanel = createTag('div', { class: 'ia-editor-right-panel' });
  const header = createTag('div', { class: 'ia-editor-header' });
  const actions = createTag('div', { class: 'ia-editor-header-actions' });
  actions.append(buildIconButton(
    'button',
    { type: 'button', class: 'ia-editor-reset' },
    parsedData.resetIconHref,
    parsedData.resetLabel || 'Reset',
  ));
  if (!isCrop) {
    actions.append(createTag('button', {
      type: 'button',
      class: 'ia-editor-quality',
      'aria-pressed': 'false',
    }, 'Quality'));
  }
  actions.append(buildIconButton(
    'button',
    {
      type: 'button',
      class: 'ia-editor-reupload ia-reupload-btn',
      'aria-label': parsedData.reuploadLabel || 'Upload another image',
    },
    parsedData.reuploadIconHref,
    parsedData.reuploadLabel || 'Upload',
  ));
  header.append(
    createTag('span', { class: 'ia-editor-title' }, parsedData.editorTitle || (isCrop ? 'Crop your image' : 'Resize your image')),
    actions,
  );
  rightPanel.append(header);
  const aspectSection = isCrop ? buildCropAspectSection(parsedData) : buildResizeAspectSection(parsedData);
  rightPanel.append(aspectSection, buildFurtherSection(parsedData));
  rightPanel.append(createTag('div', { class: 'ia-panel-busy-overlay' }));
  return rightPanel;
}

export class EditorEngine {
  constructor(leftPanelEl, rightPanelEl, parsedData, trackEvent) {
    this.isCrop = parsedData.operation === 'crop';
    this.trackEvent = trackEvent || (() => {});
    this.leftPanel = leftPanelEl;
    this.viewport = leftPanelEl.querySelector('.ia-viewport');
    this.blurLayer = leftPanelEl.querySelector('.ia-imglayer--blur');
    this.blurBox = this.blurLayer.querySelector('.ia-imgbox');
    this.blurImg = this.blurLayer.querySelector('.ia-img');
    this.sharpLayer = leftPanelEl.querySelector('.ia-imglayer--sharp');
    this.sharpBox = this.sharpLayer.querySelector('.ia-imgbox');
    this.sharpImg = this.sharpLayer.querySelector('.ia-img');
    this.frame = leftPanelEl.querySelector('.ia-frame');
    this.processingOverlay = leftPanelEl.querySelector('.ia-processing-overlay');
    this.slider = leftPanelEl.querySelector('.ia-slider');
    this.valEl = leftPanelEl.querySelector('.ia-val');
    this.toggleBtns = [...leftPanelEl.querySelectorAll('.ia-toggle__btn')];
    this.rightPanel = rightPanelEl;
    this.interactiveArea = rightPanelEl.closest('.interactive-area');
    if (this.interactiveArea && !this.interactiveArea.querySelector(':scope > .ia-editor-widget-scrim')) {
      this.interactiveArea.append(createTag('div', { class: 'ia-editor-widget-scrim' }));
    }
    this.widgetScrim = this.interactiveArea?.querySelector(':scope > .ia-editor-widget-scrim');
    this.header = rightPanelEl.querySelector('.ia-editor-header');
    this.resetBtn = rightPanelEl.querySelector('.ia-editor-reset');
    this.reuploadBtn = rightPanelEl.querySelector('.ia-reupload-btn');
    this.qualityBtn = rightPanelEl.querySelector('.ia-editor-quality');
    this.qualityPreviewActive = false;
    this.qualityPreviewUrl = null;
    this.originalUrl = '';
    this.originalImageUrl = '';
    this.sourceImg = null;
    this.aspectPills = [...rightPanelEl.querySelectorAll('.ia-aspect-pill')];
    this.moreTrigger = rightPanelEl.querySelector('.ia-more-trigger');
    this.moreMenu = rightPanelEl.querySelector('.ia-more-menu');
    this.moreWrap = this.moreTrigger?.closest('.ia-more');
    this.repositionMoreMenu = () => this.positionDropdown(this.moreTrigger, this.moreMenu);
    const firstPill = this.aspectPills.find((p) => p !== this.moreTrigger);
    this.defaultAspectRatio = firstPill?.dataset.ratio ? Number(firstPill.dataset.ratio) : null;
    this.defaultAspectLabel = firstPill?.dataset.label || 'Freeform';
    this.defaultAspectRatioText = firstPill?.dataset.ratioText || null;
    this.moreDefaultLabel = this.moreTrigger?.textContent || 'More';
    this.resizeTabs = [...rightPanelEl.querySelectorAll('.ia-resize-tab')];
    this.resizeDetails = [...rightPanelEl.querySelectorAll('.ia-resize-detail-panel')];
    this.widthInput = rightPanelEl.querySelector('.ia-width-input');
    this.heightInput = rightPanelEl.querySelector('.ia-height-input');
    this.lockBtn = rightPanelEl.querySelector('.ia-dim-lock');
    this.unitTrigger = rightPanelEl.querySelector('.ia-unit-trigger');
    this.unitLabel = rightPanelEl.querySelector('.ia-unit-label');
    this.unitMenu = rightPanelEl.querySelector('.ia-unit-menu');
    this.unitWrap = this.unitTrigger?.closest('.ia-more');
    this.repositionUnitMenu = () => this.positionDropdown(this.unitTrigger, this.unitMenu);
    this.unit = 'px';
    this.socialTrigger = rightPanelEl.querySelector('.ia-social-trigger');
    this.socialDefaultLabel = this.socialTrigger?.textContent || 'Social';
    this.socialMenu = rightPanelEl.querySelector('.ia-social-menu');
    this.socialWrap = this.socialTrigger?.closest('.ia-more');
    this.repositionSocialMenu = () => this.positionDropdown(this.socialTrigger, this.socialMenu);
    [this.moreMenu, this.socialMenu, this.unitMenu].forEach((menu) => menu && document.body.append(menu));
    this.socialGrids = [...rightPanelEl.querySelectorAll('.ia-social-grid')];
    this.sizeReadout = rightPanelEl.querySelector('.ia-size-readout');
    this.originalSizeLabel = parsedData.originalSizeLabel || 'Original size';
    this.newSizeLabel = parsedData.newSizeLabel || 'New size';
    this.originalSize = 0;
    this.sizeReadoutTimer = null;
    this.sizeReadoutSeq = 0;
    this.hasInteracted = false;
    this.locked = true;
    this.resizeTab = 'custom';
    this.rect = {x: 0, y: 0, w: 100, h: 100};
    this.naturalW = 0;
    this.naturalH = 0;
    this.targetW = 0;
    this.targetH = 0;
    this.selectedRatio = null;
    this.selectedRatioLabel = 'Freeform';
    this.selectedRatioText = null;
    this.defaultMode = parsedData.sliderModes[0]?.mode || null;
    this.mode = this.defaultMode;
    this.zoom = 0;
    this.quality = 100;
    this.idleTimer = null;
    this.bindEvents();
    this.setupResponsiveHeader();
    this.setupResponsiveActions();
  }

  setupResponsiveHeader() {
    if (!this.header) return;
    const mq = window.matchMedia('(min-width: 1200px)');
    const place = (isDesktop) => {
      if (isDesktop) this.rightPanel.prepend(this.header);
      else this.leftPanel.insertBefore(this.header, this.viewport);
    };
    place(mq.matches);
    mq.addEventListener('change', (e) => place(e.matches));
  }

  setupResponsiveActions() {
    const actionsWrap = this.header?.querySelector('.ia-editor-header-actions');
    const title = this.header?.querySelector('.ia-editor-title');
    if (!actionsWrap || !title || !this.resetBtn || !this.reuploadBtn) return;
    const mq = window.matchMedia('(max-width: 1199px)');
    const place = (isMobile) => {
      if (isMobile) {
        this.header.insertBefore(this.resetBtn, title);
        if (this.qualityBtn) title.after(this.qualityBtn);
        this.header.append(this.reuploadBtn);
      } else {
        actionsWrap.append(this.resetBtn, ...(this.qualityBtn ? [this.qualityBtn] : []), this.reuploadBtn);
      }
    };
    place(mq.matches);
    mq.addEventListener('change', (e) => place(e.matches));
  }

  viewportSize() {
    const { width, height } = this.viewport.getBoundingClientRect();
    return [width, height];
  }

  async setImage(url, originalSize = 0, isOriginalUpload = false) {
    this.originalSize = originalSize;
    this.hasInteracted = false;
    if (this.qualityPreviewUrl) URL.revokeObjectURL(this.qualityPreviewUrl);
    this.qualityPreviewUrl = null;
    this.qualityPreviewActive = false;
    this.updateQualityBtnState();
    this.originalUrl = url;
    if (isOriginalUpload) this.originalImageUrl = url;
    this.blurImg.src = url;
    this.sharpImg.src = url;
    if (!(this.sharpImg.complete && this.sharpImg.naturalWidth)) {
      await new Promise((resolve) => {
        this.sharpImg.addEventListener('load', resolve, { once: true });
      });
    }
    this.naturalW = this.sharpImg.naturalWidth;
    this.naturalH = this.sharpImg.naturalHeight;
    this.targetW = this.naturalW;
    this.targetH = this.naturalH;
    this.sourceImg = new Image();
    this.sourceImg.src = url;
    const [vpW, vpH] = this.viewportSize();
    this.rect = centeredRect(null, this.naturalW, this.naturalH, vpW, vpH);
    this.render();
  }

  render() {
    const { x, y, w, h } = this.rect;
    this.frame.style.left = `${x}%`;
    this.frame.style.top = `${y}%`;
    this.frame.style.width = `${w}%`;
    this.frame.style.height = `${h}%`;
    if (this.naturalW) {
      const [vpW, vpH] = this.viewportSize();
      const { w: dispW, h: dispH } = containBox(this.naturalW, this.naturalH, vpW, vpH);
      const boxWPct = (dispW / vpW) * 100;
      const boxHPct = (dispH / vpH) * 100;
      [this.blurBox, this.sharpBox].forEach((box) => {
        box.style.width = `${boxWPct}%`;
        box.style.height = `${boxHPct}%`;
      });
    }
    const transform = `scale(${zoomScale(this.zoom)})`;
    this.blurBox.style.transform = transform;
    this.sharpBox.style.transform = transform;
    this.sharpLayer.style.clipPath = `inset(${y}% ${100 - (x + w)}% ${100 - (y + h)}% ${x}%)`;
    if (!this.isCrop) this.syncDimensionFields();
  }

  syncDimensionFields() {
    if (!this.widthInput || !this.naturalW) return;
    if (document.activeElement !== this.widthInput) this.widthInput.value = pxToUnit(this.targetW, this.unit);
    if (document.activeElement !== this.heightInput) this.heightInput.value = pxToUnit(this.targetH, this.unit);
    this.scheduleSizeReadout();
  }

  static formatBytes(bytes) {
    if (!bytes) return '--';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  computeNewSize(width, height) {
    return new Promise((resolve) => {
      if (!width || !height || !this.sourceImg) { resolve(null); return; }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(this.sourceImg, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob?.size ?? null), 'image/jpeg', this.quality / 100);
    });
  }

  scheduleSizeReadout() {
    if (!this.sizeReadout) return;
    clearTimeout(this.sizeReadoutTimer);
    this.sizeReadoutTimer = setTimeout(() => this.updateSizeReadout(), 150);
  }

  async updateSizeReadout() {
    const original = EditorEngine.formatBytes(this.originalSize);
    if (!this.hasInteracted) {
      this.sizeReadout.textContent = `${this.originalSizeLabel}: ${original} ${this.newSizeLabel}: --`;
      return;
    }
    this.sizeReadoutSeq += 1;
    const seq = this.sizeReadoutSeq;
    const { width, height } = this.getResizeDimensions();
    const newSize = await this.computeNewSize(width, height);
    if (seq !== this.sizeReadoutSeq) return;
    const updated = EditorEngine.formatBytes(newSize);
    this.sizeReadout.textContent = `${this.originalSizeLabel}: ${original} ${this.newSizeLabel}: ${updated}`;
  }

  applyQualityPreview() {
    if (!this.sourceImg || !this.naturalW || !this.naturalH) return;
    const canvas = document.createElement('canvas');
    canvas.width = this.naturalW;
    canvas.height = this.naturalH;
    canvas.getContext('2d').drawImage(this.sourceImg, 0, 0, this.naturalW, this.naturalH);
    canvas.toBlob((blob) => {
      if (!blob) return;
      if (this.qualityPreviewUrl) URL.revokeObjectURL(this.qualityPreviewUrl);
      const url = URL.createObjectURL(blob);
      this.qualityPreviewUrl = url;
      this.blurImg.src = url;
      this.sharpImg.src = url;
      this.qualityPreviewActive = true;
      this.updateQualityBtnState();
    }, 'image/jpeg', this.quality / 100);
  }

  revertQualityPreview() {
    if (!this.qualityPreviewActive) return;
    this.blurImg.src = this.originalUrl;
    this.sharpImg.src = this.originalUrl;
    if (this.qualityPreviewUrl) URL.revokeObjectURL(this.qualityPreviewUrl);
    this.qualityPreviewUrl = null;
    this.qualityPreviewActive = false;
    this.updateQualityBtnState();
  }

  toggleQualityPreview() {
    if (this.qualityPreviewActive) this.revertQualityPreview();
    else this.applyQualityPreview();
  }

  updateQualityBtnState() {
    if (!this.qualityBtn) return;
    this.qualityBtn.classList.toggle('is-active', this.qualityPreviewActive);
    this.qualityBtn.setAttribute('aria-pressed', String(this.qualityPreviewActive));
    this.qualityBtn.textContent = this.qualityPreviewActive ? 'Original' : 'Quality';
  }

  bindEvents() {
    this.frame.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.ia-handle')) return;
      this.startDrag(e, 'move');
    });
    this.frame.querySelectorAll('.ia-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.startDrag(e, handle.dataset.handle);
      });
    });
    this.slider?.addEventListener('input', () => this.onSlider());
    this.toggleBtns.forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });
    this.viewport.addEventListener('pointerdown', () => this.resetIdle());
    this.viewport.addEventListener('pointermove', () => this.resetIdle());
    this.setMode(this.mode);
    this.resetIdle();
    this.bindAspectEvents();
    this.bindResizeTabEvents();
    this.bindDimensionEvents();
    this.bindSocialEvents();
    this.bindUnitEvents();
    this.bindDropdownFocusTraps();
    this.qualityBtn?.addEventListener('click', () => this.toggleQualityPreview());
  }

  bindResizeTabEvents() {
    this.resizeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        if (tab.dataset.tab === 'social') {
          this.toggleSocialMenu();
          return;
        }
        this.selectResizeTab(tab);
      });
    });
  }

  selectResizeTab(tab) {
    this.resizeTab = tab.dataset.tab;
    this.resizeTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
    this.resizeDetails.forEach((d) => d.classList.toggle('hide', d.dataset.tab !== tab.dataset.tab));
    if (tab !== this.socialTrigger && this.socialTrigger) this.socialTrigger.textContent = this.socialDefaultLabel;
  }

  bindDimensionEvents() {
    if (!this.widthInput) return;
    const commit = (axis) => () => this.onDimensionCommit(axis);
    this.widthInput.addEventListener('blur', commit('width'));
    this.heightInput.addEventListener('blur', commit('height'));
    [[this.widthInput, 'width'], [this.heightInput, 'height']].forEach(([input, axis]) => {
      let viaArrowKey = false;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.onDimensionCommit(axis);
          input.blur();
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') viaArrowKey = true;
      });
      input.addEventListener('input', () => {
        if (!viaArrowKey) return;
        viaArrowKey = false;
        this.onDimensionCommit(axis);
      });
    });
    this.lockBtn.addEventListener('click', () => {
      this.locked = !this.locked;
      this.lockBtn.classList.toggle('is-active', this.locked);
      this.lockBtn.setAttribute('aria-pressed', String(this.locked));
    });
  }

  onDimensionCommit(axis) {
    if (!this.naturalW) return;
    const raw = Number(axis === 'width' ? this.widthInput.value : this.heightInput.value);
    if (!raw || raw <= 0) return;
    const rawPx = unitToPx(raw, this.unit);
    if (this.locked) {
      const ratio = this.targetW / this.targetH;
      if (axis === 'width') {
        this.targetW = rawPx;
        this.targetH = Math.round(rawPx / ratio);
      } else {
        this.targetH = rawPx;
        this.targetW = Math.round(rawPx * ratio);
      }
    } else {
      if (axis === 'width') this.targetW = rawPx;
      else this.targetH = rawPx;
      const [vpW, vpH] = this.viewportSize();
      this.rect = frameFromDimensions(this.targetW, this.targetH, this.naturalW, this.naturalH, vpW, vpH, this.rect);
    }
    this.hasInteracted = true;
    this.render();
  }

  toggleSocialMenu() {
    const isOpen = !this.socialMenu.classList.contains('hide');
    if (isOpen) { this.closeSocialMenu(); return; }
    this.positionDropdown(this.socialTrigger, this.socialMenu);
    this.socialMenu.classList.remove('hide');
    this.socialTrigger.setAttribute('aria-expanded', 'true');
    window.addEventListener('scroll', this.repositionSocialMenu, true);
    window.addEventListener('resize', this.repositionSocialMenu);
    this.focusFirstMenuItem(this.socialMenu);
    this.updateDropdownScrim();
  }

  closeSocialMenu() {
    const shouldRefocus = this.socialMenu?.contains(document.activeElement);
    this.socialMenu?.classList.add('hide');
    this.socialTrigger?.setAttribute('aria-expanded', 'false');
    window.removeEventListener('scroll', this.repositionSocialMenu, true);
    window.removeEventListener('resize', this.repositionSocialMenu);
    this.updateDropdownScrim();
    if (shouldRefocus) this.socialTrigger?.focus();
  }

  bindSocialEvents() {
    if (!this.socialTrigger) return;
    this.socialMenu?.querySelectorAll('.ia-social-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        const { platform } = opt.dataset;
        this.socialTrigger.textContent = platform;
        this.socialGrids.forEach((grid) => grid.classList.toggle('hide', grid.dataset.platform !== platform));
        this.closeSocialMenu();
        this.selectResizeTab(this.socialTrigger);
      });
    });
    this.socialMenu?.querySelector('.ia-dropdown-close')?.addEventListener('click', () => this.closeSocialMenu());
    document.addEventListener('click', (e) => {
      if (!this.socialWrap?.contains(e.target) && !this.socialMenu?.contains(e.target)) this.closeSocialMenu();
    });
  }

  toggleUnitMenu() {
    const isOpen = !this.unitMenu.classList.contains('hide');
    if (isOpen) { this.closeUnitMenu(); return; }
    this.positionDropdown(this.unitTrigger, this.unitMenu);
    this.unitMenu.classList.remove('hide');
    this.unitTrigger.setAttribute('aria-expanded', 'true');
    window.addEventListener('scroll', this.repositionUnitMenu, true);
    window.addEventListener('resize', this.repositionUnitMenu);
    this.focusFirstMenuItem(this.unitMenu);
    this.updateDropdownScrim();
  }

  closeUnitMenu() {
    const shouldRefocus = this.unitMenu?.contains(document.activeElement);
    this.unitMenu?.classList.add('hide');
    this.unitTrigger?.setAttribute('aria-expanded', 'false');
    window.removeEventListener('scroll', this.repositionUnitMenu, true);
    window.removeEventListener('resize', this.repositionUnitMenu);
    this.updateDropdownScrim();
    if (shouldRefocus) this.unitTrigger?.focus();
  }

  bindUnitEvents() {
    if (!this.unitTrigger) return;
    this.unitTrigger.addEventListener('click', () => this.toggleUnitMenu());
    this.unitMenu?.querySelectorAll('.ia-unit-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        this.unit = opt.dataset.unit;
        if (this.unitLabel) this.unitLabel.textContent = this.unit;
        this.closeUnitMenu();
        this.syncDimensionFields();
      });
    });
    this.unitMenu?.querySelector('.ia-dropdown-close')?.addEventListener('click', () => this.closeUnitMenu());
    document.addEventListener('click', (e) => {
      if (!this.unitWrap?.contains(e.target) && !this.unitMenu?.contains(e.target)) this.closeUnitMenu();
    });
  }

  reset() {
    this.zoom = 0;
    this.quality = 100;
    this.revertQualityPreview();
    if (this.isCrop) {
      this.selectAspect(this.defaultAspectRatio, this.defaultAspectLabel, false, null, this.defaultAspectRatioText);
    } else {
      this.locked = true;
      this.resizeTab = 'custom';
      this.lockBtn?.classList.add('is-active');
      this.lockBtn?.setAttribute('aria-pressed', 'true');
      this.resizeTabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === 'custom'));
      this.resizeDetails.forEach((d) => d.classList.toggle('hide', d.dataset.tab !== 'custom'));
      this.aspectPills.forEach((pill) => pill.classList.remove('is-active'));
      if (this.socialTrigger) this.socialTrigger.textContent = this.socialDefaultLabel;
      this.unit = 'px';
      if (this.unitLabel) this.unitLabel.textContent = 'px';
      if (this.naturalW) {
        const [vpW, vpH] = this.viewportSize();
        this.rect = centeredRect(null, this.naturalW, this.naturalH, vpW, vpH);
        this.targetW = this.naturalW;
        this.targetH = this.naturalH;
        this.render();
      }
    }
    this.hasInteracted = false;
    this.setMode(this.defaultMode);
    this.scheduleSizeReadout();
  }

  bindAspectEvents() {
    if (!this.aspectPills.length) return;
    this.aspectPills.forEach((pill) => {
      if (pill === this.moreTrigger) return;
      pill.addEventListener('click', () => {
        const { ratio, label, width, height, ratioText } = pill.dataset;
        const dimensions = width && height ? { width: Number(width), height: Number(height) } : null;
        this.trackEvent(`Aspect Ratio ${ratioText || label || 'Freeform'}|UnityWidget`);
        this.selectAspect(ratio ? Number(ratio) : null, label, false, dimensions, ratioText || null);
        this.closeMore();
      });
    });
    this.moreTrigger?.addEventListener('click', () => {
      this.trackEvent('Aspect Ratio More|UnityWidget');
      this.toggleMore();
    });
    this.moreMenu?.querySelectorAll('.ia-more-opt')?.forEach((opt) => {
      if (opt.classList.contains('ia-editor-open-in-firefly')) {
        opt.addEventListener('click', () => this.closeMore());
        return;
      }
      opt.addEventListener('click', () => {
        const { ratio, label, ratioText, icon } = opt.dataset;
        this.trackEvent(`Aspect Ratio ${ratioText || label || 'Freeform'}|UnityWidget`);
        this.selectAspect(Number(ratio), label, true, null, ratioText || null, icon || null);
        this.closeMore();
      });
    });
    this.moreMenu?.querySelector('.ia-dropdown-close')?.addEventListener('click', () => this.closeMore());
    if (this.moreTrigger) {
      document.addEventListener('click', (e) => {
        if (!this.moreWrap.contains(e.target) && !this.moreMenu?.contains(e.target)) this.closeMore();
      });
    }
  }

  positionDropdown(trigger, menu) {
    const rect = trigger.getBoundingClientRect();
    const panelRect = this.rightPanel.getBoundingClientRect();
    const clampedRight = Math.min(rect.right, panelRect.right);
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.right = `${window.innerWidth - clampedRight}px`;
  }

  focusFirstMenuItem(menu) {
    menu.querySelector('button:not([disabled])')?.focus();
  }

  handleDropdownKeydown(e, menu, close) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    const focusable = [...menu.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const currentIndex = focusable.indexOf(document.activeElement);
    let nextIndex;
    if (currentIndex === -1) nextIndex = e.key === 'ArrowDown' ? 0 : focusable.length - 1;
    else if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % focusable.length;
    else nextIndex = (currentIndex - 1 + focusable.length) % focusable.length;
    focusable[nextIndex].focus();
  }

  bindDropdownFocusTraps() {
    [
      [this.moreTrigger, this.moreMenu, () => this.closeMore()],
      [this.socialTrigger, this.socialMenu, () => this.closeSocialMenu()],
      [this.unitTrigger, this.unitMenu, () => this.closeUnitMenu()],
    ].forEach(([trigger, menu, close]) => {
      if (!menu) return;
      menu.addEventListener('keydown', (e) => this.handleDropdownKeydown(e, menu, close));
      trigger?.addEventListener('keydown', (e) => {
        if (menu.classList.contains('hide')) return;
        this.handleDropdownKeydown(e, menu, close);
      });
    });
  }

  toggleMore() {
    const isOpen = !this.moreMenu.classList.contains('hide');
    if (isOpen) this.closeMore();
    else {
      this.positionDropdown(this.moreTrigger, this.moreMenu);
      this.moreMenu.classList.remove('hide');
      this.moreTrigger.setAttribute('aria-expanded', 'true');
      window.addEventListener('scroll', this.repositionMoreMenu, true);
      window.addEventListener('resize', this.repositionMoreMenu);
      this.focusFirstMenuItem(this.moreMenu);
    }
    this.updateDropdownScrim();
  }

  closeMore() {
    const shouldRefocus = this.moreMenu?.contains(document.activeElement);
    this.moreMenu?.classList.add('hide');
    this.moreTrigger?.setAttribute('aria-expanded', 'false');
    window.removeEventListener('scroll', this.repositionMoreMenu, true);
    window.removeEventListener('resize', this.repositionMoreMenu);
    this.updateDropdownScrim();
    if (shouldRefocus) this.moreTrigger?.focus();
  }

  updateDropdownScrim() {
    let anyOpen = false;
    [
      [this.moreWrap, this.moreMenu],
      [this.socialWrap, this.socialMenu],
      [this.unitWrap, this.unitMenu],
    ].forEach(([wrap, menu]) => {
      const isOpen = !!menu && !menu.classList.contains('hide');
      wrap?.classList.toggle('is-open', isOpen);
      if (isOpen) anyOpen = true;
    });
    this.rightPanel.classList.toggle('is-dropdown-open', anyOpen);
    this.interactiveArea?.classList.toggle('is-dropdown-open', anyOpen);
  }

  setMoreTrigger(label, iconHref = null) {
    if (!this.moreTrigger) return;
    this.moreTrigger.querySelector('.ia-btn-icon')?.remove();
    if (iconHref) {
      this.moreTrigger.prepend(createTag('img', { src: iconHref, alt: '', loading: 'lazy', class: 'ia-btn-icon' }));
    } else {
      this.moreTrigger.insertAdjacentHTML('afterbegin', svgUse(MORE_TRIGGER_ICON, 'ia-btn-icon'));
    }
    const span = this.moreTrigger.querySelector('span');
    if (span) span.textContent = label;
  }

  selectAspect(ratio, label, fromMore = false, dimensions = null, ratioText = null, iconHref = null) {
    this.selectedRatio = ratio;
    this.selectedRatioLabel = label;
    this.selectedRatioText = ratioText;
    this.zoom = 0;
    this.setMode(this.mode);
    this.aspectPills.forEach((pill) => pill.classList.remove('is-active'));
    if (fromMore) {
      this.setMoreTrigger(label, iconHref);
      this.moreTrigger.classList.add('is-active');
    } else {
      this.setMoreTrigger(this.moreDefaultLabel);
      const match = this.aspectPills.find((pill) => pill.dataset.label === label);
      match?.classList.add('is-active');
    }
    if (this.naturalW) {
      const [vpW, vpH] = this.viewportSize();
      this.rect = centeredRect(ratio, this.naturalW, this.naturalH, vpW, vpH);
      if (!this.isCrop) {
        if (dimensions) {
          this.targetW = dimensions.width;
          this.targetH = dimensions.height;
        } else {
          const b = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
          this.targetW = b.right - b.left;
          this.targetH = b.bottom - b.top;
        }
      }
      this.hasInteracted = true;
      this.render();
    }
  }

  getSourceBounds() {
    const [vpW, vpH] = this.viewportSize();
    return rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, this.zoom);
  }

  getResizeDimensions() {
    if (this.resizeTab === 'custom') return { width: this.targetW, height: this.targetH };
    const [vpW, vpH] = this.viewportSize();
    const b = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
    return { width: b.right - b.left, height: b.bottom - b.top };
  }

  getResizeOutputDimensions() {
    const { width, height } = this.getResizeDimensions();
    if (this.resizeTab !== 'custom') return { width, height, unit: 'px' };
    return { width: pxToUnit(width, this.unit), height: pxToUnit(height, this.unit), unit: this.unit };
  }

  getDragRatioLock(rect) {
    if (this.isCrop || this.resizeTab !== 'custom') return this.selectedRatio;
    if (!this.locked) return null;
    const [vpW, vpH] = this.viewportSize();
    const w = rect.w * vpW;
    const h = rect.h * vpH;
    return h ? w / h : null;
  }

  startDrag(e, kind) {
    e.preventDefault();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.resetIdle();
    this.hasInteracted = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const baseRect = { ...this.rect };
    const [vpW, vpH] = this.viewportSize();
    const trueRatioLock = this.getDragRatioLock(baseRect);
    const ratioLock = trueRatioLock ? trueRatioLock * (vpH / vpW) : null;
    const bounds = imageBoundsPct(this.naturalW, this.naturalH, vpW, vpH, this.zoom);
    const move = (ev) => {
      const dxPct = ((ev.clientX - startX) / vpW) * 100;
      const dyPct = ((ev.clientY - startY) / vpH) * 100;
      this.rect = kind === 'move'
        ? {
          ...baseRect,
          x: clamp(baseRect.x + dxPct, bounds.left, bounds.right - baseRect.w),
          y: clamp(baseRect.y + dyPct, bounds.top, bounds.bottom - baseRect.h),
        }
        : resizeRect(baseRect, kind, dxPct, dyPct, ratioLock, bounds);
      if (!this.isCrop && this.resizeTab === 'custom' && !this.locked) {
        const b = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
        this.targetW = b.right - b.left;
        this.targetH = b.bottom - b.top;
      }
      this.render();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  setMode(mode) {
    this.mode = mode;
    this.toggleBtns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.mode === mode));
    if (!this.slider) return;
    this.slider.min = '0';
    this.slider.max = '100';
    const current = { zoom: this.zoom, quality: this.quality }[mode] ?? 0;
    this.slider.value = String(current);
    this.updateValLabel();
  }

  onSlider() {
    if (!KNOWN_SLIDER_MODES.has(this.mode)) return;
    const value = Number(this.slider.value);
    if (this.mode === 'zoom') this.zoom = value;
    else this.quality = value;
    this.hasInteracted = true;
    if (this.mode === 'quality') this.revertQualityPreview();
    this.updateValLabel();
    this.render();
  }

  updateValLabel() {
    if (!this.valEl) return;
    if (this.mode === 'zoom') this.valEl.textContent = `${zoomScale(this.zoom).toFixed(1)}x`;
    else if (this.mode === 'quality') this.valEl.textContent = `${Math.round(this.quality)}%`;
    else this.valEl.textContent = '--';
  }

  resetIdle() {
    this.frame.classList.remove('ia-frame--idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.frame.classList.add('ia-frame--idle'), IDLE_MS);
  }

  setBusy(isBusy, triggerBtn = null) {
    this.leftPanel.classList.toggle('is-busy', isBusy);
    this.rightPanel.classList.toggle('is-busy', isBusy);
    this.processingOverlay?.classList.toggle('is-active', isBusy);
    toggleTriggerSpinner(triggerBtn, isBusy);
  }
}

export async function initEditor(leftSlot, rightSlot, parsedData, trackEvent) {
  const [, aspectRows] = await Promise.all([
    new Promise((resolve) => { loadStyle(`${getUnityLibs()}/core/widgets/inline-action/editor.css`, resolve); }),
    loadAspectRatios(parsedData.operation),
  ]);
  const fullData = { ...parsedData, aspectRows };
  const leftPanel = buildEditorLeftPanel(fullData);
  const rightPanel = buildEditorRightPanel(fullData);
  leftSlot.replaceWith(leftPanel);
  rightSlot.replaceWith(rightPanel);
  return new EditorEngine(leftPanel, rightPanel, fullData, trackEvent);
}
