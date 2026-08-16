import { createTag, loadStyle, getUnityLibs } from '../../../scripts/utils.js';

const MIN_PCT = 10;
const IDLE_MS = 5000;
const ROTATE_MIN = -180;
const ROTATE_MAX = 180;
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
export const zoomScale = (zoom) => 1 + (zoom / 100);

// Stubbed content — not authored yet. Real pills/NBAs are wired up to the same
// selection logic once these come from parseInlineAuthoring().
const ASPECT_PILLS = [
  { label: 'Freeform', ratio: null },
  { label: '1:1', ratio: 1 },
  { label: '16:9', ratio: 16 / 9 },
  { label: '9:16', ratio: 9 / 16 },
];
const MORE_ASPECTS = [
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '2:1', ratio: 2 },
];
const CROP_FURTHER_STUBS = ['Upscale', 'Prompt to edit', 'Expand', 'Remove object', 'Tune'];
const RESIZE_FURTHER_STUBS = ['Prompt to edit', 'Remove object', 'Tune', 'Expand', 'Cartoonize'];
const RESIZE_STANDARD = [
  { label: 'Square 1:1', ratio: 1 },
  { label: 'Widescreen 16:9', ratio: 16 / 9 },
  { label: 'iPhone 9:16', ratio: 9 / 16 },
  { label: 'Landscape 3:2', ratio: 3 / 2 },
  { label: 'Presentation 3:4', ratio: 3 / 4 },
];
// Stubbed to one platform for now — only the interaction pattern (dropdown -> that
// platform's own preset grid) matters until this is authored.
const RESIZE_SOCIAL = {
  Instagram: [
    { label: 'Feed post 1:1', ratio: 1 },
    { label: 'Portrait 4:5', ratio: 4 / 5 },
    { label: 'Story/Reels 9:16', ratio: 9 / 16 },
    { label: 'Landscape 1.91:1', ratio: 1.91 },
  ],
  TikTok: [
    { label: 'Video 9:16', ratio: 9 / 16 },
  ],
  Facebook: [
    { label: 'Feed post 1:1', ratio: 1 },
    { label: 'Story 9:16', ratio: 9 / 16 },
    { label: 'Cover 1.91:1', ratio: 1.91 },
  ],
  Youtube: [
    { label: 'Thumbnail 16:9', ratio: 16 / 9 },
    { label: 'Short 9:16', ratio: 9 / 16 },
  ],
  Linkedin: [
    { label: 'Post 1.91:1', ratio: 1.91 },
    { label: 'Square 1:1', ratio: 1 },
  ],
};

// Pixel-space stays the single source of truth for the actual rect/frame math — units
// only matter for how the Custom fields are typed into and displayed. 300px = 1in
// (300 DPI, the standard print-resolution basis); cm/mm are derived from that.
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

// Resize's frame comes from an explicit width/height (px) rather than a ratio — at
// natural size the frame exactly hugs the displayed image (iw/ih below); growing past
// natural size grows the frame toward the full container, per the same object-contain
// fraction the image itself is displayed at.
export function frameFromDimensions(width, height, naturalW, naturalH, viewportW, viewportH) {
  const { cs } = containBox(naturalW, naturalH, viewportW, viewportH);
  const iw = (naturalW * cs) / viewportW;
  const ih = (naturalH * cs) / viewportH;
  const wPct = clamp((width / naturalW) * iw * 100, MIN_PCT, 100);
  const hPct = clamp((height / naturalH) * ih * 100, MIN_PCT, 100);
  return {
    x: (100 - wPct) / 2,
    y: (100 - hPct) / 2,
    w: wPct,
    h: hPct,
  };
}

function edgeDelta(movesNeg, movesPos, delta) {
  if (movesNeg) return -delta;
  if (movesPos) return delta;
  return 0;
}

