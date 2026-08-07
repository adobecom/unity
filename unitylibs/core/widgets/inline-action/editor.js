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

export function buildEditorPanel(meta) {
  const panel = createTag('div', { class: 'ia-editor-panel' });
  const header = createTag('div', { class: 'ia-editor-header' });
  const title = meta.operation === 'crop' ? 'Crop your image' : 'Resize your image';
  header.append(
    createTag('span', { class: 'ia-editor-title' }, title),
    createTag('button', {
      type: 'button',
      class: 'ia-editor-reupload ia-reupload-btn',
      'aria-label': 'Upload another image',
    }),
  );
  panel.append(header, createTag('p', { class: 'ia-editor-placeholder' }, 'Aspect ratio controls coming soon.'));
  return panel;
}

export class EditorEngine {
  constructor(stageEl, meta) {
    this.isCrop = meta.operation === 'crop';
    this.viewport = stageEl.querySelector('.ia-viewport');
    this.blurImg = stageEl.querySelector('.ia-imglayer--blur .ia-img');
    this.sharpImg = stageEl.querySelector('.ia-imglayer--sharp .ia-img');
    this.frame = stageEl.querySelector('.ia-frame');
    this.slider = stageEl.querySelector('.ia-slider');
    this.valEl = stageEl.querySelector('.ia-val');
    this.toggleBtns = [...stageEl.querySelectorAll('.ia-toggle__btn')];
    this.rect = {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    };
    this.naturalW = 0;
    this.naturalH = 0;
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
        : resizeRect(baseRect, kind, dxPct, dyPct, null);
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
