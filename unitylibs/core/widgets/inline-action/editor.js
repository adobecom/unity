import { createTag } from '../../../scripts/utils.js';

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
  section.append(row);
  return section;
}

function buildDimensionField(labelText, className) {
  const field = createTag('div', { class: 'ia-dim-field' });
  field.append(
    createTag('label', { class: 'ia-dim-label' }, labelText),
    createTag('input', { type: 'number', class: className, min: '1', inputmode: 'numeric' }),
  );
  return field;
}

function buildCustomDetail() {
  const detail = createTag('div', { class: 'ia-resize-detail-panel', 'data-tab': 'custom' });
  const fields = createTag('div', { class: 'ia-dim-fields' });
  fields.append(
    buildDimensionField('Width', 'ia-width-input'),
    createTag('button', { type: 'button', class: 'ia-dim-lock is-active', 'aria-label': 'Lock aspect ratio', 'aria-pressed': 'true' }, '🔒'),
    buildDimensionField('Height', 'ia-height-input'),
    createTag('span', { class: 'ia-dim-unit' }, 'px'),
  );
  const readout = createTag('p', { class: 'ia-size-readout' }, 'Original size: -- New size: --');
  detail.append(fields, readout);
  return detail;
}

function buildStandardDetail() {
  const detail = createTag('div', { class: 'ia-resize-detail-panel hide', 'data-tab': 'standard' });
  const grid = createTag('div', { class: 'ia-aspect-row' });
  RESIZE_STANDARD.forEach(({ label, ratio }) => grid.append(buildAspectPill(label, ratio)));
  detail.append(grid);
  return detail;
}

function buildSocialDetail() {
  const detail = createTag('div', { class: 'ia-resize-detail-panel hide', 'data-tab': 'social' });
  const platformWrap = createTag('div', { class: 'ia-more' });
  const platformMenu = createTag('div', { class: 'ia-more-menu hide' });
  const grids = createTag('div', { class: 'ia-social-grids' });
  Object.entries(RESIZE_SOCIAL).forEach(([platform, ratios]) => {
    platformMenu.append(createTag('button', { type: 'button', class: 'ia-social-opt', 'data-platform': platform }, platform));
    const grid = createTag('div', { class: 'ia-aspect-row ia-social-grid hide', 'data-platform': platform });
    ratios.forEach(({ label, ratio }) => grid.append(buildAspectPill(label, ratio)));
    grids.append(grid);
  });
  const platformTrigger = createTag('button', {
    type: 'button',
    class: 'ia-social-trigger',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
  }, 'Choose a platform');
  platformWrap.append(platformTrigger, platformMenu);
  detail.append(platformWrap, grids);
  return detail;
}

function buildResizeAspectSection() {
  const section = createTag('div', { class: 'ia-aspect-section' });
  section.append(createTag('p', { class: 'ia-aspect-heading' }, 'Aspect ratio'));
  const tabs = createTag('div', { class: 'ia-resize-tabs' });
  ['Custom', 'Standard', 'Social'].forEach((label, i) => {
    tabs.append(createTag('button', {
      type: 'button',
      class: `ia-resize-tab${i === 0 ? ' is-active' : ''}`,
      'data-tab': label.toLowerCase(),
    }, label));
  });
  section.append(tabs, buildCustomDetail(), buildStandardDetail(), buildSocialDetail());
  return section;
}

