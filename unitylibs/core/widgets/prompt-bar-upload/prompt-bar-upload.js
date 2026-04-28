/* eslint-disable no-await-in-loop */

import { createTag, getUnityLibs } from '../../../scripts/utils.js';

function placeholderText(root, iconClass) {
  const icon = root.querySelector(`.${iconClass}`) || root.querySelector(`[class*="${iconClass}"]`);
  if (!icon) return '';
  return (icon.closest('li')?.innerText || '').replace(/\s+/g, ' ').trim();
}

function labelForField(root, iconClass, fallback) {
  return placeholderText(root, iconClass) || fallback;
}

function extractLegalFootFromAuthoring(root) {
  const marker = root.querySelector('[class*="icon-legal-terms"]');
  if (!marker) return null;
  const li = marker.closest('li');
  const foot = createTag('div', { class: 'pbu-legal-foot' });
  if (li?.parentElement) {
    while (li.firstChild) foot.append(li.firstChild);
    li.remove();
    return foot;
  }
  foot.append(marker.cloneNode(true));
  marker.remove();
  return foot;
}

function svgIcon(href) {
  return `<svg><use xlink:href="${href}"></use></svg>`;
}

function syncDropdownSelection(list, activeLink) {
  list.querySelectorAll('li').forEach((li) => {
    const a = li.querySelector('a');
    const isActive = a === activeLink;
    li.classList.toggle('selected', isActive);
    a?.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

function closeDropdown(container, triggerBtn, list) {
  container.classList.remove('show-menu');
  list.setAttribute('style', 'display: none;');
  triggerBtn.setAttribute('aria-expanded', 'false');
}

function buildDropdownShell({ label, menuId, extraClass = '', imgEl = null, ariaLabelledBy = null }) {
  const container = createTag('div', {
    class: `models-container${extraClass ? ` ${extraClass}` : ''}`,
    'aria-label': label,
  });

  const nameContainer = createTag('span', { class: 'model-name' });
  const menuIcon = createTag('span', { class: 'menu-icon' }, svgIcon('#unity-chevron-icon'));

  const triggerBtn = createTag('button', {
    type: 'button',
    class: 'selected-model',
    'aria-expanded': 'false',
    'aria-controls': menuId,
    'aria-haspopup': 'listbox',
    role: 'combobox',
  });
  if (imgEl) triggerBtn.append(imgEl, nameContainer, menuIcon);
  else triggerBtn.append(nameContainer, menuIcon);

  const listAttrs = { class: 'verb-list', id: menuId, role: 'listbox' };
  if (ariaLabelledBy) listAttrs['aria-labelledby'] = ariaLabelledBy;
  const list = createTag('ul', listAttrs);
  list.setAttribute('style', 'display: none;');

  container.append(triggerBtn, list);
  return {
    container, triggerBtn, nameContainer, menuIcon, list,
  };
}

function attachDropdownBehavior(container, triggerBtn, list) {
  const getOptions = () => [...list.querySelectorAll('a.model-link')];
  const focusSelectedOrFirst = () => {
    const options = getOptions();
    if (!options.length) return;
    const selected = options.find((option) => option.getAttribute('aria-selected') === 'true');
    (selected || options[0])?.focus();
  };

  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.models-container.show-menu').forEach((other) => {
      if (other === container) return;
      other.classList.remove('show-menu');
      other.querySelector(':scope > .verb-list')?.setAttribute('style', 'display: none;');
      other.querySelector('.selected-model')?.setAttribute('aria-expanded', 'false');
    });
    const isOpen = container.classList.toggle('show-menu');
    if (isOpen) list.removeAttribute('style');
    else list.setAttribute('style', 'display: none;');
    triggerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  triggerBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown(container, triggerBtn, list);
      triggerBtn.focus();
      return;
    }

    if (!['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const isOpen = container.classList.contains('show-menu');
    if (!isOpen) {
      container.classList.add('show-menu');
      list.removeAttribute('style');
      triggerBtn.setAttribute('aria-expanded', 'true');
    }
    focusSelectedOrFirst();
  });

  list.addEventListener('keydown', (e) => {
    const options = getOptions();
    if (!options.length) return;
    const idx = options.findIndex((option) => option === document.activeElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDropdown(container, triggerBtn, list);
      triggerBtn.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = idx < 0 ? 0 : (idx + 1) % options.length;
      options[next]?.focus();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = idx < 0 ? options.length - 1 : (idx - 1 + options.length) % options.length;
      options[next]?.focus();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      options[0]?.focus();
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      options[options.length - 1]?.focus();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const active = idx >= 0 ? options[idx] : options[0];
      active?.click();
    }
  });

  document.addEventListener('click', (e) => {
    if (!container.contains(/** @type {Node} */ (e.target))) {
      closeDropdown(container, triggerBtn, list);
    }
  });
}

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
    this.sizeMap = {};
    this.selectedModelId = '';
    this.selectedAspectRatio = '';
    this.lanaOptions = { sampleRate: 1, tags: 'Unity-FF-PBU' };
    this.showAspectRatio = false;
    this.showMore = false;
    this.actionContainerEl = null;
  }

  async loadModels() {
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    const res = await fetch(`${baseUrl}/unity/configs/prompt/model-picker-video.json`);
    if (!res.ok) throw new Error('Failed to fetch video models.');
    const json = await res.json();
    this.models = json?.content?.data || [];
    this.buildAspectRatioMap();
  }

  buildAspectRatioMap() {
    this.aspectRatioMap = {};
    this.sizeMap = {};
    const parseList = (str) => {
      const s = String(str);
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch { /* fall through to comma-split */ }
      return s.split(',').map((v) => v.trim()).filter(Boolean);
    };
    (this.models || []).forEach((item) => {
      const raw = item['aspect-ratio'];
      if (!item.id || !raw) return;
      const ratios = parseList(raw);
      this.aspectRatioMap[item.id] = ratios;
      const widths = item.width != null ? parseList(item.width) : [];
      const heights = item.height != null ? parseList(item.height) : [];
      this.sizeMap[item.id] = ratios.map((_, i) => ({
        width: Number(widths[i]) || null,
        height: Number(heights[i]) || null,
      }));
    });
  }

  getAspectRatiosForModel(modelId) {
    return this.aspectRatioMap[modelId] || [];
  }

  getSizeForAspectRatio(modelId, ratio) {
    const sizes = this.sizeMap[modelId] || [];
    const ratios = this.aspectRatioMap[modelId] || [];
    const idx = ratios.indexOf(ratio);
    return idx !== -1 ? sizes[idx] : null;
  }

  readFeatureFlags() {
    this.showAspectRatio = !!this.el.querySelector('[class*="icon-show-aspect-ratio"]');
    this.showMore = !!this.el.querySelector('[class*="icon-show-more"]');
  }

  buildModelPicker() {
    if (!this.models?.length) return null;
    const defaultModel = this.models.find((m) => m.default === 'true' || m.default === true) || this.models[0];
    this.selectedModelId = defaultModel?.id || '';

    const imgEl = defaultModel?.icon ? createTag('img', { src: defaultModel.icon, alt: '' }) : null;
    const { container, triggerBtn, nameContainer, list } = buildDropdownShell({
      label: 'Model options',
      menuId: 'pbu-model-menu',
      imgEl,
      ariaLabelledBy: 'listbox-label',
    });
    nameContainer.textContent = (defaultModel?.name || '').trim();

    this.models.forEach((model, idx) => {
      const selectedIcon = createTag('span', { class: 'selected-icon' }, svgIcon('#unity-checkmark-icon'));
      const nameSpan = createTag('span', { class: 'model-name' }, (model.name || model.id || '').trim());
      const link = createTag('a', {
        href: '#',
        class: 'verb-link model-link',
        'data-model-id': model.id,
        'data-model-name': (model.name || '').trim(),
        'data-model-icon': model.icon || '',
        ...(model.version != null && model.version !== '' ? { 'data-model-version': String(model.version) } : {}),
        'aria-selected': idx === 0 ? 'true' : 'false',
        role: 'option',
      });
      link.append(selectedIcon);
      if (model.icon) link.append(createTag('img', { src: model.icon, alt: '' }));
      link.append(nameSpan);
      const li = createTag('li', { class: `verb-item${idx === 0 ? ' selected' : ''}`, role: 'presentation' });
      li.append(link);
      list.append(li);
    });

    list.addEventListener('click', (e) => {
      const link = e.target.closest('a.model-link');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      const modelId = link.getAttribute('data-model-id') || '';
      const modelName = link.getAttribute('data-model-name') || '';
      const modelIcon = link.getAttribute('data-model-icon') || '';
      const modelVersion = link.getAttribute('data-model-version') || '';
      this.selectedModelId = modelId;
      nameContainer.textContent = modelName;
      const triggerIcon = triggerBtn.querySelector(':scope > img');
      if (modelIcon) {
        if (triggerIcon) {
          triggerIcon.setAttribute('src', modelIcon);
        } else {
          triggerBtn.prepend(createTag('img', { src: modelIcon, alt: '' }));
        }
      } else if (triggerIcon) {
        triggerIcon.remove();
      }
      this.widgetWrap?.setAttribute('data-selected-model-id', modelId);
      this.widgetWrap?.setAttribute('data-selected-model-name', modelName);
      if (modelVersion) this.widgetWrap?.setAttribute('data-selected-model-version', modelVersion);
      else this.widgetWrap?.removeAttribute('data-selected-model-version');
      syncDropdownSelection(list, link);
      closeDropdown(container, triggerBtn, list);
      if (this.showAspectRatio) this.updateAspectRatioOptions(modelId);
    });

    triggerBtn.addEventListener('click', () => triggerBtn.dispatchEvent(new CustomEvent('pbu-model-dropdown-open', { bubbles: true })));
    attachDropdownBehavior(container, triggerBtn, list);
    this.widgetWrap?.setAttribute('data-selected-model-id', this.selectedModelId);
    this.widgetWrap?.setAttribute('data-selected-model-name', (defaultModel?.name || '').trim());
    if (defaultModel?.version != null && defaultModel.version !== '') {
      this.widgetWrap?.setAttribute('data-selected-model-version', String(defaultModel.version));
    } else {
      this.widgetWrap?.removeAttribute('data-selected-model-version');
    }
    return container;
  }

  setSelectedAspectRatio(modelId, ratio) {
    this.selectedAspectRatio = ratio;
    this.widgetWrap?.setAttribute('data-selected-aspect-ratio', ratio);
    const size = this.getSizeForAspectRatio(modelId, ratio);
    if (size?.width) this.widgetWrap?.setAttribute('data-selected-width', size.width);
    else this.widgetWrap?.removeAttribute('data-selected-width');
    if (size?.height) this.widgetWrap?.setAttribute('data-selected-height', size.height);
    else this.widgetWrap?.removeAttribute('data-selected-height');
  }

  syncDefaultAttributes() {
    if (!this.widgetWrap || !this.selectedModelId) return;
    const defaultModel = this.models?.find((m) => m.id === this.selectedModelId);
    this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
    this.widgetWrap.setAttribute('data-selected-model-name', (defaultModel?.name || '').trim());
    if (defaultModel?.version != null && defaultModel.version !== '') {
      this.widgetWrap.setAttribute('data-selected-model-version', String(defaultModel.version));
    } else {
      this.widgetWrap.removeAttribute('data-selected-model-version');
    }
    if (this.selectedAspectRatio) {
      this.setSelectedAspectRatio(this.selectedModelId, this.selectedAspectRatio);
    }
  }

  buildAspectRatioDropdown(modelId) {
    const ratios = this.getAspectRatiosForModel(modelId);
    if (!ratios.length) return null;
    this.setSelectedAspectRatio(modelId, ratios[0]);

    const { container, triggerBtn, nameContainer, list } = buildDropdownShell({
      label: 'Aspect ratio',
      menuId: 'pbu-aspect-menu',
      extraClass: 'pbu-aspect-models',
    });
    nameContainer.textContent = ratios[0];

    ratios.forEach((ratio, idx) => {
      const selectedIcon = createTag('span', { class: 'selected-icon' }, svgIcon('#unity-checkmark-icon'));
      const link = createTag('a', {
        href: '#',
        class: 'verb-link model-link',
        'data-ratio': ratio,
        'aria-selected': idx === 0 ? 'true' : 'false',
        role: 'option',
      });
      link.append(selectedIcon, createTag('span', { class: 'model-name' }, ratio));
      const li = createTag('li', { class: `verb-item${idx === 0 ? ' selected' : ''}`, role: 'presentation' });
      li.append(link);
      list.append(li);
    });

    list.addEventListener('click', (e) => {
      const link = e.target.closest('a.model-link');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      const ratio = link.getAttribute('data-ratio') || '';
      nameContainer.textContent = ratio;
      this.setSelectedAspectRatio(modelId, ratio);
      syncDropdownSelection(list, link);
      closeDropdown(container, triggerBtn, list);
    });

    triggerBtn.addEventListener('click', () => triggerBtn.dispatchEvent(new CustomEvent('pbu-ratio-dropdown-open', { bubbles: true })));
    attachDropdownBehavior(container, triggerBtn, list);
    return container;
  }

  updateAspectRatioOptions(modelId) {
    const ac = this.actionContainerEl ?? this.widgetWrap?.querySelector('.action-container');
    ac?.querySelector('.pbu-aspect-models')?.remove();
    const picker = this.buildAspectRatioDropdown(modelId);
    if (!picker || !ac) return;
    const modelPicker = ac.querySelector('.models-container:not(.pbu-aspect-models)');
    if (modelPicker) modelPicker.after(picker);
    else ac.append(picker);
  }

  buildLeftSection() {
    const leftSectionLabel = placeholderText(this.el, 'icon-dropzone-label');
    const uploadLabel = createTag('div', { class: 'unity-slf-copy-label pbu-upload-heading' }, leftSectionLabel);
    const { wrap: dropZoneWrap, ...dropZoneRefs } = this.buildDropZone();
    const leftSection = createTag('div', { class: 'pbu-left-section' });
    leftSection.append(uploadLabel, dropZoneWrap);
    return { leftSection, dropZoneRefs };
  }

  buildRightSection() {
    const promptHeading = placeholderText(this.el, 'icon-placeholder-prompt')
      || labelForField(this.el, 'icon-label-prompt', 'Prompt');
    const promptLabel = createTag('label', {
      for: 'pbuPromptInput',
      class: 'unity-slf-copy-label unity-slf-prompt-label',
    }, promptHeading);

    const promptTextarea = this.buildPromptTextarea();

    const actionContainer = createTag('div', { class: 'action-container' });
    this.actionContainerEl = actionContainer;

    if (this.models?.length) {
      const mp = this.buildModelPicker();
      if (mp) actionContainer.append(mp);
    }
    if (this.showAspectRatio && this.selectedModelId) {
      const ar = this.buildAspectRatioDropdown(this.selectedModelId);
      if (ar) actionContainer.append(ar);
    }
    if (this.showMore) {
      const moreBtn = this.buildMoreButton();
      if (moreBtn) actionContainer.append(moreBtn);
    }

    const actWrap = createTag('div', { class: 'act-wrap' });
    actWrap.append(this.buildGenerateButton());

    const controlsFooter = createTag('div', { class: 'pbu-controls-footer' });
    controlsFooter.append(actionContainer, actWrap);

    const promptBarContainer = createTag('div', { class: 'pbu-prompt-bar-container' });
    promptBarContainer.append(promptLabel, promptTextarea, controlsFooter);

    const rightSection = createTag('div', { class: 'pbu-right-section' });
    rightSection.append(promptBarContainer);
    return rightSection;
  }

  buildDropZone() {
    const allowedFileTypes = this.workflowCfg?.targetCfg?.limits?.allowedFileTypes;
    const fileInput = createTag('input', {
      type: 'file',
      id: 'file-upload',
      accept: allowedFileTypes.join(','),
      hidden: '',
      'aria-hidden': 'true',
    });

    const dropContent = createTag('div', { class: 'pbu-drop-content' });
    dropContent.append(createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/upload.svg` }));
    const dropZone = createTag('div', {
      class: 'drop-zone',
      role: 'button',
      tabindex: '0',
      'aria-label': 'Upload image',
    });
    dropZone.append(fileInput, dropContent);
    dropZone.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      fileInput.click();
    });
    const selectSpinner = createTag('div', { class: 'pbu-select-spinner hidden', 'aria-hidden': 'true', role: 'status' });
    selectSpinner.append(createTag('div', { class: 'pbu-select-spinner-ring' }));

    const previewImg = createTag('img', { class: 'pbu-preview-img', alt: 'Selected image preview' });
    const deleteBtn = createTag('button', { type: 'button', class: 'pbu-delete-btn', 'aria-label': 'Remove image' });
    deleteBtn.innerHTML = svgIcon('#unity-trash-icon');
    const uploadSpinner = createTag('div', { class: 'pbu-spinner hidden', 'aria-label': 'Uploading', role: 'status' });
    const preview = createTag('div', { class: 'pbu-preview hidden', 'aria-hidden': 'true' });
    preview.append(previewImg, deleteBtn, uploadSpinner);

    const wrap = createTag('div', { class: 'pbu-drop-zone-wrap' });
    wrap.append(dropZone, selectSpinner, preview);
    return { wrap, dropZone, preview, previewImg, deleteBtn,};
  }

  buildPromptTextarea() {
    const defaultPrompt = placeholderText(this.el, 'icon-default-prompt') || '';
    const maxCharLimit = this.workflowCfg?.targetCfg?.limits?.['max-char-limit'] ?? 750;
    const textarea = createTag('textarea', {
      id: 'pbuPromptInput',
      class: 'inp-field',
      rows: '1',
      maxlength: String(maxCharLimit),
      'aria-label': defaultPrompt,
      'aria-autocomplete': 'list',
    });
    textarea.value = defaultPrompt;
    textarea.addEventListener('input', () => textarea.dispatchEvent(new CustomEvent('pbu-enter-prompt', { bubbles: true })), { once: true });
    return textarea;
  }

  buildGenerateButton() {
    const generateLi = this.el.querySelector('[class*="icon-generate"]')?.closest('li');
    const genBtnText = (generateLi?.innerText).trim().split('\n')[0] || 'Generate';
    const img = generateLi?.querySelector('img[src*=".svg"]');
    const btn = createTag('a', { href: '#', class: 'unity-act-btn gen-btn', 'daa-ll': 'Generate-video', 'aria-label': genBtnText });
    if (img) {
      img.setAttribute('alt', 'Generate video');
      btn.append(createTag('div', { class: 'btn-ico' }, img));
    }
    if (genBtnText) btn.append(createTag('div', { class: 'btn-txt' }, genBtnText.split('\n')[0]));
    return btn;
  }

  buildMoreButton() {
    if (!this.showMore) return null;
    const moreLi = this.el.querySelector('[class*="icon-more"]')?.closest('li');
    const txt = (moreLi?.innerText || 'More').trim().split('\n')[0] || 'More';
    const btn = createTag('a', { href: '#', class: 'unity-act-btn pbu-more-btn more-btn', 'aria-label': txt });
    btn.append(
      createTag('span', { class: 'btn-ico' }, svgIcon('#unity-more-icon')),
      createTag('div', { class: 'btn-txt' }, txt),
    );
    btn.addEventListener('click', () => btn.dispatchEvent(new CustomEvent('pbu-more-click', { bubbles: true })));
    return btn;
  }

  addWidget() {
    const interactArea = this.target?.querySelector('.copy');
    const { target: anchorSelector, insert } = this.workflowCfg.targetCfg || {};
    const para = anchorSelector ? interactArea?.querySelector(anchorSelector) : null;
    if (para && insert === 'before') para.before(this.widgetWrap);
    else if (para) para.after(this.widgetWrap);
    else interactArea?.appendChild(this.widgetWrap);
  }


  wireImagePreview({ dropZone, preview, previewImg, deleteBtn }) {
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

    this.widgetWrap?.addEventListener('pbu-image-selected', (e) => showPreview(e.detail.file));
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      showDropZone();
      this.widgetWrap?.dispatchEvent(new CustomEvent('pbu-delete-image'));
    });
  }

  async initWidget() {
    this.readFeatureFlags();

    try {
      await this.loadModels();
    } catch (e) {
      window.lana?.log(`Message: Failed to load video models, Error: ${e}`, this.lanaOptions);
    }

    const { leftSection, dropZoneRefs } = this.buildLeftSection();
    const rightSection = this.buildRightSection();
    const main = createTag('div', { class: 'pbu-main' });
    main.append(leftSection, rightSection);
    const skin = this.el.classList.contains('light') ? 'light' : 'dark';
    const interactiveShell = createTag('div', { class: `interactive-area ${skin}` });
    interactiveShell.append(main);
    const root = createTag('div', { class: 'unity-prompt-bar-upload unity-enabled' });
    root.append(interactiveShell);
    const holder = createTag('div', { class: 'unity-pbu-config-holder unity-slf-sr-only' });
    holder.setAttribute('aria-hidden', 'true');
    while (this.el.firstChild) holder.append(this.el.firstChild);
    this.el.append(holder);
    this.el.classList.add('unity-prompt-bar-upload-host');
    const unitySprite = createTag('div', { class: 'unity-sprite-container' });
    unitySprite.innerHTML = this.spriteCon || '';
    const legalFoot = extractLegalFootFromAuthoring(this.el);
    this.widgetWrap = createTag('div', { class: 'ex-unity-wrap verb-options pbu-widget' });
    this.widgetWrap.append(unitySprite, root);
    if (legalFoot) this.widgetWrap.append(legalFoot);
    this.syncDefaultAttributes();

    this.addWidget();
    this.wireImagePreview(dropZoneRefs);
    return this.workflowCfg.targetCfg.actionMap;
  }
}