// Resizes from a fixed anchor (the corner/edge opposite whichever the handle drags).
// When ratioLock is set, viewport-bounds overflow is resolved by scaling BOTH
// dimensions down together (from whichever axis is more constrained), so the ratio
// stays exact even when a side hits the viewport edge — clamping w/h independently
// would otherwise silently break the locked ratio right at the boundary.
export function resizeRect(base, handle, dxPct, dyPct, ratioLock) {
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

  const maxW = movesLeft ? anchorX : 100 - anchorX;
  const maxH = movesTop ? anchorY : 100 - anchorY;
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
    x: clamp(left, 0, 100 - newW),
    y: clamp(top, 0, 100 - newH),
    w: newW,
    h: newH,
  };
}

// Converts the frame's viewport-% rect into source-image pixel bounds — this is what
// actually feeds edits.document.crop.bounds. Folds in zoom: the image is scaled around
// the viewport's own center (transform-origin: center) while the frame stays fixed in
// viewport-space, so a zoomed-in image maps a fixed on-screen frame to a smaller,
// centered source region. Un-scaling each edge around the viewport center before the
// existing offset/cs conversion recovers that region exactly (zoom=0 reduces to the
// original unscaled math). Rotation still has no field in the API payload we've seen,
// so it isn't folded in here — that's still open.
export function rectPctToSourceBounds(rect, naturalW, naturalH, viewportW, viewportH, zoom = 0) {
  const { cs, w: dispW, h: dispH } = containBox(naturalW, naturalH, viewportW, viewportH);
  const offsetX = (viewportW - dispW) / 2;
  const offsetY = (viewportH - dispH) / 2;
  const scale = zoomScale(zoom);
  const unscale = (px, size) => (size / 2) + ((px - (size / 2)) / scale);

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
    tabindex: '0',
    role: 'presentation',
  })));
  return frame;
}

function buildAdjustBar(isCrop) {
  const modeA = isCrop ? 'rotate' : 'quality';
  const labelA = isCrop ? 'Rotate' : 'Quality';
  const bar = createTag('div', { class: 'ia-adjust-bar' });
  const toggle = createTag('div', { class: 'ia-toggle' });
  toggle.append(
    createTag('button', {
      type: 'button',
      class: 'ia-toggle__btn is-active',
      'data-mode': modeA,
      'aria-label': labelA,
    }, labelA),
    createTag('button', {
      type: 'button',
      class: 'ia-toggle__btn',
      'data-mode': 'zoom',
      'aria-label': 'Zoom',
    }, 'Zoom'),
  );
  const slider = createTag('input', {
    type: 'range',
    class: 'ia-slider',
    autocomplete: 'off',
    min: isCrop ? String(ROTATE_MIN) : '0',
    max: isCrop ? String(ROTATE_MAX) : '100',
    value: isCrop ? '0' : '100',
  });
  const val = createTag('span', { class: 'ia-val' }, isCrop ? '0.0°' : '100%');
  bar.append(toggle, slider, val);
  return bar;
}

export function buildEditorStage(meta) {
  const isCrop = meta.operation === 'crop';
  const stage = createTag('div', { class: 'ia-editor-stage' });
  const viewport = createTag('div', { class: 'ia-viewport' });
  const blurImg = createTag('img', { class: 'ia-img', alt: '', draggable: 'false' });
  const sharpImg = createTag('img', { class: 'ia-img', alt: '', draggable: 'false' });
  viewport.append(
    createTag('div', { class: 'ia-imglayer ia-imglayer--blur' }, blurImg),
    createTag('div', { class: 'ia-imglayer ia-imglayer--sharp' }, sharpImg),
    buildFrame(),
  );
  stage.append(viewport, buildAdjustBar(isCrop));
  return stage;
}

function buildAspectPill(label, ratio, isActive = false) {
  return createTag('button', {
    type: 'button',
    class: `ia-aspect-pill${isActive ? ' is-active' : ''}`,
    'data-ratio': ratio ?? '',
    'data-label': label,
  }, label);
}

function buildCtaRow(isCrop) {
  const row = createTag('div', { class: 'ia-cta-row' });
  row.append(
    createTag('button', { type: 'button', class: 'ia-cta-accent' }, isCrop ? 'Crop and download' : 'Resize and download'),
    createTag('button', { type: 'button', class: 'ia-cta-outline' }, 'Open in Firefly'),
  );
  return row;
}

