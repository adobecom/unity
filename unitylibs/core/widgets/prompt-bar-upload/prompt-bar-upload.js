/* eslint-disable class-methods-use-this */
/* eslint-disable no-await-in-loop */

import { createTag, getUnityLibs } from '../../../scripts/utils.js';

// ─── Constants ─────────────────────────────────────────────────────────────

const ICON = {
  upload: '#pbu-upload-icon',
  trash: '#pbu-trash-icon',
  chevron: '#pbu-chevron-icon',
  check: '#pbu-check-icon',
};

function svg(href, cls = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (cls) el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
  el.appendChild(use);
  return el;
}

// ─── Icon-authoring helpers ─────────────────────────────────────────────────

function placeholderText(root, iconClass) {
  const icon = root.querySelector(`.${iconClass}`) || root.querySelector(`[class*="${iconClass}"]`);
  if (!icon) return '';
  return (icon.closest('li')?.innerText || '').replace(/\s+/g, ' ').trim();
}

// ─── Widget ─────────────────────────────────────────────────────────────────

export default class PromptBarUploadWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.target = target;
    this.el = el;
    this.workflowCfg = workflowCfg;
    this.spriteCon = spriteCon;
    this.widgetWrap = null;
    this.actionMap = {};
    this.models = null;
    this.aspectRatioMap = {};
    this.selectedModelId = '';
    this.selectedAspectRatio = '';
    this.lanaOptions = { sampleRate: 1, tags: 'Unity-FF-PBU' };
    this.showAspectRatio = false;
    this.showMore = false;
  }

  // ─── Model loading ────────────────────────────────────────────────────────

  async loadModels() {
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    const modelFile = `${baseUrl}/unity/configs/prompt/model-picker-video.json`;
    const res = await fetch(modelFile);
    if (!res.ok) throw new Error('Failed to fetch video models.');
    const json = await res.json();
    this.models = json?.content?.data || [];
    this.buildAspectRatioMap();
  }

  buildAspectRatioMap() {
    this.aspectRatioMap = {};
    (this.models || []).forEach((item) => {
      if (item.id && item.aspectRatios) {
        try {
          this.aspectRatioMap[item.id] = JSON.parse(item.aspectRatios);
        } catch {
          this.aspectRatioMap[item.id] = item.aspectRatios.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }
    });
  }

  getAspectRatiosForModel(modelId) {
    return this.aspectRatioMap[modelId] || [];
  }

  // ─── Authoring config ─────────────────────────────────────────────────────

  readAuthoringConfig() {
    const root = this.el;
    this.showAspectRatio = !!root.querySelector('[class*="icon-show-aspect-ratio"]');
    this.showMore = !!root.querySelector('[class*="icon-show-more"]');
  }

  // ─── Build UI ─────────────────────────────────────────────────────────────

  injectSprite() {
    if (!this.spriteCon || document.getElementById('pbu-sprite')) return;
    const wrap = createTag('div', { id: 'pbu-sprite', style: 'display:none', 'aria-hidden': 'true' });
    wrap.innerHTML = this.spriteCon;
    document.body.prepend(wrap);
  }

  buildModelPicker() {
    if (!this.models?.length) return null;
    const defaultModel = this.models.find((m) => m.default === 'true' || m.default === true) || this.models[0];
    this.selectedModelId = defaultModel?.id || '';

    const container = createTag('div', { class: 'pbu-model-picker' });
    const trigger = createTag('button', {
      class: 'pbu-model-trigger',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-label': 'Select model',
    });
    const triggerLabel = createTag('span', { class: 'pbu-model-label' }, defaultModel?.name || '');
    trigger.append(triggerLabel, svg(ICON.chevron, 'pbu-chevron'));

    const list = createTag('ul', {
      class: 'pbu-model-list',
      role: 'listbox',
      'aria-label': 'Model options',
    });

    this.models.forEach((model) => {
      const item = createTag('li', {
        class: `pbu-model-item${model.id === this.selectedModelId ? ' selected' : ''}`,
        role: 'option',
        'data-model-id': model.id,
        'data-model-name': model.name || '',
        'aria-selected': model.id === this.selectedModelId ? 'true' : 'false',
      });
      const checkEl = createTag('span', { class: 'pbu-model-check' }, svg(ICON.check, 'pbu-check-icon'));
      item.append(checkEl, createTag('span', { class: 'pbu-model-name' }, model.name || model.id));
      list.append(item);
    });

    const closeMenu = () => {
      list.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = list.classList.toggle('open');
      trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) document.addEventListener('click', closeMenu, { once: true });
    });

    list.addEventListener('click', (e) => {
      const item = e.target.closest('.pbu-model-item');
      if (!item) return;
      const modelId = item.dataset.modelId;
      const modelName = item.dataset.modelName;
      this.selectedModelId = modelId;
      list.querySelectorAll('.pbu-model-item').forEach((i) => {
        i.classList.toggle('selected', i.dataset.modelId === modelId);
        i.setAttribute('aria-selected', i.dataset.modelId === modelId ? 'true' : 'false');
      });
      triggerLabel.textContent = modelName;
      this.widgetWrap?.setAttribute('data-selected-model-id', modelId);
      this.widgetWrap?.setAttribute('data-selected-model-name', modelName);
      closeMenu();
      if (this.showAspectRatio) this.updateAspectRatioOptions(modelId);
    });

    container.append(trigger, list);

    this.widgetWrap?.setAttribute('data-selected-model-id', this.selectedModelId);
    this.widgetWrap?.setAttribute('data-selected-model-name', defaultModel?.name || '');
    return container;
  }

  buildAspectRatioPicker(modelId) {
    const ratios = this.getAspectRatiosForModel(modelId);
    if (!ratios.length) return null;
    this.selectedAspectRatio = ratios[0];
    this.widgetWrap?.setAttribute('data-selected-aspect-ratio', this.selectedAspectRatio);

    const container = createTag('div', { class: 'pbu-aspect-ratio-picker' });
    const label = createTag('span', { class: 'pbu-aspect-ratio-label' }, 'Aspect ratio');
    const btns = createTag('div', { class: 'pbu-aspect-ratio-btns', role: 'group', 'aria-label': 'Aspect ratio' });
    ratios.forEach((ratio, i) => {
      const btn = createTag('button', {
        class: `pbu-ar-btn${i === 0 ? ' selected' : ''}`,
        'data-ratio': ratio,
        'aria-pressed': i === 0 ? 'true' : 'false',
      }, ratio);
      btn.addEventListener('click', () => {
        btns.querySelectorAll('.pbu-ar-btn').forEach((b) => {
          b.classList.remove('selected');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-pressed', 'true');
        this.selectedAspectRatio = ratio;
        this.widgetWrap?.setAttribute('data-selected-aspect-ratio', ratio);
      });
      btns.append(btn);
    });
    container.append(label, btns);
    return container;
  }

  updateAspectRatioOptions(modelId) {
    const existing = this.widgetWrap?.querySelector('.pbu-aspect-ratio-picker');
    if (existing) existing.remove();
    const picker = this.buildAspectRatioPicker(modelId);
    if (!picker) return;
    const dropZoneEl = this.widgetWrap?.querySelector('.pbu-drop-zone-wrap');
    if (dropZoneEl) dropZoneEl.insertAdjacentElement('beforebegin', picker);
    else this.widgetWrap?.append(picker);
  }

  buildDropZone() {
    const uploadText = placeholderText(this.el, 'icon-placeholder-upload') || 'Upload your image';
    const legalText = placeholderText(this.el, 'icon-placeholder-legal') || '';

    const fileInput = createTag('input', {
      type: 'file',
      id: 'file-upload',
      accept: 'image/jpeg,image/jpg,image/png,image/webp',
      hidden: '',
      'aria-hidden': 'true',
    });

    const dropContent = createTag('div', { class: 'pbu-drop-content' });
    dropContent.append(
      svg(ICON.upload, 'pbu-upload-svg'),
      createTag('span', { class: 'pbu-upload-text' }, uploadText),
    );
    if (legalText) dropContent.append(createTag('p', { class: 'pbu-legal-text' }, legalText));

    const dropZone = createTag('div', { class: 'drop-zone', role: 'button', tabindex: '0', 'aria-label': uploadText });
    dropZone.append(fileInput, dropContent);

    const preview = createTag('div', { class: 'pbu-preview hidden', 'aria-hidden': 'true' });
    const previewImg = createTag('img', { class: 'pbu-preview-img', alt: 'Selected image preview' });
    const deleteBtn = createTag('button', { class: 'pbu-delete-btn', 'aria-label': 'Remove image' });
    deleteBtn.append(svg(ICON.trash, 'pbu-trash-svg'));
    const spinner = createTag('div', { class: 'pbu-spinner hidden', 'aria-label': 'Uploading', role: 'status' });
    preview.append(previewImg, deleteBtn, spinner);

    const wrap = createTag('div', { class: 'pbu-drop-zone-wrap' });
    wrap.append(dropZone, preview);
    return wrap;
  }

  buildPromptArea() {
    const placeholder = placeholderText(this.el, 'icon-placeholder-input') || 'Describe your video...';
    const textarea = createTag('textarea', {
      class: 'inp-field',
      placeholder,
      rows: '1',
      maxlength: '750',
      'aria-label': placeholder,
    });

    const promptWrap = createTag('div', { class: 'pbu-prompt-wrap' });
    promptWrap.append(textarea);
    return promptWrap;
  }

  buildActionButtons() {
    const genBtnCfg = this.el.querySelector('[class*="icon-generate"]');
    const moreBtnCfg = this.el.querySelector('[class*="icon-more"]');

    const genBtnText = genBtnCfg
      ? (genBtnCfg.closest('li')?.innerText || 'Generate').trim()
      : 'Generate';
    const moreBtnText = moreBtnCfg
      ? (moreBtnCfg.closest('li')?.innerText || 'More').trim()
      : 'More';

    const btnRow = createTag('div', { class: 'pbu-btn-row' });
    const genBtn = createTag('a', {
      href: '#',
      class: 'pbu-btn gen-btn',
      'aria-label': genBtnText,
    }, genBtnText);
    btnRow.append(genBtn);

    if (this.showMore) {
      const moreBtn = createTag('a', {
        href: '#',
        class: 'pbu-btn more-btn',
        'aria-label': moreBtnText,
      }, moreBtnText);
      btnRow.append(moreBtn);
    }
    return btnRow;
  }

  addWidget() {
    const interactArea = this.target?.querySelector('.copy');
    const cfg = this.workflowCfg.targetCfg || {};
    const anchorSelector = cfg.target;
    const para = anchorSelector ? interactArea?.querySelector(anchorSelector) : null;
    if (para && cfg.insert === 'before') para.before(this.widgetWrap);
    else if (para) para.after(this.widgetWrap);
    else interactArea?.appendChild(this.widgetWrap);
  }

  // ─── Image preview state ──────────────────────────────────────────────────

  wireImagePreview() {
    const dropZoneWrap = this.widgetWrap?.querySelector('.pbu-drop-zone-wrap');
    if (!dropZoneWrap) return;
    const dropZone = dropZoneWrap.querySelector('.drop-zone');
    const preview = dropZoneWrap.querySelector('.pbu-preview');
    const previewImg = dropZoneWrap.querySelector('.pbu-preview-img');
    const deleteBtn = dropZoneWrap.querySelector('.pbu-delete-btn');

    const showPreview = (file) => {
      const url = URL.createObjectURL(file);
      previewImg.src = url;
      previewImg.onload = () => URL.revokeObjectURL(url);
      dropZone.classList.add('hidden');
      dropZone.setAttribute('aria-hidden', 'true');
      preview.classList.remove('hidden');
      preview.removeAttribute('aria-hidden');
    };

    const showDropZone = () => {
      dropZone.classList.remove('hidden');
      dropZone.removeAttribute('aria-hidden');
      preview.classList.add('hidden');
      preview.setAttribute('aria-hidden', 'true');
      previewImg.src = '';
    };

    this.widgetWrap?.addEventListener('pbu-image-selected', (e) => {
      showPreview(e.detail.file);
    });

    this.widgetWrap?.addEventListener('pbu-image-deleted', () => {
      showDropZone();
    });

    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.widgetWrap?.dispatchEvent(new CustomEvent('pbu-delete-image'));
    });
  }

  // ─── Public initWidget ────────────────────────────────────────────────────

  async initWidget() {
    this.injectSprite();
    this.readAuthoringConfig();

    try {
      await this.loadModels();
    } catch (e) {
      window.lana?.log(`Message: Failed to load video models, Error: ${e}`, this.lanaOptions);
    }

    const widgetWrap = createTag('div', { class: 'ex-unity-wrap pbu-widget' });
    this.widgetWrap = widgetWrap;

    // Model picker (optional — only shown when models loaded)
    if (this.models?.length) {
      const modelPicker = this.buildModelPicker();
      if (modelPicker) widgetWrap.append(modelPicker);
    }

    // Aspect ratio (initial render for default model)
    if (this.showAspectRatio && this.selectedModelId) {
      const arPicker = this.buildAspectRatioPicker(this.selectedModelId);
      if (arPicker) widgetWrap.append(arPicker);
    }

    // Drop zone
    const dropZoneWrap = this.buildDropZone();
    widgetWrap.append(dropZoneWrap);

    // Prompt textarea
    const promptArea = this.buildPromptArea();
    widgetWrap.append(promptArea);

    // Action buttons
    const btnRow = this.buildActionButtons();
    widgetWrap.append(btnRow);

    // Same placement as workflow-firefly prompt-bar: inside `.copy`, relative to `.upload-marquee-prompt-container`
    this.addWidget();

    // Wire preview state machine
    this.wireImagePreview();

    // Build and return the action map consumed by ActionBinder
    this.actionMap = {
      '.gen-btn': [{ actionType: 'generate' }],
      '.more-btn': [{ actionType: 'generate' }],
      '.drop-zone': [{ actionType: 'file-selected' }],
      '#file-upload': [{ actionType: 'file-selected' }],
    };
    return this.actionMap;
  }
}
