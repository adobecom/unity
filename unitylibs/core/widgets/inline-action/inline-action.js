import { createTag, defineDeviceByScreenSize } from '../../../scripts/utils.js';
import TransitionScreen from '../../../scripts/transition-screen.js';

const VIEWPORT_IDX = { MOBILE: 0, TABLET: 1, DESKTOP: 2 };
const DEFAULT_DROPZONE_ICON_IMAGE = '/cc-shared/assets/svg/s2-icon-default-image-20-n.svg';
const DEFAULT_UPLOAD_ICON = '/cc-shared/assets/svg/s2-icon-upload-20-n.svg';

function getImgSrc(pic) {
  const viewport = defineDeviceByScreenSize();
  let source = '';
  if (viewport === 'MOBILE') source = pic.querySelector('source[type="image/webp"]:not([media])');
  else source = pic.querySelector('source[type="image/webp"][media]');
  return source ? source.srcset.split(' ')[0] : pic.querySelector('img')?.src;
}

function textBeforeBr(el) {
  const parts = [];
  el.childNodes.forEach((n) => {
    if (n.nodeName === 'BR') return;
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent);
    else if (n.nodeName !== 'PICTURE' && n.nodeName !== 'SPAN') parts.push(n.textContent);
  });
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function nbaLabelFromLi(li) {
  const icon = li.querySelector('[class*="icon-nba-"]');
  const parts = [];
  [...li.childNodes].some((n) => {
    if (n === icon || n.nodeName === 'BR') return true;
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent);
    return false;
  });
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function textAfterIcon(li) {
  const icon = li.querySelector('[class*="icon-nba-"]');
  if (!icon) return '';
  let found = false;
  const parts = [];
  li.childNodes.forEach((n) => {
    if (n === icon) { found = true; return; }
    if (!found) return;
    if (n.nodeName === 'BR') return;
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent);
  });
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function parseNbaIcon(li) {
  const icon = li.querySelector('[class*="icon-nba-"]');
  if (!icon) return null;
  const cls = [...icon.classList].find((c) => c.startsWith('icon-nba-'));
  return cls?.replace('icon-nba-', '') || null;
}

function uploadLabelFromPara(para) {
  const parts = [];
  para?.childNodes.forEach((n) => {
    if (n.nodeName === 'BR' || n.nodeName === 'PICTURE' || n.nodeName === 'A' || n.nodeName === 'IMG') return;
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent);
    else if (n.nodeName !== 'SPAN') parts.push(n.textContent);
  });
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function hasUploadMarker(para) {
  return para?.querySelector(
    'span[class*=icon-share], span[class*=icon-upload], a[href*=".svg"], img[src$=".svg"]:not(.video-container img)',
  );
}

function getUploadIconHref(uploadPara) {
  if (!uploadPara) return undefined;
  const svgLink = uploadPara.querySelector('a[href*=".svg"]');
  if (svgLink) return svgLink.getAttribute('href');
  const iconImg = uploadPara.querySelector('img[src$=".svg"]');
  if (iconImg) return iconImg.getAttribute('src');
  return undefined;
}

function getIconHrefFromLi(li) {
  if (!li) return undefined;
  const svgLink = li.querySelector('a[href*=".svg"]');
  if (svgLink) return svgLink.getAttribute('href');
  const iconImg = li.querySelector('img[src$=".svg"]');
  if (iconImg) return iconImg.getAttribute('src');
  return undefined;
}

function findPlaceholderIconLi(root, iconClass) {
  const icon = root.querySelector(`.${iconClass}`)
    || root.querySelector(`[class*="${iconClass}"]`);
  return icon?.closest('li') ?? null;
}

function placeholderRowText(root, iconClass) {
  const li = findPlaceholderIconLi(root, iconClass);
  if (!li) return '';
  return (li.innerText || '').replace(/\s+/g, ' ').trim();
}

function isViewportColumn(el) {
  if (el?.tagName !== 'DIV' || !el.querySelector('picture, p')) return false;
  const childColumns = [...el.children].filter(
    (child) => child.tagName === 'DIV' && child.querySelector('picture, p'),
  );
  return childColumns.length < 2;
}

function collectViewportColumns(root) {
  if (!root?.children) return [];
  return [...root.children].filter(isViewportColumn);
}

function findViewportColumnContainer(section) {
  if (!section) return null;
  let bestNode = null;
  let bestCount = 0;
  const queue = [section];
  while (queue.length) {
    const node = queue.shift();
    const cols = collectViewportColumns(node);
    if (cols.length > bestCount) {
      bestCount = cols.length;
      bestNode = node;
    }
    [...node.children].filter((child) => child.tagName === 'DIV').forEach((child) => queue.push(child));
  }
  return bestNode;
}

