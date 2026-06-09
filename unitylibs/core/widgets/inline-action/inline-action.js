import { createTag, defineDeviceByScreenSize } from '../../../scripts/utils.js';
import TransitionScreen from '../../../scripts/transition-screen.js';

const VIEWPORT_IDX = { MOBILE: 0, TABLET: 1, DESKTOP: 2 };

export const InlineActionState = {
  INITIAL: 'initial',
  LOADING: 'loading',
  COMPLETE: 'complete',
};
const DEFAULT_DROPZONE_ICON_IMAGE = '/cc-shared/assets/svg/s2-icon-default-image-20-n.svg';
const DEFAULT_UPLOAD_ICON = '/cc-shared/assets/svg/s2-icon-upload-20-n.svg';

const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
const stripUrls = (text) => normalize(text.replace(/https?:\/\S+/g, ''));

function getImgSrc(pic) {
  const mobile = defineDeviceByScreenSize() === 'MOBILE';
  const source = pic.querySelector(mobile ? 'source[type="image/webp"]:not([media])' : 'source[type="image/webp"][media]');
  return source ? source.srcset.split(' ')[0] : pic.querySelector('img')?.src;
}

function getSvgHref(el) {
  return el?.querySelector('a[href*=".svg"]')?.getAttribute('href')
    || el?.querySelector('img[src$=".svg"]')?.getAttribute('src');
}

function nbaLiText(li, afterIcon = false) {
  const icon = li.querySelector('[class*="icon-nba-"]');
  if (afterIcon && !icon) return '';
  const parts = [];
  let pastIcon = !afterIcon;
  let done = false;
  [...li.childNodes].some((node) => {
    if (done) return true;
    if (node === icon) {
      if (afterIcon) pastIcon = true;
      else done = true;
      return false;
    }
    if (node.nodeName === 'BR') {
      if (!afterIcon) done = true;
      return false;
    }
    if (pastIcon && node.nodeType === Node.TEXT_NODE) parts.push(node.textContent);
    return false;
  });
  return normalize(parts.join(''));
}

function parseNbaIcon(li) {
  const cls = [...(li.querySelector('[class*="icon-nba-"]')?.classList || [])].find((c) => c.startsWith('icon-nba-'));
  return cls?.replace('icon-nba-', '') || null;
}

function uploadLabelFromPara(para) {
  const skip = new Set(['BR', 'PICTURE', 'A', 'IMG', 'SPAN']);
  const parts = [];
  para?.childNodes.forEach((n) => {
    if (skip.has(n.nodeName)) return;
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent);
  });
  return normalize(parts.join(''));
}

const hasUploadMarker = (para) => para?.querySelector(
  'span[class*=icon-share], span[class*=icon-upload], a[href*=".svg"], img[src$=".svg"]:not(.video-container img)',
);

const isViewportColumn = (el) => el?.tagName === 'DIV' && el.querySelector('picture, p')
  && ![...el.children].some((child) => child.tagName === 'DIV' && child.querySelector('picture, p'));

function getViewportBlock(unityEl) {
  const blocks = [...(unityEl.querySelector(':scope > div')?.children || [])].filter(isViewportColumn);
  return blocks[VIEWPORT_IDX[defineDeviceByScreenSize()] ?? 2] ?? blocks.at(-1);
}

function parseViewportCopy(vp) {
  const empty = { heroPic: null, uploadIconHref: undefined, uploadLabel: 'Upload your image', dragHint: '', fileLimit: '', legalHtml: '' };
  if (!vp) return empty;
  const paragraphs = [...vp.querySelectorAll(':scope > p')];
  const bodyParas = paragraphs.slice(0, -1);
  const uploadPara = bodyParas.find(hasUploadMarker);
  const copyParas = bodyParas.filter((p) => p !== uploadPara
    && !(p.querySelector('picture') && !hasUploadMarker(p) && !uploadLabelFromPara(p)));
  return {
    heroPic: vp.querySelector(':scope > p picture'),
    uploadIconHref: getSvgHref(uploadPara),
    uploadLabel: uploadLabelFromPara(uploadPara) || empty.uploadLabel,
    dragHint: copyParas[0]?.textContent.trim() || '',
    fileLimit: copyParas[1]?.textContent.trim() || '',
    legalHtml: paragraphs.at(-1)?.innerHTML || '',
  };
}

