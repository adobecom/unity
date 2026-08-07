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
const NBA_STUBS = ['Upscale', 'Prompt to edit', 'Expand', 'Remove object', 'Tune'];

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

export function resizeRect(base, handle, dxPct, dyPct, ratioLock) {
  let left = base.x;
  let top = base.y;
  let right = base.x + base.w;
  let bottom = base.y + base.h;
  const edges = HANDLE_EDGES[handle] || [];
  if (edges.includes('left')) left = clamp(left + dxPct, 0, right - MIN_PCT);
  if (edges.includes('right')) right = clamp(right + dxPct, left + MIN_PCT, 100);
  if (edges.includes('top')) top = clamp(top + dyPct, 0, bottom - MIN_PCT);
  if (edges.includes('bottom')) bottom = clamp(bottom + dyPct, top + MIN_PCT, 100);

  let newW = right - left;
  let newH = bottom - top;
  if (ratioLock) {
    if (edges.includes('left') || edges.includes('right')) {
      newH = newW / ratioLock;
      if (edges.includes('top')) top = bottom - newH;
      else bottom = top + newH;
    } else if (edges.includes('top') || edges.includes('bottom')) {
      newW = newH * ratioLock;
      if (edges.includes('left')) left = right - newW;
      else right = left + newW;
    }
  }
  return {
    x: clamp(left, 0, 100),
    y: clamp(top, 0, 100),
    w: clamp(newW, MIN_PCT, 100),
    h: clamp(newH, MIN_PCT, 100),
  };
}

// Converts the frame's viewport-% rect into source-image pixel bounds — this is what
// actually feeds edits.document.crop.bounds. Ignores rotate/zoom composition for now
// (rotate has no field in the API payload we've seen; zoom-folding is a follow-up).
export function rectPctToSourceBounds(rect, naturalW, naturalH, viewportW, viewportH) {
  const { cs, w: dispW, h: dispH } = containBox(naturalW, naturalH, viewportW, viewportH);
  const offsetX = (viewportW - dispW) / 2;
  const offsetY = (viewportH - dispH) / 2;
  const rectPx = {
    left: (rect.x / 100) * viewportW,
    top: (rect.y / 100) * viewportH,
    width: (rect.w / 100) * viewportW,
    height: (rect.h / 100) * viewportH,
  };
  const left = clamp(Math.round((rectPx.left - offsetX) / cs), 0, naturalW);
  const top = clamp(Math.round((rectPx.top - offsetY) / cs), 0, naturalH);
  const right = clamp(Math.round((rectPx.left + rectPx.width - offsetX) / cs), left, naturalW);
  const bottom = clamp(Math.round((rectPx.top + rectPx.height - offsetY) / cs), top, naturalH);
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
  const bar = createTag('div', { class: 'ia-adjust-bar' });
  const toggle = createTag('div', { class: 'ia-toggle' });
  toggle.append(
    createTag('button', {
      type: 'button',
      class: 'ia-toggle__btn is-active',
      'data-mode': modeA,
      'aria-label': modeA,
    }),
    createTag('button', {
      type: 'button',
      class: 'ia-toggle__btn',
      'data-mode': 'zoom',
      'aria-label': 'zoom',
    }),
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

function buildAspectSection() {
  const section = createTag('div', { class: 'ia-aspect-section' });
  section.append(createTag('p', { class: 'ia-aspect-heading' }, 'Aspect ratio'));
  const row = createTag('div', { class: 'ia-aspect-row' });
  ASPECT_PILLS.forEach(({ label, ratio }, i) => {
    row.append(createTag('button', {
      type: 'button',
      class: `ia-aspect-pill${i === 0 ? ' is-active' : ''}`,
      'data-ratio': ratio ?? '',
      'data-label': label,
    }, label));
  });
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

function buildCtaRow(isCrop) {
  const row = createTag('div', { class: 'ia-cta-row' });
  row.append(
    createTag('button', { type: 'button', class: 'ia-cta-accent' }, isCrop ? 'Crop and download' : 'Resize and download'),
    createTag('button', { type: 'button', class: 'ia-cta-outline' }, 'Open in Firefly'),
  );
  return row;
}

function buildFurtherSection() {
  const section = createTag('div', { class: 'ia-further-section' });
  section.append(createTag('p', { class: 'ia-further-heading' }, 'Take your image further'));
  const grid = createTag('div', { class: 'ia-further-grid' });
  NBA_STUBS.forEach((label) => {
    grid.append(createTag('button', { type: 'button', class: 'ia-further-pill' }, label));
  });
  section.append(grid);
  return section;
}

export function buildEditorPanel(meta) {
  const isCrop = meta.operation === 'crop';
  const panel = createTag('div', { class: 'ia-editor-panel' });
  const header = createTag('div', { class: 'ia-editor-header' });
  header.append(
    createTag('span', { class: 'ia-editor-title' }, isCrop ? 'Crop your image' : 'Resize your image'),
    createTag('button', {
      type: 'button',
      class: 'ia-editor-reupload ia-reupload-btn',
      'aria-label': 'Upload another image',
    }),
  );
  panel.append(header);
  if (isCrop) {
    panel.append(buildAspectSection(), buildCtaRow(isCrop), buildFurtherSection());
  } else {
    panel.append(createTag('p', { class: 'ia-editor-placeholder' }, 'Aspect ratio controls coming soon.'));
  }
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
    this.aspectPills = [...panelEl.querySelectorAll('.ia-aspect-pill')];
    this.moreTrigger = panelEl.querySelector('.ia-more-trigger');
    this.moreMenu = panelEl.querySelector('.ia-more-menu');
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

  async setImage(url) {
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
      this.moreTrigger.textContent = 'More';
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
    return rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH);
  }

  startDrag(e, kind) {
    e.preventDefault();
    this.resetIdle();
    const startX = e.clientX;
    const startY = e.clientY;
    const baseRect = { ...this.rect };
    const [vpW, vpH] = this.viewportSize();
    const move = (ev) => {
      const dxPct = ((ev.clientX - startX) / vpW) * 100;
      const dyPct = ((ev.clientY - startY) / vpH) * 100;
      this.rect = kind === 'move'
        ? {
          ...baseRect,
          x: clamp(baseRect.x + dxPct, 0, 100 - baseRect.w),
          y: clamp(baseRect.y + dyPct, 0, 100 - baseRect.h),
        }
        : resizeRect(baseRect, kind, dxPct, dyPct, this.selectedRatio);
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