function getViewportBlocks(unityEl) {
  const section = unityEl.querySelector(':scope > div');
  if (!section) return [];

  const classRoot = section.querySelector('.mobile-up, .tablet-up, .desktop-up')?.parentElement;
  if (classRoot?.querySelector('.desktop-up')) {
    return ['mobile-up', 'tablet-up', 'desktop-up']
      .map((name) => classRoot.querySelector(
        `:scope > .${name}, :scope > .${name}.tablet-up, :scope > .${name}.desktop-up`,
      ))
      .filter(Boolean);
  }

  const container = findViewportColumnContainer(section);
  if (!container) return [];
  return collectViewportColumns(container);
}

function resolveViewportBlock(viewportBlocks) {
  const device = defineDeviceByScreenSize();
  const idx = VIEWPORT_IDX[device] ?? 2;
  if (viewportBlocks[idx]) return viewportBlocks[idx];

  if (idx >= 2) {
    const desktopBlock = viewportBlocks.find((block) => /drag and drop/i.test(block.textContent));
    if (desktopBlock) return desktopBlock;
  }

  return viewportBlocks[Math.min(idx, viewportBlocks.length - 1)];
}

function parseViewportCopy(vp) {
  if (!vp) {
    return {
      heroPic: null,
      uploadIconHref: undefined,
      uploadLabel: 'Upload your image',
      dragHint: '',
      fileLimit: '',
      legalHtml: '',
    };
  }

  const paragraphs = [...vp.querySelectorAll(':scope > p')];
  const terms = paragraphs[paragraphs.length - 1];
  const heroPic = vp.querySelector(':scope > picture, :scope > p picture');
  const mediaPara = heroPic?.closest('p');

  const candidateParagraphs = paragraphs.slice(0, -1).filter(
    (para) => para.textContent.trim() !== '' || para.querySelector('img, svg, a, picture'),
  );

  const uploadPara = candidateParagraphs.find(hasUploadMarker)
    || candidateParagraphs.find((para) => para.querySelector('picture') && uploadLabelFromPara(para))
    || candidateParagraphs.find((para) => para !== mediaPara)
    || candidateParagraphs[0];

  const uploadIconHref = getUploadIconHref(uploadPara);
  const uploadLabel = (uploadPara && uploadLabelFromPara(uploadPara))
    || (uploadPara && textBeforeBr(uploadPara))
    || 'Upload your image';

  const textParas = candidateParagraphs.filter((para) => {
    if (para === uploadPara) return false;
    if (para === mediaPara && !uploadLabelFromPara(para) && !textBeforeBr(para)) return false;
    return true;
  });

  return {
    heroPic,
    uploadIconHref,
    uploadLabel,
    dragHint: textParas[0]?.textContent?.trim() || '',
    fileLimit: textParas[1]?.textContent?.trim() || '',
    legalHtml: terms?.innerHTML || '',
  };
}

export function parseInlineAuthoring(unityEl) {
  const viewportBlocks = getViewportBlocks(unityEl);
  const vp = resolveViewportBlock(viewportBlocks);
  const configUl = [...unityEl.querySelectorAll(':scope > div ul')].find((ul) => ul.querySelector('[class*="icon-error"], [class*="icon-operation"]'));
  const nbaUl = [...unityEl.querySelectorAll(':scope > div ul')].find((ul) => ul.querySelector('[class*="icon-nba-"]'));

  const {
    heroPic, uploadIconHref, uploadLabel, dragHint, fileLimit, legalHtml,
  } = parseViewportCopy(vp);

  let operation = 'removeBackground';
  let downloadLabel = 'Download';
  let downloadIconHref;
  let editIconHref;
  let editLabel = 'Edit in Firefly';
  let nbaHeading = 'Do more with this image.';
  configUl?.querySelectorAll('li').forEach((li) => {
    const icon = li.querySelector('[class*="icon-"]');
    if (!icon) return;
    const cls = [...icon.classList].find((c) => c.startsWith('icon-'));
    if (!cls) return;
    if (cls.startsWith('icon-operation-')) operation = cls.replace('icon-operation-', '');
    else if (cls === 'icon-download') {
      downloadLabel = li.textContent.replace(/https?:\/\S+/g, '').trim() || downloadLabel;
      downloadIconHref = getIconHrefFromLi(li) || downloadIconHref;
    } else if (cls === 'icon-editInFirefly') {
      editLabel = li.textContent.replace(/https?:\/\S+/g, '').trim() || editLabel;
      editIconHref = getIconHrefFromLi(li) || editIconHref;
    } else if (cls === 'icon-placeholder-nba') nbaHeading = li.textContent.trim();
  });

  const loadingText = placeholderRowText(unityEl, 'icon-placeholder-loading')
    || placeholderRowText(unityEl, 'placeholder-loading')
    || 'Uploading image, loading remove background';

  const nbaCards = [...(nbaUl?.querySelectorAll('li') || [])].map((li) => {
    const pic = li.querySelector('picture');
    const nba = parseNbaIcon(li);
    if (!nba) return null;
    return {
      label: nbaLabelFromLi(li),
      nba,
      defaultPrompt: textAfterIcon(li),
      src: pic ? getImgSrc(pic) : '',
    };
  }).filter(Boolean);

  return {
    heroSrc: heroPic ? getImgSrc(heroPic) : '',
    uploadIconHref,
    uploadLabel,
    dragHint,
    fileLimit,
    legalHtml,
    operation,
    downloadLabel,
    downloadIconHref,
    editIconHref,
    editLabel,
    nbaHeading,
    nbaCards,
    loadingText,
  };
}

