import { createTag, defineDeviceByScreenSize } from '../../../scripts/utils.js';

export const InlineActionState = { INITIAL: 'initial', LOADING: 'loading', COMPLETE: 'complete' };
const VIEWPORT_IDX = { MOBILE: 0, TABLET: 1, DESKTOP: 2 };
const DEFAULT_DROPZONE_ICON_IMAGE = '/cc-shared/assets/svg/s2-icon-default-image-20-n.svg';
const DEFAULT_UPLOAD_ICON = '/cc-shared/assets/svg/s2-icon-upload-20-n.svg';

const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim();
const stripUrls = (text) => normalize(text.replace(/https?:\/\S+/g, ''));
const svgUse = (id, className = '') => `<svg aria-hidden="true"${className ? ` class="${className}"` : ''}><use xlink:href="#${id}"></use></svg>`;

function getImgSrc(pic) {
  const mobile = defineDeviceByScreenSize() === 'MOBILE';
  const source = pic.querySelector(mobile ? 'source[type="image/webp"]:not([media])' : 'source[type="image/webp"][media]');
  return source ? source.srcset.split(' ')[0] : pic.querySelector('img')?.src;
}

const HERO_MEDIA_SELECTOR = 'picture, .video-container.video-holder';
const DEFAULT_UPLOAD_LABEL = 'Upload your image';

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
  if (!video?.hasAttribute('autoplay')) return;
  const play = () => {
    video.muted = true;
    video.play().catch(() => {});
  };
  video.addEventListener('loadeddata', play, { once: true });
  new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting }) => {
      if (isIntersecting) play();
      else if (!video.paused) video.pause();
    });
  }, { threshold: 0.1 }).observe(video);
  play();
}

export function extractHeroMedia(vp) {
  const media = vp?.querySelector(HERO_MEDIA_SELECTOR);
  const preview = createTag('div', { class: 'ia-preview' });
  if (!media) return preview;
  const mediaPara = media.closest('p');
  preview.append(media);
  makeHeroMediaDecorative(preview);
  wirePreviewVideo(preview);
  if (mediaPara?.tagName === 'P' && mediaPara.textContent.trim() === '') {
    mediaPara.remove();
  }
  return preview;
}

function getSvgHref(el) {
  if (!el) return undefined;
  const anchor = [...el.querySelectorAll('a[href*=".svg"]')]
    .find((a) => !a.closest('.video-container'));
  if (anchor) return anchor.getAttribute('href');
  return el.querySelector('img[src*=".svg"]:not(.video-container img)')?.getAttribute('src');
}

function cloneUploadIconEl(para) {
  if (!para) return null;
  const img = para.querySelector('img[src*=".svg"]:not(.video-container img)');
  if (img) return img.cloneNode(true);
  const span = para.querySelector('span[class*=icon-share], span[class*=icon-upload]');
  return span ? span.cloneNode(true) : null;
}