function buildCtaRow(isCrop) {
  const row = createTag('div', { class: 'ia-cta-row' });
  row.append(
    createTag('button', { type: 'button', class: 'ia-cta-accent' }, isCrop ? 'Crop and download' : 'Resize and download'),
    createTag('button', { type: 'button', class: 'ia-cta-outline' }, 'Open in Firefly'),
  );
  return row;
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
  actions.append(
    createTag('button', { type: 'button', class: 'ia-editor-reset' }, 'Reset'),
    createTag('button', {
      type: 'button',
      class: 'ia-editor-reupload ia-reupload-btn',
      'aria-label': 'Upload another image',
    }, 'Upload'),
  );
  header.append(
    createTag('span', { class: 'ia-editor-title' }, isCrop ? 'Crop your image' : 'Resize your image'),
    actions,
  );
  panel.append(header);
  const aspectSection = isCrop ? buildCropAspectSection() : buildResizeAspectSection();
  panel.append(aspectSection, buildCtaRow(isCrop), buildFurtherSection(isCrop));
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
    this.aspectPills = [...panelEl.querySelectorAll('.ia-aspect-pill')];
    this.moreTrigger = panelEl.querySelector('.ia-more-trigger');
    this.moreMenu = panelEl.querySelector('.ia-more-menu');
    this.resizeTabs = [...panelEl.querySelectorAll('.ia-resize-tab')];
    this.resizeDetails = [...panelEl.querySelectorAll('.ia-resize-detail-panel')];
    this.widthInput = panelEl.querySelector('.ia-width-input');
    this.heightInput = panelEl.querySelector('.ia-height-input');
    this.lockBtn = panelEl.querySelector('.ia-dim-lock');
    this.socialTrigger = panelEl.querySelector('.ia-social-trigger');
    this.socialMenu = this.socialTrigger?.parentElement.querySelector('.ia-more-menu');
    this.socialGrids = [...panelEl.querySelectorAll('.ia-social-grid')];
    this.sizeReadout = panelEl.querySelector('.ia-size-readout');
    this.originalSize = 0;
    this.sizeReadoutTimer = null;
    this.sizeReadoutSeq = 0;
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
    this.blurImg.src = url;
    this.sharpImg.src = url;
    if (!(this.sharpImg.complete && this.sharpImg.naturalWidth)) {
      await new Promise((resolve) => {
        this.sharpImg.addEventListener('load', resolve, { once: true });
      });
    }
    this.naturalW = this.sharpImg.naturalWidth;
    this.naturalH = this.sharpImg.naturalHeight;
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

  // Resize has no separate width/height state — rect stays the single source of
  // truth (dragging, presets, and typed dimensions all just set rect), and the
  // Custom fields are a pure display of whatever rect currently is.
  syncDimensionFields() {
    if (!this.widthInput || !this.naturalW) return;
    const [vpW, vpH] = this.viewportSize();
    const b = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
    if (document.activeElement !== this.widthInput) this.widthInput.value = b.right - b.left;
    if (document.activeElement !== this.heightInput) this.heightInput.value = b.bottom - b.top;
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
  computeNewSize() {
    return new Promise((resolve) => {
      const { width, height } = this.getResizeDimensions();
      if (!width || !height) { resolve(null); return; }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(this.sharpImg, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob?.size ?? null), 'image/jpeg', this.quality / 100);
    });
  }

  scheduleSizeReadout() {
    if (!this.sizeReadout) return;
    clearTimeout(this.sizeReadoutTimer);
    this.sizeReadoutTimer = setTimeout(() => this.updateSizeReadout(), 150);
  }

  async updateSizeReadout() {
    this.sizeReadoutSeq += 1;
    const seq = this.sizeReadoutSeq;
    const newSize = await this.computeNewSize();
    if (seq !== this.sizeReadoutSeq) return; // a newer update superseded this one
    const original = EditorEngine.formatBytes(this.originalSize);
    const updated = EditorEngine.formatBytes(newSize);
    this.sizeReadout.textContent = `Original size: ${original} New size: ${updated}`;
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
    this.resetBtn?.addEventListener('click', () => this.reset());
  }

  bindResizeTabEvents() {
    this.resizeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.resizeTab = tab.dataset.tab;
        this.resizeTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        this.resizeDetails.forEach((d) => d.classList.toggle('hide', d.dataset.tab !== tab.dataset.tab));
      });
    });
  }

  bindDimensionEvents() {
    if (!this.widthInput) return;
    this.widthInput.addEventListener('input', () => this.onDimensionInput('width'));
    this.heightInput.addEventListener('input', () => this.onDimensionInput('height'));
    this.lockBtn.addEventListener('click', () => {
      this.locked = !this.locked;
      this.lockBtn.classList.toggle('is-active', this.locked);
      this.lockBtn.setAttribute('aria-pressed', String(this.locked));
    });
  }

  onDimensionInput(axis) {
    if (!this.naturalW) return;
    const raw = Number(axis === 'width' ? this.widthInput.value : this.heightInput.value);
    if (!raw || raw <= 0) return;
    const [vpW, vpH] = this.viewportSize();
    const current = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
    let width = current.right - current.left;
    let height = current.bottom - current.top;
    if (axis === 'width') width = raw;
    else height = raw;
    if (this.locked) {
      const naturalRatio = this.naturalW / this.naturalH;
      if (axis === 'width') height = Math.round(width / naturalRatio);
      else width = Math.round(height * naturalRatio);
    }
    this.rect = frameFromDimensions(width, height, this.naturalW, this.naturalH, vpW, vpH);
    this.render();
  }

  bindSocialEvents() {
    if (!this.socialTrigger) return;
    this.socialTrigger.addEventListener('click', () => {
      const isOpen = !this.socialMenu.classList.contains('hide');
      this.socialMenu.classList.toggle('hide', isOpen);
      this.socialTrigger.setAttribute('aria-expanded', String(!isOpen));
    });
    this.panel.querySelectorAll('.ia-social-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        const { platform } = opt.dataset;
        this.socialTrigger.textContent = platform;
        this.socialGrids.forEach((grid) => grid.classList.toggle('hide', grid.dataset.platform !== platform));
        this.socialMenu.classList.add('hide');
        this.socialTrigger.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('click', (e) => {
      if (!this.panel.contains(e.target)) this.socialMenu?.classList.add('hide');
    });
  }

  reset() {
    this.rotate = 0;
    this.zoom = 0;
    this.quality = 100;
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
      if (this.socialTrigger) this.socialTrigger.textContent = 'Choose a platform';
      if (this.naturalW) {
        const [vpW, vpH] = this.viewportSize();
        this.rect = centeredRect(null, this.naturalW, this.naturalH, vpW, vpH);
        this.render();
      }
    }
    this.setMode(this.isCrop ? 'rotate' : 'quality');
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
      this.render();
    }
  }

  getSourceBounds() {
    const [vpW, vpH] = this.viewportSize();
    // Resize's zoom is inspection-only (doesn't affect output) per the design — only
    // fold it in for Crop, where zooming behind a fixed frame changes the real selection.
    const zoomForBounds = this.isCrop ? this.zoom : 0;
    return rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, zoomForBounds);
  }

  // Resize's target output size — same bounds-width/height reuse as syncDimensionFields,
  // since rect stays the one source of truth rather than duplicating width/height state.
  getResizeDimensions() {
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
