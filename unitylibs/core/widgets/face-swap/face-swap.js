/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file -- UnityWidget duplicated alongside FaceSwapWidget for a single network bundle */

import { createTag, defineDeviceByScreenSize } from '../../../scripts/utils.js';

export const SLOT_IDS = ['original', 'face'];
const VIEWPORT_IDX = { MOBILE: 0, TABLET: 1, DESKTOP: 2 };
const HERO_MEDIA_SELECTOR = 'picture, .video-container.video-holder';
const SLOT_TOKENS = {
  original: { title: 'placeholder-original-image', help: 'original-image-label' },
  face: { title: 'placeholder-face-image', help: 'face-image-label' },
};

let instanceSeq = 0;

const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
const stripUrls = (text) => normalize((text || '').replace(/https?:\/\/\S+/g, ''));
/* Authored icon links render their URL as text flush against the label, so drop those nodes, not a regex match. */
const labelText = (node) => {
  if (!node) return '';
  const clone = node.cloneNode(true);
  clone.querySelectorAll('a, img, picture').forEach((n) => {
    if (n.nodeName !== 'A' || /^https?:\/\//.test(n.textContent.trim())) n.remove();
  });
  return normalize(clone.textContent);
};
const svgUse = (id) => `<svg aria-hidden="true" focusable="false"><use xlink:href="#${id}"></use></svg>`;
const emptySlot = () => ({
  file: null,
  previewUrl: null,
  objectUrl: null,
  assetUrl: null,
  name: null,
  source: null,
  status: 'empty',
  galleryIndex: -1,
});

export class UnityWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.spriteCon = spriteCon;
    this.widget = null;
    this.widgetWrap = null;
    this.actionMap = {};
  }
}

function tokenLi(root, name) {
  return root.querySelector(`.icon-${name}`)?.closest('li') || null;
}

export function tokenText(root, name) {
  return labelText(tokenLi(root, name));
}

/**
 * Reads a token whose <li> carries an authored SVG icon plus a label
 * (`:generate:`, `:model-name:`). A plain text read would drop the icon.
 */
export function iconAndText(root, name) {
  const li = tokenLi(root, name);
  if (!li) return { src: '', txt: '' };
  const img = [...li.querySelectorAll('img[src*=".svg"]')].find((i) => !i.closest('.icon'));
  const anchor = li.querySelector('a[href*=".svg"]');
  const src = img?.getAttribute('src') || anchor?.getAttribute('href') || '';
  return { src, txt: labelText(li) };
}

function directRows(el) {
  return [...el.children].filter((n) => n.nodeName === 'DIV');
}

/* Moves the authored legal copy (with its links) out of the hidden config holder. */
function extractLegal(el) {
  const marker = el.querySelector('[class*="icon-legal-terms"]');
  const li = marker?.closest('li');
  if (!li) return null;
  marker.remove();
  const legal = createTag('p', { class: 'fs-legal' });
  while (li.firstChild) legal.append(li.firstChild);
  li.remove();
  if (!legal.textContent.trim()) return null;
  return legal;
}

function galleryLabel(li) {
  const nodes = [...li.childNodes];
  const brIdx = nodes.findIndex((n) => n.nodeName === 'BR');
  const head = brIdx < 0 ? nodes : nodes.slice(0, brIdx);
  return stripUrls(head.filter((n) => n.nodeName !== 'PICTURE').map((n) => n.textContent).join(' '));
}

export function parseFaceSwapAuthoring(el) {
  const rows = directRows(el);
  /* Milo turns token .svg links into <picture>, so the token row must be excluded explicitly. */
  const galleryRow = rows.find((r) => r.querySelector('ul > li picture')
    && !r.querySelector('[class*="icon-"]'));
  const gallery = galleryRow
    ? [...galleryRow.querySelectorAll('ul > li')]
      .filter((li) => li.querySelector('picture'))
      .map((li) => ({ picture: li.querySelector('picture'), label: galleryLabel(li) }))
    : [];
  /* Last qualifying row: the video row is authored at the bottom of the block. */
  const mediaRow = rows.findLast((r) => r !== galleryRow
    && !r.querySelector('ul')
    && r.children.length >= 2
    && r.querySelector(HERO_MEDIA_SELECTOR)) || null;
  const slots = Object.fromEntries(SLOT_IDS.map((id) => [id, {
    title: tokenText(el, SLOT_TOKENS[id].title),
    help: tokenText(el, SLOT_TOKENS[id].help),
  }]));
  return {
    title: tokenText(el, 'placeholder-title'),
    reset: tokenText(el, 'reset') || 'Reset',
    galleryLabel: tokenText(el, 'placeholder-gallery-label'),
    generate: iconAndText(el, 'generate'),
    model: iconAndText(el, 'model-name'),
    slots,
    gallery,
    mediaRow,
  };
}