function svgUse(id) {
  return `<svg aria-hidden="true"><use xlink:href="#${id}"></use></svg>`;
}

function buildDropZoneDefaultIcon() {
  const iconPara = createTag('p', { class: 'drop-zone-default-icon' });
  iconPara.setAttribute('aria-hidden', 'true');
  iconPara.append(createTag('img', { src: DEFAULT_DROPZONE_ICON_IMAGE, alt: '' }));
  return iconPara;
}

function buildUploadActionButton(uploadIconHref, uploadLabel) {
  const iconSrc = uploadIconHref || DEFAULT_UPLOAD_ICON;
  const button = createTag('a', {
    tabindex: '0',
    class: 'con-button blue action-button button-xl no-track',
    href: '#',
  });
  button.append(
    createTag('picture', {}, createTag('img', { src: iconSrc, alt: '', loading: 'lazy' })),
    document.createTextNode(` ${uploadLabel}`),
  );
  return button;
}

function wireDropZoneUpload(dropZone, uploadButton, fileInput) {
  dropZone.setAttribute('tabindex', '-1');
  dropZone.addEventListener('click', (event) => {
    event.stopPropagation();
    fileInput?.click();
  });
  uploadButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    fileInput?.click();
  });
  uploadButton.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  });
}

function buildDropZoneContainer(meta) {
  const dropZoneContainer = createTag('div', { class: 'drop-zone-container' });
  const dropZone = createTag('div', { class: 'drop-zone ia-dropzone' });
  const uploadActionContainer = createTag('p', { class: 'upload-action-container' });
  const uploadButton = buildUploadActionButton(meta.uploadIconHref, meta.uploadLabel);
  const fileInput = createTag('input', {
    type: 'file',
    name: 'file-upload',
    class: 'file-upload hide ia-file-input',
    accept: 'image/jpeg,image/jpg,image/png,image/webp',
    tabindex: -1,
    'aria-hidden': 'true',
  });
  uploadActionContainer.append(uploadButton, fileInput);
  dropZone.append(buildDropZoneDefaultIcon(), uploadActionContainer);
  if (meta.dragHint?.trim()) {
    dropZone.append(createTag('p', { class: 'drop-zone-heading' }, meta.dragHint.trim()));
  }
  if (meta.fileLimit?.trim()) {
    dropZone.append(createTag('p', { class: 'drop-zone-body' }, meta.fileLimit.trim()));
  }
  wireDropZoneUpload(dropZone, uploadButton, fileInput);
  const legal = createTag('p', { class: 'ia-legal' });
  legal.innerHTML = meta.legalHtml;
  dropZoneContainer.append(dropZone, legal);
  return { dropZoneContainer, dropZone, fileInput, legal };
}