function buildCropAspectSection() {
  const section = createTag('div', { class: 'ia-aspect-section' });
  section.append(createTag('p', { class: 'ia-aspect-heading' }, 'Aspect ratio'));
  const row = createTag('div', { class: 'ia-aspect-row' });
  ASPECT_PILLS.forEach(({ label, ratio }, i) => row.append(buildAspectPill(label, ratio, i === 0)));
  const more = createTag('div', { class: 'ia-more' });
  const moreMenu = createTag('div', { class: 'ia-more-menu hide' });
  MORE_ASPECTS.forEach(({ label, ratio }) => {
    moreMenu.append(createTag('button', {
      type: 'button',
      class: 'ia-more-opt',
      'data-ratio': ratio,
      'data-label': label,
    }, label));
  });
  const moreTrigger = createTag('button', {
    type: 'button',
    class: 'ia-aspect-pill ia-more-trigger',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
  }, 'More');
  more.append(moreTrigger, moreMenu);
  row.append(more);
  section.append(row, buildCtaRow(true));
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

// Same dropdown pattern as Crop's More / Resize's Social — a plain trigger + option
// list, distinct classes so it doesn't get picked up by that unrelated wiring.
function buildUnitPicker() {
  const wrap = createTag('div', { class: 'ia-more' });
  const menu = createTag('div', { class: 'ia-unit-menu hide' });
  UNIT_OPTIONS.forEach((unit) => {
    menu.append(createTag('button', { type: 'button', class: 'ia-unit-opt', 'data-unit': unit }, unit));
  });
  const trigger = createTag('button', {
    type: 'button',
    class: 'ia-dim-unit ia-unit-trigger',
    'data-unit': 'px',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
  });
  trigger.append(
    createTag('span', { class: 'ia-unit-label' }, 'px'),
    createTag('span', { class: 'ia-unit-chevron', 'aria-hidden': 'true' }, '⌄'),
  );
  wrap.append(trigger, menu);
  return wrap;
}

function buildCustomDetail() {
  const detail = createTag('div', { class: 'ia-resize-detail-panel', 'data-tab': 'custom' });
  const fields = createTag('div', { class: 'ia-dim-fields' });
  fields.append(
    buildDimensionField('Width', 'ia-width-input'),
    createTag('button', { type: 'button', class: 'ia-dim-lock is-active', 'aria-label': 'Lock aspect ratio', 'aria-pressed': 'true' }, '🔒'),
    buildDimensionField('Height', 'ia-height-input'),
    buildUnitPicker(),
  );
  detail.append(fields);
  return detail;
}

function buildStandardDetail() {
  const detail = createTag('div', { class: 'ia-resize-detail-panel hide', 'data-tab': 'standard' });
  const grid = createTag('div', { class: 'ia-aspect-row' });
  RESIZE_STANDARD.forEach(({ label, ratio }) => grid.append(buildAspectPill(label, ratio)));
  detail.append(grid);
  return detail;
}

// Social's detail is just the per-platform ratio grids — the platform picker itself
// lives in the pill row (see buildResizeAspectSection), same as Crop's More trigger.
function buildSocialDetail() {
  const detail = createTag('div', { class: 'ia-resize-detail-panel hide', 'data-tab': 'social' });
  const grids = createTag('div', { class: 'ia-social-grids' });
  Object.entries(RESIZE_SOCIAL).forEach(([platform, ratios]) => {
    const grid = createTag('div', { class: 'ia-aspect-row ia-social-grid hide', 'data-platform': platform });
    ratios.forEach(({ label, ratio }) => grid.append(buildAspectPill(label, ratio)));
    grids.append(grid);
  });
  detail.append(grids);
  return detail;
}

// Custom/Standard are plain pills exactly like Crop's aspect pills. Social is a
// dropdown trigger exactly like Crop's "More" — clicking it doesn't switch tabs by
// itself, it opens a platform list; picking a platform is what switches to showing
// that platform's ratio grid (see EditorEngine.bindSocialEvents).
function buildResizeAspectSection() {
  const section = createTag('div', { class: 'ia-aspect-section' });
  section.append(createTag('p', { class: 'ia-aspect-heading' }, 'Aspect ratio'));
  const row = createTag('div', { class: 'ia-aspect-row' });
  // These are deliberately NOT .ia-aspect-pill — that class is reserved for actual
  // ratio-selecting pills (Standard's presets, Social's per-platform grids), which
  // already go through bindAspectEvents()/selectAspect(). Custom/Standard/Social
  // switch tabs or open a dropdown instead, so they get their own class + CSS that
  // matches .ia-aspect-pill visually without being picked up by that generic wiring.
  ['Custom', 'Standard'].forEach((label, i) => {
    row.append(createTag('button', {
      type: 'button',
      class: `ia-resize-tab${i === 0 ? ' is-active' : ''}`,
      'data-tab': label.toLowerCase(),
    }, label));
  });
  const social = createTag('div', { class: 'ia-more' });
  const socialMenu = createTag('div', { class: 'ia-social-menu hide' });
  Object.keys(RESIZE_SOCIAL).forEach((platform) => {
    socialMenu.append(createTag('button', { type: 'button', class: 'ia-social-opt', 'data-platform': platform }, platform));
  });
  const socialTrigger = createTag('button', {
    type: 'button',
    class: 'ia-resize-tab ia-social-trigger',
    'data-tab': 'social',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
  }, 'Social');
  social.append(socialTrigger, socialMenu);
  row.append(social);
  const readout = createTag('p', { class: 'ia-size-readout' }, 'Original size: -- New size: --');
  section.append(row, buildCustomDetail(), buildStandardDetail(), buildSocialDetail(), readout, buildCtaRow(false));
  return section;
}

function buildFurtherSection(isCrop) {
  const section = createTag('div', { class: 'ia-further-section' });
  section.append(createTag('p', { class: 'ia-further-heading' }, 'Take your image further'));
  const grid = createTag('div', { class: 'ia-further-grid' });
  const stubs = isCrop ? CROP_FURTHER_STUBS : RESIZE_FURTHER_STUBS;
  stubs.forEach((label) => {
    grid.append(createTag('button', { type: 'button', class: 'ia-further-pill' }, label));
  });
  section.append(grid);
  return section;
}

export function buildEditorPanel(meta) {
  const isCrop = meta.operation === 'crop';
  const panel = createTag('div', { class: 'ia-editor-panel' });
  const header = createTag('div', { class: 'ia-editor-header' });
  const actions = createTag('div', { class: 'ia-editor-header-actions' });
  actions.append(createTag('button', { type: 'button', class: 'ia-editor-reset' }, 'Reset'));
  if (!isCrop) {
    actions.append(createTag('button', {
      type: 'button',
      class: 'ia-editor-quality',
      'aria-pressed': 'false',
    }, 'Quality'));
  }
  actions.append(createTag('button', {
    type: 'button',
    class: 'ia-editor-reupload ia-reupload-btn',
    'aria-label': 'Upload another image',
  }, 'Upload'));
  header.append(
    createTag('span', { class: 'ia-editor-title' }, isCrop ? 'Crop your image' : 'Resize your image'),
    actions,
  );
  panel.append(header);
  const aspectSection = isCrop ? buildCropAspectSection() : buildResizeAspectSection();
  panel.append(aspectSection, buildFurtherSection(isCrop));
  return panel;
}

export class EditorEngine {
  constructor(stageEl, panelEl, meta) {
    this.isCrop = meta.operation === 'crop';
    this.viewport = stageEl.querySelector('.ia-viewport');
    this.blurImg = stageEl.querySelector('.ia-imglayer--blur .ia-img');
    this.sharpImg = stageEl.querySelector('.ia-imglayer--sharp .ia-img');
    this.frame = stageEl.querySelector('.ia-frame');
    this.slider = stageEl.querySelector('.ia-slider');
    this.valEl = stageEl.querySelector('.ia-val');
    this.toggleBtns = [...stageEl.querySelectorAll('.ia-toggle__btn')];
    this.panel = panelEl;
    this.resetBtn = panelEl.querySelector('.ia-editor-reset');
    this.qualityBtn = panelEl.querySelector('.ia-editor-quality');
    this.qualityPreviewActive = false;
    this.qualityPreviewUrl = null;
    this.originalUrl = '';
    this.sourceImg = null;
    this.aspectPills = [...panelEl.querySelectorAll('.ia-aspect-pill')];
    this.moreTrigger = panelEl.querySelector('.ia-more-trigger');
    this.moreMenu = panelEl.querySelector('.ia-more-menu');
    this.resizeTabs = [...panelEl.querySelectorAll('.ia-resize-tab')];
    this.resizeDetails = [...panelEl.querySelectorAll('.ia-resize-detail-panel')];
    this.widthInput = panelEl.querySelector('.ia-width-input');
    this.heightInput = panelEl.querySelector('.ia-height-input');
    this.lockBtn = panelEl.querySelector('.ia-dim-lock');
    this.unitTrigger = panelEl.querySelector('.ia-unit-trigger');
    this.unitLabel = panelEl.querySelector('.ia-unit-label');
    this.unitMenu = panelEl.querySelector('.ia-unit-menu');
    this.unit = 'px';
    this.socialTrigger = panelEl.querySelector('.ia-social-trigger');
    this.socialMenu = panelEl.querySelector('.ia-social-menu');
    this.socialGrids = [...panelEl.querySelectorAll('.ia-social-grid')];
    this.sizeReadout = panelEl.querySelector('.ia-size-readout');
    this.originalSize = 0;
    this.sizeReadoutTimer = null;
    this.sizeReadoutSeq = 0;
    this.hasInteracted = false;
    this.locked = true;
    this.resizeTab = 'custom';
    this.rect = {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    };
    this.naturalW = 0;
    this.naturalH = 0;
    // Custom tab's independent output size — decoupled from `rect` while locked (see
    // onDimensionCommit/startDrag). Only collapses back into `rect` when unlocked.
    this.targetW = 0;
    this.targetH = 0;
    this.selectedRatio = null;
    this.mode = this.isCrop ? 'rotate' : 'quality';
    this.rotate = 0;
    this.zoom = 0;
    this.quality = 100;
    this.idleTimer = null;
    this.bindEvents();
  }

  viewportSize() {
    const { width, height } = this.viewport.getBoundingClientRect();
    return [width, height];
  }

  async setImage(url, originalSize = 0) {
    this.originalSize = originalSize;
    this.hasInteracted = false;
    if (this.qualityPreviewUrl) URL.revokeObjectURL(this.qualityPreviewUrl);
    this.qualityPreviewUrl = null;
    this.qualityPreviewActive = false;
    this.updateQualityBtnState();
    this.originalUrl = url;
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
    // Dedicated, never-swapped source element for pixel operations (size estimate,
    // quality preview) so toggling the quality preview on/off can't compound
    // re-encoding against an already-degraded image.
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
    this.sharpImg.style.clipPath = `inset(${y}% ${100 - (x + w)}% ${100 - (y + h)}% ${x}%)`;
    const transform = `rotate(${this.rotate}deg) scale(${zoomScale(this.zoom)})`;
    this.blurImg.style.transform = transform;
    this.sharpImg.style.transform = transform;
    if (!this.isCrop) this.syncDimensionFields();
  }

  // Pure display of `targetW`/`targetH` — the Custom tab's independent output size.
  // Never reads `rect`: while locked, dragging never touches targetW/targetH (see
  // startDrag), so this must not resync from the frame on every render or it would
  // silently undo that decoupling.
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

  // Real byte size via the browser's own JPEG encoder — not the w*h*3 heuristic the
  // prototype used. Draws the full source image (not just the crop region — Resize's
  // size estimate is about output pixel count + quality, independent of the frame) at
  // the current target dimensions and reads the actual compressed blob size.
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
      this.sizeReadout.textContent = `Original size: ${original} New size: --`;
      return;
    }
    this.sizeReadoutSeq += 1;
    const seq = this.sizeReadoutSeq;
    const { width, height } = this.getResizeDimensions();
    const newSize = await this.computeNewSize(width, height);
    if (seq !== this.sizeReadoutSeq) return; // a newer update superseded this one
    const updated = EditorEngine.formatBytes(newSize);
    this.sizeReadout.textContent = `Original size: ${original} New size: ${updated}`;
  }

  // Resize-only "Quality" button: an explicit, on-demand visual preview of what the
  // current quality slider value actually does to the image, since (unlike rotation)
  // there's no free CSS shortcut for real compression artifacts. Re-encodes the full
  // source at its natural resolution (no crop/resample) so the swapped-in image keeps
  // the exact same dimensions as the original and never disturbs the frame/viewport
  // layout. Always draws from `this.sourceImg` (never the currently-displayed
  // `sharpImg`/`blurImg`) so repeated toggles can't compound re-encoding loss.
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
    this.slider.addEventListener('input', () => this.onSlider());
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
    this.resetBtn?.addEventListener('click', () => this.reset());
    this.qualityBtn?.addEventListener('click', () => this.toggleQualityPreview());
  }

  bindResizeTabEvents() {
    this.resizeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        // Social doesn't switch tabs on its own click — like Crop's More, it opens a
        // dropdown first; picking a platform is what actually switches to it (see
        // bindSocialEvents), same as picking a More option marks that pill active.
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
    // Same as Crop's More trigger reverting to "More" when a different pill is picked
    // (selectAspect's fromMore=false branch) — Social should only show a platform name
    // while it's actually the active tab, not linger after Custom/Standard is chosen.
    if (tab !== this.socialTrigger && this.socialTrigger) this.socialTrigger.textContent = 'Social';
  }

  bindDimensionEvents() {
    if (!this.widthInput) return;
    // Commit on blur/Enter for typed digits — partial input while composing a number
    // should never reshape the frame or recompute the size readout mid-edit. Arrow-key
    // stepping is different: each press is already a complete, atomic change (the
    // browser's native stepUp/stepDown), so it commits immediately, per tick.
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
      // The native step happens between keydown and input, so input.value already
      // reflects the new stepped value by the time this fires.
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

  // Locked: targetW/targetH are independent of the crop frame — updated here,
  // cross-computed from their own current ratio, `rect` is never touched. Unlocked:
  // targetW/targetH and `rect` collapse back into one thing — frameFromDimensions
  // always builds a fresh centered rect from scratch, so this single call both
  // "resets" whatever the frame previously was and reshapes it to the new size.
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
      this.rect = frameFromDimensions(this.targetW, this.targetH, this.naturalW, this.naturalH, vpW, vpH);
    }
    this.hasInteracted = true;
    this.render();
  }

  toggleSocialMenu() {
    const isOpen = !this.socialMenu.classList.contains('hide');
    this.socialMenu.classList.toggle('hide', isOpen);
    this.socialTrigger.setAttribute('aria-expanded', String(!isOpen));
  }

  closeSocialMenu() {
    this.socialMenu?.classList.add('hide');
    this.socialTrigger?.setAttribute('aria-expanded', 'false');
  }

  bindSocialEvents() {
    if (!this.socialTrigger) return;
    this.panel.querySelectorAll('.ia-social-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        const { platform } = opt.dataset;
        this.socialTrigger.textContent = platform;
        this.socialGrids.forEach((grid) => grid.classList.toggle('hide', grid.dataset.platform !== platform));
        this.closeSocialMenu();
        this.selectResizeTab(this.socialTrigger);
      });
    });
    document.addEventListener('click', (e) => {
      if (!this.panel.contains(e.target)) this.closeSocialMenu();
    });
  }

  toggleUnitMenu() {
    const isOpen = !this.unitMenu.classList.contains('hide');
    this.unitMenu.classList.toggle('hide', isOpen);
    this.unitTrigger.setAttribute('aria-expanded', String(!isOpen));
  }

  closeUnitMenu() {
    this.unitMenu?.classList.add('hide');
    this.unitTrigger?.setAttribute('aria-expanded', 'false');
  }

  bindUnitEvents() {
    if (!this.unitTrigger) return;
    this.unitTrigger.addEventListener('click', () => this.toggleUnitMenu());
    this.panel.querySelectorAll('.ia-unit-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        this.unit = opt.dataset.unit;
        if (this.unitLabel) this.unitLabel.textContent = this.unit;
        this.closeUnitMenu();
        this.syncDimensionFields();
      });
    });
    document.addEventListener('click', (e) => {
      if (!this.panel.contains(e.target)) this.closeUnitMenu();
    });
  }

  reset() {
    this.rotate = 0;
    this.zoom = 0;
    this.quality = 100;
    this.revertQualityPreview();
    if (this.isCrop) {
      this.selectAspect(null, 'Freeform');
    } else {
      this.locked = true;
      this.resizeTab = 'custom';
      this.lockBtn?.classList.add('is-active');
      this.lockBtn?.setAttribute('aria-pressed', 'true');
      this.resizeTabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === 'custom'));
      this.resizeDetails.forEach((d) => d.classList.toggle('hide', d.dataset.tab !== 'custom'));
      this.aspectPills.forEach((pill) => pill.classList.remove('is-active'));
      if (this.socialTrigger) this.socialTrigger.textContent = 'Social';
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
    this.setMode(this.isCrop ? 'rotate' : 'quality');
    this.scheduleSizeReadout();
  }

  bindAspectEvents() {
    if (!this.aspectPills.length) return;
    this.aspectPills.forEach((pill) => {
      if (pill === this.moreTrigger) return;
      pill.addEventListener('click', () => {
        const { ratio, label } = pill.dataset;
        this.selectAspect(ratio ? Number(ratio) : null, label);
        this.closeMore();
      });
    });
    this.moreTrigger?.addEventListener('click', () => this.toggleMore());
    this.moreMenu?.querySelectorAll('.ia-more-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        const { ratio, label } = opt.dataset;
        this.selectAspect(Number(ratio), label, true);
        this.closeMore();
      });
    });
    document.addEventListener('click', (e) => {
      if (!this.panel.contains(e.target)) this.closeMore();
    });
  }

  toggleMore() {
    const isOpen = !this.moreMenu.classList.contains('hide');
    if (isOpen) this.closeMore();
    else {
      this.moreMenu.classList.remove('hide');
      this.moreTrigger.setAttribute('aria-expanded', 'true');
    }
  }

  closeMore() {
    this.moreMenu?.classList.add('hide');
    this.moreTrigger?.setAttribute('aria-expanded', 'false');
  }

  selectAspect(ratio, label, fromMore = false) {
    this.selectedRatio = ratio;
    this.aspectPills.forEach((pill) => pill.classList.remove('is-active'));
    if (fromMore) {
      this.moreTrigger.textContent = label;
      this.moreTrigger.classList.add('is-active');
    } else {
      if (this.moreTrigger) this.moreTrigger.textContent = 'More';
      const match = this.aspectPills.find((pill) => pill.dataset.label === label);
      match?.classList.add('is-active');
    }
    if (this.naturalW) {
      const [vpW, vpH] = this.viewportSize();
      this.rect = centeredRect(ratio, this.naturalW, this.naturalH, vpW, vpH);
      // Resize's Standard/Social presets carry no literal target size, only a ratio —
      // seed targetW/targetH from the newly-shaped rect so the Custom tab shows
      // something coherent if the user switches back to it.
      if (!this.isCrop) {
        const b = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
        this.targetW = b.right - b.left;
        this.targetH = b.bottom - b.top;
      }
      this.hasInteracted = true;
      this.render();
    }
  }

  getSourceBounds() {
    const [vpW, vpH] = this.viewportSize();
    return rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, this.zoom);
  }

  // Resize's target output size. Custom tab has its own independent targetW/targetH
  // (decoupled from the crop frame while locked — see onDimensionCommit/startDrag).
  // Standard/Social have no such concept — they only carry an aspect ratio, so their
  // output size is still whatever the selected rect's own natural footprint is.
  getResizeDimensions() {
    if (this.resizeTab === 'custom') return { width: this.targetW, height: this.targetH };
    const [vpW, vpH] = this.viewportSize();
    const b = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
    return { width: b.right - b.left, height: b.bottom - b.top };
  }

  // Crop and Resize's Standard/Social tabs lock drag-resize to whichever aspect pill
  // is selected (this.selectedRatio). Resize's Custom tab has no pill selected at
  // all — there, the lock toggle means "keep whatever ratio the box currently has"
  // (computed from the live rect, not a fixed preset), and unlocked means freeform.
  getDragRatioLock(rect) {
    if (this.isCrop || this.resizeTab !== 'custom') return this.selectedRatio;
    if (!this.locked) return null;
    // rect.w/rect.h are % of the same viewport, uniformly scaled by object-contain, so
    // the object-contain factor cancels out — this is the exact source-pixel ratio,
    // with none of the integer-pixel rounding rectPctToSourceBounds would introduce.
    const [vpW, vpH] = this.viewportSize();
    const w = rect.w * vpW;
    const h = rect.h * vpH;
    return h ? w / h : null;
  }

  startDrag(e, kind) {
    e.preventDefault();
    this.resetIdle();
    this.hasInteracted = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const baseRect = { ...this.rect };
    const [vpW, vpH] = this.viewportSize();
    const trueRatioLock = this.getDragRatioLock(baseRect);
    // resizeRect operates purely on rect.w/rect.h percentages, each normalized by a
    // different axis (vpW vs vpH) — a true ratio (e.g. 16/9) only equals newW%/newH%
    // when vpW === vpH. Converting to percentage-space here keeps resizeRect's own
    // math axis-agnostic while still locking to the real, visual aspect ratio.
    const ratioLock = trueRatioLock ? trueRatioLock * (vpH / vpW) : null;
    const move = (ev) => {
      const dxPct = ((ev.clientX - startX) / vpW) * 100;
      const dyPct = ((ev.clientY - startY) / vpH) * 100;
      this.rect = kind === 'move'
        ? {
          ...baseRect,
          x: clamp(baseRect.x + dxPct, 0, 100 - baseRect.w),
          y: clamp(baseRect.y + dyPct, 0, 100 - baseRect.h),
        }
        : resizeRect(baseRect, kind, dxPct, dyPct, ratioLock);
      this.render();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // Unlocked Custom-tab drag: rect and targetW/targetH are the same thing, so
      // sync the latter to match. Locked: never touch targetW/targetH here — dragging
      // only changes which pixels get sampled, not the output size (see §3 of the
      // design discussion this implements).
      if (!this.isCrop && this.resizeTab === 'custom' && !this.locked) {
        const b = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
        this.targetW = b.right - b.left;
        this.targetH = b.bottom - b.top;
        this.render();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  setMode(mode) {
    this.mode = mode;
    this.toggleBtns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.mode === mode));
    this.slider.min = mode === 'rotate' ? String(ROTATE_MIN) : '0';
    this.slider.max = mode === 'rotate' ? String(ROTATE_MAX) : '100';
    const current = { rotate: this.rotate, zoom: this.zoom, quality: this.quality }[mode];
    this.slider.value = String(current);
    this.updateValLabel();
  }

  onSlider() {
    const value = Number(this.slider.value);
    if (this.mode === 'zoom') this.zoom = value;
    else if (this.mode === 'rotate') this.rotate = value;
    else this.quality = value;
    this.hasInteracted = true;
    // Changing quality invalidates whatever preview is currently shown — revert so the
    // display never silently shows a stale quality level.
    if (this.mode === 'quality') this.revertQualityPreview();
    this.updateValLabel();
    this.render();
  }

  updateValLabel() {
    if (this.mode === 'rotate') this.valEl.textContent = `${this.rotate.toFixed(1)}°`;
    else if (this.mode === 'zoom') this.valEl.textContent = `${Math.round(this.zoom)}%`;
    else this.valEl.textContent = `${Math.round(this.quality)}%`;
  }

  resetIdle() {
    this.frame.classList.remove('ia-frame--idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.frame.classList.add('ia-frame--idle'), IDLE_MS);
  }
}

// Builds a working editor into the given (already-in-document) slot elements and
// returns the engine — self-contained, so the caller (inline-action.js) only needs to
// decide *when* to call this and cache the result, never construct the DOM itself.
export async function initEditor(stageSlot, panelSlot, meta) {
  await new Promise((resolve) => {
    loadStyle(`${getUnityLibs()}/core/widgets/inline-action/editor.css`, resolve);
  });
  const stage = buildEditorStage(meta);
  const panel = buildEditorPanel(meta);
  stageSlot.append(stage);
  panelSlot.append(panel);
  return new EditorEngine(stage, panel, meta);
}