function prefersReducedMotion() {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function makeHeroMediaDecorative(container) {
  container.querySelectorAll('picture, picture img').forEach((el) => {
    el.setAttribute('tabindex', '-1');
    el.setAttribute('role', 'presentation');
  });
  const img = container.querySelector('picture img');
  if (img) {
    img.loading = 'eager';
    img.setAttribute('fetchpriority', 'high');
  }
}

function wirePreviewVideo(preview) {
  const video = preview.querySelector('video');
  if (!video) return null;
  if (prefersReducedMotion()) {
    video.removeAttribute('autoplay');
    video.pause?.();
    return null;
  }
  if (!video.hasAttribute('autoplay')) return null;
  const play = () => {
    video.muted = true;
    video.play()?.catch(() => {});
  };
  video.addEventListener('loadeddata', play, { once: true });
  const io = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting }) => {
      if (isIntersecting) play();
      else if (!video.paused) video.pause();
    });
  }, { threshold: 0.1 });
  io.observe(video);
  play();
  return io;
}

/**
 * EDS serves authored images as `media_<hash>.<ext>?width=…&optimize=…` renditions.
 * Dropping the query returns the original, so the CTA uploads full quality, not the thumbnail.
 */
export function originalAssetUrl(src) {
  try {
    const url = new URL(src, window.location.href);
    if (/\/media_[0-9a-f]+\.[a-z0-9]+$/i.test(url.pathname)) url.search = '';
    return url.href;
  } catch {
    return src;
  }
}

export function pickViewportCell(mediaRow, device = defineDeviceByScreenSize()) {
  if (!mediaRow) return null;
  const cells = [...mediaRow.children];
  return cells[VIEWPORT_IDX[device] ?? VIEWPORT_IDX.DESKTOP] ?? cells.at(-1) ?? null;
}

export default class FaceSwapWidget extends UnityWidget {
  constructor(...args) {
    super(...args);
    instanceSeq += 1;
    this.uid = instanceSeq;
    this.extendedRoot = null;
    this.parsed = null;
    this.slots = Object.fromEntries(SLOT_IDS.map((id) => [id, emptySlot()]));
    this.slotEls = {};
    this.galleryItems = [];
    this.genBtn = null;
    this.liveRegion = null;
    this.videoObserver = null;
    this.removalObserver = null;
    /* Hooks installed by the action-binder; the widget works standalone without them. */
    this.validateFiles = null;
    this.onPreviewError = null;
  }

  async initWidget() {
    this.parsed = parseFaceSwapAuthoring(this.el);
    this.mount();
    return this.workflowCfg.targetCfg.actionMap;
  }