function appendAuthoredUploadIcon(el, { para, href, spriteId, size, picture = false }) {
  const iconEl = cloneUploadIconEl(para);
  if (iconEl?.tagName === 'IMG') {
    el.append(picture ? createTag('picture', {}, iconEl) : iconEl);
    return;
  }
  if (iconEl) {
    el.append(iconEl);
    return;
  }
  appendIconContent(el, { href, spriteId, size, picture });
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

function configRowIconClass(li) {
  const iconEl = li.querySelector(':scope > span[class*="icon-"]');
  return [...(iconEl?.classList || [])].find((c) => c.startsWith('icon-') && c !== 'icon');
}

const hasUploadMarker = (para) => para?.querySelector(
  'span[class*=icon-share], span[class*=icon-upload], a[href*=".svg"], img[src$=".svg"]:not(.video-container img)',
);

const isViewportColumn = (el) => el?.tagName === 'DIV' && el.querySelector(`${HERO_MEDIA_SELECTOR}, p`)
  && ![...el.children].some((child) => child.tagName === 'DIV' && child.querySelector(`${HERO_MEDIA_SELECTOR}, p`));

function getViewportBlock(unityEl) {
  const blocks = [...(unityEl.querySelector(':scope > div')?.children || [])].filter(isViewportColumn);
  return blocks[VIEWPORT_IDX[defineDeviceByScreenSize()] ?? 2] ?? blocks.at(-1);
}

function parseViewportCopy(vp) {
  if (!vp) {
    return { uploadIconHref: undefined, uploadLabel: '', dragHint: '', fileLimit: '', legalHtml: '' };
  }
  const media = vp.querySelector(HERO_MEDIA_SELECTOR);
  const mediaPara = media?.closest('p');
  const paragraphs = [...vp.querySelectorAll(':scope > p')];
  const bodyParas = paragraphs.slice(0, -1);
  const uploadPara = bodyParas.find(hasUploadMarker);
  const uploadIconHref = getSvgHref(uploadPara) || getSvgHref(vp);
  const uploadIconRoot = getSvgHref(uploadPara) ? uploadPara : vp;
  const copyParas = bodyParas.filter((p) => {
    if (p === uploadPara) return false;
    return !(p === mediaPara && !hasUploadMarker(p) && !uploadLabelFromPara(p));
  });
  return {
    uploadPara: uploadIconRoot,
    uploadIconHref,
    uploadLabel: uploadLabelFromPara(uploadPara) || DEFAULT_UPLOAD_LABEL,
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
    uploadPara, uploadIconHref, uploadLabel, dragHint, fileLimit, legalHtml,
  } = parseViewportCopy(getViewportBlock(unityEl));
  const uls = [...unityEl.querySelectorAll(':scope > div ul')];
  const nbaUl = uls.find((ul) => ul.querySelector('[class*="icon-nba-"]'));
  const configUl = uls.find((ul) => ul !== nbaUl && ul.querySelector('[class*="icon-"]'));

  const config = {
    operation: 'removeBackground',
    downloadLabel: 'Download',
    downloadIconHref: undefined,
    editIconHref: undefined,
    editLabel: 'Edit in Firefly',
    reuploadIconHref: undefined,
    nbaHeading: 'Do more with this image.',
  };
  configUl?.querySelectorAll('li').forEach((li) => {
    const cls = configRowIconClass(li);
    if (!cls) return;
    if (cls.startsWith('icon-operation-')) config.operation = cls.replace('icon-operation-', '');
    else if (cls.includes('icon-share')) {
      config.reuploadIconHref = getSvgHref(li) || config.reuploadIconHref;
    } else if (cls === 'icon-download') {
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
    uploadPara,
    uploadIconHref,
    uploadLabel,
    dragHint,
    fileLimit,
    legalHtml,
    ...config,
    nbaCards,
    loadingText: placeholderRowText(unityEl, 'icon-placeholder-loading'),
  };
}

function appendIconContent(el, { href, spriteId, size, picture = false }) {
  if (href) {
    const img = createTag('img', { src: href, alt: '', loading: 'lazy', ...(size && { width: size, height: size }) });
    el.append(picture ? createTag('picture', {}, img) : img);
    return;
  }
  if (spriteId) el.innerHTML = svgUse(spriteId);
}

function buildUploadActionButton(uploadPara, uploadIconHref, uploadLabel) {
  const button = createTag('a', {
    tabindex: '0',
    class: 'con-button blue action-button button-xl no-track',
    href: '#',
  });
  appendAuthoredUploadIcon(button, {
    para: uploadPara, href: uploadIconHref || DEFAULT_UPLOAD_ICON, picture: true,
  });
  if (!button.querySelector('picture, img, span[class*=icon]')) {
    button.append(createTag('picture', {}, createTag('img', {
      src: DEFAULT_UPLOAD_ICON, alt: '', loading: 'lazy',
    })));
  }
  button.append(document.createTextNode(` ${uploadLabel || DEFAULT_UPLOAD_LABEL}`));
  return button;
}

function buildGhostOverlay() {
  const ghost = createTag('div', { class: 'ia-ghost' });
  ghost.append(
    createTag('div', { class: 'ia-ghost-gradient' }),
    createTag('div', { class: 'ia-ghost-mask' }),
    createTag('div', { class: 'ia-ghost-dots' }),
  );
  return ghost;
}

function buildDropZoneContainer(meta, progressHolder) {
  const dropZoneContainer = createTag('div', { class: 'drop-zone-container ia-dropzone-shell' });
  const dropZone = createTag('div', { class: 'drop-zone ia-dropzone' });
  const uploadButton = buildUploadActionButton(meta.uploadPara, meta.uploadIconHref, meta.uploadLabel);
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
  const legal = createTag('p', { class: 'ia-legal' });
  legal.innerHTML = meta.legalHtml;
  dropZoneContainer.append(dropZone, legal);
  return dropZoneContainer;
}

function buildNbaCard(card) {
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
  return cardEl;
}

function buildNbaGrid(nbaCards) {
  const grid = createTag('div', { class: 'ia-nba-grid' });
  nbaCards.forEach((card) => grid.append(buildNbaCard(card)));
  return grid;
}

function buildEditInFireflyButton(meta) {
  const editBtn = createTag('button', {
    type: 'button',
    class: 'ia-edit-in-firefly',
    'aria-label': meta.editLabel,
  });
  if (meta.editIconHref) appendIconContent(editBtn, { href: meta.editIconHref, picture: true });
  editBtn.append(createTag('span', {}, meta.editLabel));
  return editBtn;
}

function buildCompletePanel(meta) {
  const complete = createTag('div', { class: 'ia-complete' });
  complete.append(
    createTag('p', { class: 'ia-nba-heading' }, meta.nbaHeading),
    buildNbaGrid(meta.nbaCards),
    buildEditInFireflyButton(meta),
  );
  return complete;
}

function buildResultSection(meta) {
  const img = createTag('img', {
    class: 'ia-result-img',
    src: '',
    alt: 'Processed image',
    draggable: 'false',
  });
  const checker = createTag('div', { class: 'ia-checker' }, img);
  const resultActions = createTag('div', { class: 'ia-result-actions' });
  const reuploadBtn = createTag('button', {
    type: 'button',
    class: 'ia-reupload-btn',
    'aria-label': 'Upload another image',
  });
  appendAuthoredUploadIcon(reuploadBtn, {
    para: meta.reuploadIconHref ? null : meta.uploadPara,
    href: meta.reuploadIconHref || meta.uploadIconHref,
    spriteId: 'ia-upload-icon',
    size: 20,
  });
  const downloadBtn = createTag('button', { type: 'button', class: 'ia-download-btn' });
  appendIconContent(downloadBtn, { href: meta.downloadIconHref, spriteId: 'ia-download-icon', size: 18 });
  downloadBtn.append(createTag('span', {}, meta.downloadLabel));
  resultActions.append(reuploadBtn, downloadBtn);
  checker.append(resultActions);
  const result = createTag('div', { class: 'ia-result' }, checker);
  result.addEventListener('contextmenu', (e) => { e.preventDefault(); });
  return result;
}

function buildLeftPanel(heroPreview, meta) {
  const left = createTag('div', { class: 'ia-panel ia-panel-left' });
  left.append(heroPreview, buildGhostOverlay(), buildResultSection(meta));
  return left;
}

function buildRightPanel(meta, progressHolder) {
  const right = createTag('div', { class: 'ia-panel ia-panel-right' });
  right.append(buildDropZoneContainer(meta, progressHolder), buildCompletePanel(meta));
  return right;
}

function appendSpriteSheet(root, spriteContent) {
  if (!spriteContent) return;
  const sprite = createTag('div', { class: 'ia-sprite hide' });
  sprite.innerHTML = spriteContent;
  root.append(sprite);
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
  widgetInstance.extendedRoot = root;
  return root;
}

export default class InlineActionWidget {
  constructor(target, unityEl, workflowCfg, spriteContent = '') {
    this.target = target;
    this.el = unityEl;
    this.workflowCfg = workflowCfg;
    this.spriteContent = spriteContent;
    this.widget = null;
    this.parsedData = null;
    this.state = InlineActionState.INITIAL;
    this.progressScreen = null;
  }

  setState(state) {
    const prev = this.state;
    this.state = state;
    if (!this.widget) return;
    this.widget.dataset.state = state;
    if (state === InlineActionState.LOADING && prev === InlineActionState.COMPLETE) {
      this.widget.dataset.loadingLayout = 'complete';
      this.widget.querySelector('.ia-dropzone-shell')?.classList.add('ia-from-complete');
    } else {
      delete this.widget.dataset.loadingLayout;
      this.widget.querySelector('.ia-dropzone-shell')?.classList.remove('ia-from-complete');
    }
  }

  setProgress(pct) {
    const holder = this.widget?.querySelector('.ia-loading-visible .progress-holder');
    if (!holder || !this.progressScreen) return;
    const next = Math.min(100, Math.max(0, Math.round(pct)));
    const current = parseInt(holder.querySelector('.spectrum-ProgressBar')?.getAttribute('value'), 10) || 0;
    const value = next === 0 ? 0 : Math.max(current, next);
    this.progressScreen.updateProgressBar(holder, value);
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
    const viewport = getViewportBlock(this.el);
    this.parsedData = parseInlineAuthoring(this.el);
    const heroPreview = extractHeroMedia(viewport);
    const { default: TransitionScreen } = await import('../../../scripts/transition-screen.js');
    const root = createTag('div', { class: 'ia-widget', 'data-state': InlineActionState.INITIAL });
    const progressHolder = TransitionScreen.createProgressBar();
    const right = buildRightPanel(this.parsedData, progressHolder);

    this.progressScreen = new TransitionScreen(progressHolder, () => {}, 100, this.workflowCfg);
    this.progressScreen.progressText = this.parsedData.loadingText;

    appendSpriteSheet(root, this.spriteContent);
    root.append(buildLeftPanel(heroPreview, this.parsedData), right);

    insertInlineActionRoot(this.el, this, root);
    this.widget = root;

    return this.workflowCfg.targetCfg.actionMap;
  }
}