function placeholderRowText(root, iconClass) {
  const li = root.querySelector(`.${iconClass}, [class*="${iconClass}"]`)?.closest('li');
  return li ? normalize(li.innerText) : '';
}

export function parseInlineAuthoring(unityEl) {
  const {
    heroPic, uploadIconHref, uploadLabel, dragHint, fileLimit, legalHtml,
  } = parseViewportCopy(getViewportBlock(unityEl));
  const uls = [...unityEl.querySelectorAll(':scope > div ul')];
  const configUl = uls.find((ul) => ul.querySelector('[class*="icon-error"], [class*="icon-operation"]'));
  const nbaUl = uls.find((ul) => ul.querySelector('[class*="icon-nba-"]'));

  const config = {
    operation: 'removeBackground',
    downloadLabel: 'Download',
    downloadIconHref: undefined,
    editIconHref: undefined,
    editLabel: 'Edit in Firefly',
    nbaHeading: 'Do more with this image.',
  };
  configUl?.querySelectorAll('li').forEach((li) => {
    const cls = [...(li.querySelector('[class*="icon-"]')?.classList || [])].find((c) => c.startsWith('icon-'));
    if (!cls) return;
    if (cls.startsWith('icon-operation-')) config.operation = cls.replace('icon-operation-', '');
    else if (cls === 'icon-download') {
      config.downloadLabel = stripUrls(li.textContent) || config.downloadLabel;
      config.downloadIconHref = getSvgHref(li) || config.downloadIconHref;
    } else if (cls === 'icon-aiPhotoEditor') {
      config.editLabel = stripUrls(li.textContent) || config.editLabel;
      config.editIconHref = getSvgHref(li) || config.editIconHref;
    } else if (cls === 'icon-placeholder-nba') config.nbaHeading = li.textContent.trim();
  });

  const nbaCards = [...(nbaUl?.querySelectorAll('li') || [])].map((li) => {
    const nba = parseNbaIcon(li);
    if (!nba) return null;
    const pic = li.querySelector('picture');
    return { label: nbaLiText(li), nba, defaultPrompt: nbaLiText(li, true), src: pic ? getImgSrc(pic) : '' };
  }).filter(Boolean);

  return {
    heroSrc: heroPic ? getImgSrc(heroPic) : '',
    uploadIconHref,
    uploadLabel,
    dragHint,
    fileLimit,
    legalHtml,
    ...config,
    nbaCards,
    loadingText: placeholderRowText(unityEl, 'icon-placeholder-loading')
      || placeholderRowText(unityEl, 'placeholder-loading')
      || 'Uploading image, loading remove background',
  };
}

const svgUse = (id, className = '') => `<svg aria-hidden="true"${className ? ` class="${className}"` : ''}><use xlink:href="#${id}"></use></svg>`;

function appendIconContent(el, { href, spriteId, size, picture = false }) {
  if (href) {
    const img = createTag('img', { src: href, alt: '', loading: 'lazy', ...(size && { width: size, height: size }) });
    el.append(picture ? createTag('picture', {}, img) : img);
  } else el.innerHTML = svgUse(spriteId);
}

function buildUploadActionButton(uploadIconHref, uploadLabel) {
  const button = createTag('a', {
    tabindex: '0',
    class: 'con-button blue action-button button-xl no-track',
    href: '#',
  });
  button.append(
    createTag('picture', {}, createTag('img', { src: uploadIconHref || DEFAULT_UPLOAD_ICON, alt: '', loading: 'lazy' })),
    document.createTextNode(` ${uploadLabel}`),
  );
  return button;
}