  emit(name, detail = {}) {
    this.widgetWrap?.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  announce(msg) {
    if (!this.liveRegion) return;
    this.liveRegion.textContent = '';
    if (msg) setTimeout(() => { this.liveRegion.textContent = msg; }, 50);
  }

  slotTitle(slotId) {
    return this.parsed?.slots[slotId]?.title || slotId;
  }

  getFilledSlots() {
    return SLOT_IDS
      .map((id) => [id, this.slots[id]])
      .filter(([, s]) => s.file || s.assetUrl);
  }

  focusSlot(slotId) {
    this.slotEls[slotId]?.input.focus();
  }

  /* ---------- DOM ---------- */

  buildHeader() {
    const { title, reset } = this.parsed;
    const header = createTag('div', { class: 'fs-header' });
    header.append(createTag('p', { class: 'fs-title' }, title));
    const resetBtn = createTag('button', { type: 'button', class: 'fs-reset' });
    resetBtn.innerHTML = svgUse('unity-refresh-icon');
    resetBtn.append(createTag('span', { class: 'fs-reset-text' }, reset));
    resetBtn.addEventListener('click', () => this.reset());
    header.append(resetBtn);
    this.resetBtn = resetBtn;
    return header;
  }

  buildSlot(slotId) {
    const { title, help } = this.parsed.slots[slotId];
    const inputId = `fs-input-${slotId}-${this.uid}`;
    const slot = createTag('div', { class: 'fs-slot', 'data-slot': slotId, 'data-state': 'empty' });
    const input = createTag('input', {
      type: 'file',
      id: inputId,
      class: 'fs-input',
      accept: 'image/*',
    });
    const label = createTag('label', { class: 'fs-drop', for: inputId });
    const empty = createTag('span', { class: 'fs-drop-empty' });
    const ico = createTag('span', { class: 'fs-drop-icon' });
    ico.innerHTML = svgUse('unity-upload-icon');
    empty.append(
      ico,
      createTag('span', { class: 'fs-slot-title' }, title),
      createTag('span', { class: 'fs-slot-help' }, help),
    );
    const img = createTag('img', { class: 'fs-slot-img', alt: '', decoding: 'async', hidden: '' });
    const status = createTag('span', { class: 'fs-slot-status unity-slf-sr-only' });
    const spinner = createTag('span', { class: 'fs-spinner', 'aria-hidden': 'true' });
    label.append(empty, img, spinner, status);
    const del = createTag('button', {
      type: 'button',
      class: 'fs-delete',
      'aria-label': `Remove ${title}`,
      hidden: '',
    });
    del.innerHTML = svgUse('unity-trash-icon');
    slot.append(input, label, del);

    input.addEventListener('change', (e) => {
      const files = [...(e.target.files || [])];
      e.target.value = '';
      this.handleFiles(slotId, files, 'upload');
    });
    del.addEventListener('click', () => {
      this.clearSlot(slotId);
      this.announce(`${title} removed`);
      input.focus();
    });
    this.bindDrag(slotId, slot, label);
    this.slotEls[slotId] = { slot, input, label, img, del, status };
    return slot;
  }

  bindDrag(slotId, slot, label) {
    /* Counter, not a bare dragleave: crossing onto a child fires dragleave. */
    let depth = 0;
    const hasFiles = (e) => !!e.dataTransfer?.types && [...e.dataTransfer.types].includes('Files');
    const setOver = (on) => slot.classList.toggle('fs-dragover', on);
    label.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setOver(true);
    });
    label.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    label.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    });
    label.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      setOver(false);
      this.handleFiles(slotId, [...(e.dataTransfer?.files || [])], 'drop');
    });
  }

  buildFooter() {
    const { model, generate } = this.parsed;
    const footer = createTag('div', { class: 'fs-footer' });
    if (model.txt || model.src) {
      /* Static by design: the model cannot be changed, so it is not a control. */
      const modelEl = createTag('div', { class: 'fs-model' });
      if (model.src) {
        modelEl.append(createTag('img', { src: model.src, alt: '', class: 'fs-model-icon', width: 20, height: 20 }));
      }
      modelEl.append(createTag('span', { class: 'fs-model-name' }, model.txt));
      footer.append(modelEl);
    }
    const actWrap = createTag('div', { class: 'act-wrap' });
    const genBtn = createTag('button', { type: 'button', class: 'unity-act-btn gen-btn' });
    if (generate.src) {
      const ico = createTag('span', { class: 'btn-ico' });
      ico.append(createTag('img', { src: generate.src, alt: '', width: 22, height: 22 }));
      genBtn.append(ico);
    }
    genBtn.append(createTag('span', { class: 'btn-txt' }, generate.txt || 'Generate'));
    actWrap.append(genBtn);
    footer.append(actWrap);
    this.genBtn = genBtn;
    return footer;
  }

  buildGallery() {
    const { gallery, galleryLabel: heading } = this.parsed;
    if (!gallery.length) return null;
    const labelId = `fs-gallery-label-${this.uid}`;
    const wrap = createTag('div', { class: 'fs-gallery' });
    if (heading) wrap.append(createTag('p', { class: 'fs-gallery-label', id: labelId }, heading));
    const list = createTag('ul', {
      class: 'fs-gallery-list',
      role: 'listbox',
      'aria-orientation': 'horizontal',
      ...(heading ? { 'aria-labelledby': labelId } : { 'aria-label': 'Image gallery' }),
    });
    this.galleryItems = gallery.map(({ picture, label }, idx) => {
      const item = createTag('li', {
        class: 'fs-gallery-item',
        role: 'option',
        'aria-selected': 'false',
        tabindex: idx === 0 ? '0' : '-1',
        'aria-label': label || `Gallery image ${idx + 1} of ${gallery.length}`,
      });
      const img = picture.querySelector('img');
      if (img) {
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
      }
      item.append(picture);
      item.addEventListener('click', () => this.selectGallery(idx));
      list.append(item);
      return item;
    });
    list.addEventListener('keydown', (e) => this.onGalleryKey(e));
    wrap.append(list);
    return wrap;
  }

  onGalleryKey(e) {
    const items = this.galleryItems;
    const cur = items.indexOf(document.activeElement);
    if (cur < 0) return;
    const move = {
      ArrowRight: cur + 1,
      ArrowDown: cur + 1,
      ArrowLeft: cur - 1,
      ArrowUp: cur - 1,
      Home: 0,
      End: items.length - 1,
    };
    if (e.key in move) {
      e.preventDefault();
      const next = (move[e.key] + items.length) % items.length;
      items[cur].setAttribute('tabindex', '-1');
      items[next].setAttribute('tabindex', '0');
      items[next].focus();
      items[next].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.selectGallery(cur);
    }
  }

  buildPreview() {
    const preview = createTag('div', { class: 'fs-preview' });
    /* Pick one viewport cell at mount; re-picking on resize would restart the video. */
    const cell = pickViewportCell(this.parsed.mediaRow);
    [...(this.parsed.mediaRow?.children || [])].forEach((c) => {
      if (c === cell) return;
      c.querySelectorAll('video').forEach((v) => {
        v.removeAttribute('autoplay');
        v.setAttribute('preload', 'none');
      });
    });
    const media = cell?.querySelector(HERO_MEDIA_SELECTOR);
    if (!media) return preview;
    preview.append(media);
    makeHeroMediaDecorative(preview);
    this.videoObserver = wirePreviewVideo(preview);
    return preview;
  }

  mount() {
    const { el } = this;
    const widgetWrap = createTag('div', { class: 'ex-unity-wrap' });
    const widget = createTag('div', { class: 'ex-unity-widget' });
    const sprite = createTag('div', { class: 'unity-sprite-container unity-slf-sprite', 'aria-hidden': 'true' });
    sprite.innerHTML = this.spriteCon || '';
    this.widgetWrap = widgetWrap;
    this.widget = widget;

    const slots = createTag('div', { class: 'fs-slots' });
    SLOT_IDS.forEach((id) => slots.append(this.buildSlot(id)));
    widget.append(this.buildHeader(), slots, this.buildFooter());
    const gallery = this.buildGallery();
    if (gallery) widget.append(createTag('div', { class: 'fs-divider', role: 'presentation' }), gallery);
    this.liveRegion = createTag('div', { class: 'fs-live unity-slf-sr-only', 'aria-live': 'polite', role: 'status' });
    widgetWrap.append(sprite, widget, this.liveRegion);

    const left = createTag('div', { class: 'unity-slf-left' });
    left.append(widgetWrap);
    const right = createTag('div', { class: 'unity-slf-right' });
    right.append(this.buildPreview());
    const main = createTag('div', { class: 'unity-slf-main' });
    main.append(left, right);
    const skin = el.classList.contains('light') ? 'light' : 'dark';
    const shell = createTag('div', { class: `interactive-area ${skin}` });
    shell.append(main);
    const root = createTag('div', { class: 'unity-face-swap unity-enabled' });
    root.append(shell);
    const legal = extractLegal(el);
    if (legal) root.append(legal);
    /* A drop that misses a slot must not make the browser navigate to the file. */
    ['dragover', 'drop'].forEach((t) => root.addEventListener(t, (e) => {
      if (e.dataTransfer?.types && [...e.dataTransfer.types].includes('Files')) e.preventDefault();
    }));

    const holder = createTag('div', { class: 'unity-slf-config-holder unity-slf-sr-only', 'aria-hidden': 'true' });
    while (el.firstChild) holder.append(el.firstChild);
    el.append(holder);
    el.classList.add('unity-face-swap-host');
    if (el.parentNode) el.parentNode.insertBefore(root, el);
    else el.append(root);
    this.extendedRoot = root;

    this.removalObserver = new MutationObserver(() => {
      if (!root.isConnected) this.teardown();
    });
    this.removalObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  teardown() {
    this.removalObserver?.disconnect();
    this.removalObserver = null;
    this.videoObserver?.disconnect();
    this.videoObserver = null;
    SLOT_IDS.forEach((id) => this.revoke(this.slots[id]));
  }

  /* ---------- slot state ---------- */

  revoke(slot) {
    if (slot.objectUrl) URL.revokeObjectURL(slot.objectUrl);
    slot.objectUrl = null;
  }

  render(slotId) {
    const s = this.slots[slotId];
    const els = this.slotEls[slotId];
    if (!els) return;
    els.slot.dataset.state = s.status;
    const hasImage = s.status !== 'empty';
    els.del.hidden = !hasImage;
    els.img.hidden = !s.previewUrl;
    els.status.textContent = hasImage && s.name ? `, ${s.name}` : '';
  }

  setSlot(slotId, next) {
    const s = this.slots[slotId];
    const els = this.slotEls[slotId];
    this.revoke(s);
    Object.assign(s, emptySlot(), next, { status: 'busy' });
    /* Spinner is driven by the real <img> lifecycle; a stale load for a replaced image is ignored. */
    const token = Symbol('load');
    els.loadToken = token;
    const done = (ok) => {
      if (els.loadToken !== token) return;
      if (ok) {
        s.status = 'ready';
        this.render(slotId);
        this.announce(`${this.slotTitle(slotId)} added`);
      } else {
        this.clearSlot(slotId);
        this.onPreviewError?.(slotId);
      }
    };
    els.img.onload = () => done(true);
    els.img.onerror = () => done(false);
    this.render(slotId);
    this.announce(`Loading ${this.slotTitle(slotId)}`);
    els.img.src = s.previewUrl;
  }

  handleFiles(slotId, files, source) {
    if (!files.length) return false;
    if (this.validateFiles && !this.validateFiles(files, slotId)) return false;
    const [file] = files;
    if (slotId === SLOT_IDS[0]) this.markGallery(-1);
    const objectUrl = URL.createObjectURL(file);
    this.setSlot(slotId, {
      file,
      objectUrl,
      previewUrl: objectUrl,
      name: file.name,
      source,
    });
    this.emit('fs-slot-selected', { slotId, file, source });
    return true;
  }

  selectGallery(idx) {
    const item = this.galleryItems[idx];
    const img = item?.querySelector('img');
    if (!img) return;
    const slotId = SLOT_IDS[0];
    this.markGallery(idx);
    /* No fetch here: the thumb is already loaded, so the preview is a cache hit.
       The File is materialised from `assetUrl` only when the CTA is clicked. */
    this.setSlot(slotId, {
      previewUrl: img.currentSrc || img.src,
      assetUrl: originalAssetUrl(img.src),
      name: item.getAttribute('aria-label') || '',
      source: 'gallery',
      galleryIndex: idx,
    });
    this.emit('fs-slot-selected', { slotId, source: 'gallery', galleryIndex: idx });
  }

  markGallery(idx) {
    this.galleryItems.forEach((it, i) => {
      const on = i === idx;
      it.classList.toggle('selected', on);
      it.setAttribute('aria-selected', on ? 'true' : 'false');
      if (idx >= 0) it.setAttribute('tabindex', on ? '0' : '-1');
    });
  }

  clearSlot(slotId) {
    const s = this.slots[slotId];
    const wasFilled = s.status !== 'empty';
    this.revoke(s);
    Object.assign(s, emptySlot());
    const els = this.slotEls[slotId];
    if (els) {
      els.loadToken = null;
      els.img.onload = null;
      els.img.onerror = null;
      els.img.removeAttribute('src');
    }
    if (slotId === SLOT_IDS[0]) this.markGallery(-1);
    this.render(slotId);
    if (wasFilled) this.emit('fs-slot-cleared', { slotId });
    return wasFilled;
  }

  reset() {
    const cleared = SLOT_IDS.map((id) => this.clearSlot(id)).some(Boolean);
    this.galleryItems.forEach((it, i) => it.setAttribute('tabindex', i === 0 ? '0' : '-1'));
    if (!cleared) return false;
    this.emit('fs-reset');
    this.announce('Images cleared');
    this.focusSlot(SLOT_IDS[0]);
    return true;
  }
}