function insertInlineActionRoot(el, widgetInstance, widgetEl) {
  const skin = el.classList.contains('light') ? 'light' : 'dark';
  const interactiveShell = createTag('div', { class: `interactive-area ${skin}` });
  interactiveShell.append(widgetEl);
  const root = createTag('div', { class: 'unity-inline-action unity-enabled' });
  root.append(interactiveShell);
  const holder = createTag('div', { class: 'ia-config-holder ia-sr-only' });
  holder.setAttribute('aria-hidden', 'true');
  while (el.firstChild) {
    holder.append(el.firstChild);
  }
  el.append(holder);
  el.classList.add('unity-inline-action-host');
  if (el.parentNode) {
    el.parentNode.insertBefore(root, el);
  } else {
    el.append(root);
  }
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
    this.state = 'initial';
    this.progressScreen = null;
  }

  setState(state) {
    this.state = state;
    if (this.widget) this.widget.dataset.state = state;
  }

  setProgress(pct) {
    const holder = this.widget?.querySelector('.ia-loading-panel .progress-holder');
    if (!holder || !this.progressScreen) return;
    const val = Math.min(100, Math.max(0, Math.round(pct)));
    this.progressScreen.updateProgressBar(holder, val);
  }

  setResultUrl(url) {
    const img = this.widget?.querySelector('.ia-result-img');
    if (img) img.src = url;
  }

  resetFileInput() {
    const input = this.widget?.querySelector('.ia-file-input');
    if (input) input.value = '';
  }

  async initWidget() {
    this.meta = parseInlineAuthoring(this.el);
    const root = createTag('div', { class: 'ia-widget', 'data-state': 'initial' });
    const left = createTag('div', { class: 'ia-panel ia-panel-left' });
    const right = createTag('div', { class: 'ia-panel ia-panel-right' });

    const preview = createTag('div', { class: 'ia-preview' });
    preview.append(createTag('img', { class: 'ia-preview-img', src: this.meta.heroSrc, alt: '' }));

    const ghost = createTag('div', { class: 'ia-ghost' });
    const result = createTag('div', { class: 'ia-result' });
    const checker = createTag('div', { class: 'ia-checker' });
    checker.append(createTag('img', { class: 'ia-result-img', src: '', alt: 'Processed image' }));
    const resultActions = createTag('div', { class: 'ia-result-actions' });
    const reuploadBtn = createTag('button', { type: 'button', class: 'ia-reupload-btn', 'aria-label': 'Upload another image' });
    if (this.meta.uploadIconHref) {
      reuploadBtn.append(createTag('img', {
        src: this.meta.uploadIconHref,
        alt: '',
        width: 20,
        height: 20,
      }));
    } else {
      reuploadBtn.innerHTML = svgUse('ia-upload-icon');
    }
    const downloadBtn = createTag('button', { type: 'button', class: 'ia-download-btn' });
    if (this.meta.downloadIconHref) {
      downloadBtn.append(createTag('img', {
        src: this.meta.downloadIconHref,
        alt: '',
        width: 18,
        height: 18,
      }));
    } else {
      downloadBtn.innerHTML = svgUse('ia-download-icon');
    }
    downloadBtn.append(createTag('span', {}, this.meta.downloadLabel));
    resultActions.append(reuploadBtn, downloadBtn);
    checker.append(resultActions);
    result.append(checker);

    left.append(preview, ghost, result);

    const { dropZoneContainer, legal } = buildDropZoneContainer(this.meta);

    const loading = createTag('div', { class: 'ia-loading' });
    const loadingPanel = createTag('div', { class: 'ia-loading-panel' });
    const progressHolder = TransitionScreen.createProgressBar();
    loadingPanel.append(
      createTag('p', { class: 'ia-loading-text' }, this.meta.loadingText),
      progressHolder,
    );
    loading.append(loadingPanel, legal.cloneNode(true));
    this.progressScreen = new TransitionScreen(progressHolder, () => {}, 100, this.workflowCfg);
    this.progressScreen.progressText = this.meta.loadingText;

    const complete = createTag('div', { class: 'ia-complete' });
    complete.append(createTag('p', { class: 'ia-nba-heading' }, this.meta.nbaHeading));
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
        createTag('span', { class: 'ia-nba-arrow' }, svgUse('ia-arrow-icon')),
      );
      grid.append(cardEl);
    });
    const editBtn = createTag('button', { type: 'button', class: 'ia-edit-firefly' });
    if (this.meta.editIconHref) {
      editBtn.append(createTag('img', {
        src: this.meta.editIconHref,
        alt: '',
        width: 18,
        height: 18,
      }));
    } else {
      editBtn.innerHTML = svgUse('ia-external-icon');
    }
    editBtn.append(createTag('span', {}, this.meta.editLabel));
    complete.append(grid, editBtn);

    right.append(dropZoneContainer, loading, complete);
    if (this.spriteContent) {
      const sprite = createTag('div', { class: 'ia-sprite hide' });
      sprite.innerHTML = this.spriteContent;
      root.append(sprite);
    }
    root.append(left, right);
    insertInlineActionRoot(this.el, this, root);
    this.widget = root;

    return {
      '.drop-zone': 'upload',
      '.ia-file-input': 'upload',
      '.ia-nba-card': 'connector',
      '.ia-edit-firefly': 'connector',
      '.ia-download-btn': 'download',
      '.ia-reupload-btn': 'reupload',
    };
  }
}