function setupInteractiveAreaDragAndDrop(dragTargetEl, widgetEl, dropZone, fileInput) {
  let activeDropZone;
  const isInitial = () => widgetEl.dataset.state === InlineActionState.INITIAL;
  const setActive = () => {
    if (!isInitial() || activeDropZone === dropZone) return;
    activeDropZone?.classList.remove('active');
    (activeDropZone = dropZone).classList.add('active');
  };
  const clearActive = () => {
    activeDropZone?.classList.remove('active');
    activeDropZone = null;
  };
  const onDrag = (event, fn) => {
    if (!isInitial()) return;
    event.preventDefault();
    fn?.(event);
  };

  dragTargetEl.addEventListener('dragenter', (e) => onDrag(e, setActive));
  dragTargetEl.addEventListener('dragover', (e) => onDrag(e, () => {
    e.dataTransfer.dropEffect = 'copy';
    setActive();
  }));
  dragTargetEl.addEventListener('dragleave', (e) => onDrag(e, clearActive));
  dragTargetEl.addEventListener('drop', (e) => onDrag(e, () => {
    setActive();
    const files = e.dataTransfer?.files;
    if (files?.length && fileInput) {
      try { fileInput.files = files; } catch { /* FileList assignment unsupported */ }
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    clearActive();
  }));
  dropZone.addEventListener('drop', clearActive);
  ['dragend', 'drop'].forEach((type) => {
    document.addEventListener(type, clearActive);
    window.addEventListener(type, clearActive);
  });
}

function wireDropZoneUpload(dropZone, uploadButton, fileInput) {
  const openPicker = () => fileInput?.click();
  dropZone.setAttribute('tabindex', '-1');
  dropZone.addEventListener('click', (event) => {
    event.stopPropagation();
    openPicker();
  });
  uploadButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openPicker();
  });
  uploadButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  });
}

function buildDropZoneContainer(meta, progressHolder) {
  const dropZoneContainer = createTag('div', { class: 'drop-zone-container ia-dropzone-shell' });
  const dropZone = createTag('div', { class: 'drop-zone ia-dropzone' });
  const uploadButton = buildUploadActionButton(meta.uploadIconHref, meta.uploadLabel);
  const fileInput = createTag('input', {
    type: 'file',
    name: 'file-upload',
    class: 'file-upload hide ia-file-input',
    accept: 'image/jpeg,image/jpg,image/png,image/webp',
    tabindex: -1,
    'aria-hidden': 'true',
  });
  const uploadActionContainer = createTag('p', { class: 'upload-action-container' });
  uploadActionContainer.append(uploadButton, fileInput);
  const defaultIcon = createTag('p', { class: 'drop-zone-default-icon', 'aria-hidden': 'true' });
  defaultIcon.append(createTag('img', { src: DEFAULT_DROPZONE_ICON_IMAGE, alt: '' }));
  dropZone.append(defaultIcon, uploadActionContainer);
  [['drop-zone-heading', meta.dragHint], ['drop-zone-body', meta.fileLimit]].forEach(([cls, text]) => {
    if (text?.trim()) dropZone.append(createTag('p', { class: cls }, text.trim()));
  });
  const loadingContent = createTag('div', { class: 'ia-loading-content' });
  const progressWrap = createTag('div', { class: 'ia-loading-progress' });
  progressWrap.append(progressHolder);
  loadingContent.append(createTag('p', { class: 'ia-loading-text' }, meta.loadingText), progressWrap);
  dropZone.append(createTag('div', { class: 'ia-loading-visible', 'aria-hidden': 'true' }, loadingContent));
  wireDropZoneUpload(dropZone, uploadButton, fileInput);
  const legal = createTag('p', { class: 'ia-legal' });
  legal.innerHTML = meta.legalHtml;
  dropZoneContainer.append(dropZone, legal);
  return { dropZoneContainer, dropZone, fileInput };
}

function insertInlineActionRoot(el, widgetInstance, widgetEl) {
  const skin = el.classList.contains('light') ? 'light' : 'dark';
  if (skin === 'dark') el.classList.add('dark');
  const root = createTag('div', { class: 'unity-inline-action unity-enabled' });
  root.append(createTag('div', { class: `interactive-area ${skin}` }, widgetEl));
  const holder = createTag('div', { class: 'ia-config-holder ia-sr-only', 'aria-hidden': 'true' });
  while (el.firstChild) holder.append(el.firstChild);
  el.append(holder);
  el.classList.add('unity-inline-action-host');
  if (el.parentNode) el.parentNode.insertBefore(root, el);
  else el.append(root);
  widgetInstance.promptBarExtendedRoot = root;
  return root;
}

export default class InlineActionWidget {
  constructor(target, unityEl, workflowCfg, spriteContent = '') {
    this.target = target;
    this.el = unityEl;
    this.workflowCfg = workflowCfg;
    this.spriteContent = spriteContent;
    this.widget = null;
    this.meta = null;
    this.state = InlineActionState.INITIAL;
    this.progressScreen = null;
  }

  setState(state) {
    this.state = state;
    if (this.widget) this.widget.dataset.state = state;
  }

  setProgress(pct) {
    const holder = this.widget?.querySelector('.ia-loading-visible .progress-holder');
    if (!holder || !this.progressScreen) return;
    this.progressScreen.updateProgressBar(holder, Math.min(100, Math.max(0, Math.round(pct))));
  }

  setResultUrl(url) {
    const img = this.widget?.querySelector('.ia-result-img');
    if (img) img.src = url;
  }

  resetFileInput() {
    const input = this.widget?.querySelector('.ia-file-input');
    if (input) input.value = '';
  }

  openFilePicker() {
    this.resetFileInput();
    this.widget?.querySelector('.ia-file-input')?.click();
  }

  async initWidget() {
    this.meta = parseInlineAuthoring(this.el);
    const root = createTag('div', { class: 'ia-widget', 'data-state': InlineActionState.INITIAL });
    const left = createTag('div', { class: 'ia-panel ia-panel-left' });
    const preview = createTag('div', { class: 'ia-preview' }, createTag('img', { class: 'ia-preview-img', src: this.meta.heroSrc, alt: '' }));
    const checker = createTag('div', { class: 'ia-checker' }, createTag('img', { class: 'ia-result-img', src: '', alt: 'Processed image' }));
    const resultActions = createTag('div', { class: 'ia-result-actions' });
    const reuploadBtn = createTag('button', { type: 'button', class: 'ia-reupload-btn', 'aria-label': 'Upload another image' });
    appendIconContent(reuploadBtn, { href: this.meta.uploadIconHref, spriteId: 'ia-upload-icon', size: 20 });
    const downloadBtn = createTag('button', { type: 'button', class: 'ia-download-btn' });
    appendIconContent(downloadBtn, { href: this.meta.downloadIconHref, spriteId: 'ia-download-icon', size: 18 });
    downloadBtn.append(createTag('span', {}, this.meta.downloadLabel));
    resultActions.append(reuploadBtn, downloadBtn);
    checker.append(resultActions);
    left.append(preview, createTag('div', { class: 'ia-ghost' }), createTag('div', { class: 'ia-result' }, checker));

    const progressHolder = TransitionScreen.createProgressBar();
    const { dropZoneContainer, dropZone, fileInput } = buildDropZoneContainer(this.meta, progressHolder);
    this.progressScreen = new TransitionScreen(progressHolder, () => {}, 100, this.workflowCfg);
    this.progressScreen.progressText = this.meta.loadingText;

    const grid = createTag('div', { class: 'ia-nba-grid' });
    this.meta.nbaCards.forEach((card) => {
      const cardEl = createTag('button', {
        type: 'button',
        class: 'ia-nba-card',
        'data-nba': card.nba,
        'data-default-prompt': card.defaultPrompt,
      });
      cardEl.append(
        createTag('img', { src: card.src, alt: '', class: 'ia-nba-img' }),
        createTag('span', { class: 'ia-nba-label' }, card.label),
        createTag('span', { class: 'ia-nba-arrow' }, `${svgUse('ia-arrow-icon', 'ia-nba-arrow-default')}${svgUse('ia-arrow-icon-hover', 'ia-nba-arrow-hover')}`),
      );
      grid.append(cardEl);
    });
    const editBtn = createTag('button', { type: 'button', class: 'ia-edit-in-firefly', 'aria-label': this.meta.editLabel });
    appendIconContent(editBtn, { href: this.meta.editIconHref, spriteId: 'ia-external-icon', picture: true });
    editBtn.append(createTag('span', {}, this.meta.editLabel));
    const complete = createTag('div', { class: 'ia-complete' });
    complete.append(createTag('p', { class: 'ia-nba-heading' }, this.meta.nbaHeading), grid, editBtn);
    const right = createTag('div', { class: 'ia-panel ia-panel-right' });
    right.append(dropZoneContainer, complete);
    if (this.spriteContent) {
      const sprite = createTag('div', { class: 'ia-sprite hide' });
      sprite.innerHTML = this.spriteContent;
      root.append(sprite);
    }
    root.append(left, right);
    const unityRoot = insertInlineActionRoot(this.el, this, root);
    setupInteractiveAreaDragAndDrop(unityRoot.querySelector('.interactive-area'), root, dropZone, fileInput);
    this.widget = root;

    return {
      '.drop-zone': 'upload',
      '.ia-file-input': 'upload',
      '.ia-nba-card': 'connector',
      '.ia-edit-in-firefly': 'connector',
      '.ia-download-btn': 'download',
      '.ia-reupload-btn': 'reupload',
    };
  }
}
