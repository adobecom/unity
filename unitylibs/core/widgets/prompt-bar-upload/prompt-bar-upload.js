/* eslint-disable class-methods-use-this */
/* eslint-disable no-await-in-loop */

import { createTag, getUnityLibs } from '../../../scripts/utils.js';

// ─── Constants ─────────────────────────────────────────────────────────────

export const ICON = {
  upload: '#pbu-upload-icon',
  trash: '#pbu-trash-icon',
  chevron: '#pbu-chevron-icon',
  check: '#pbu-check-icon',
};

function svgUse(href, cls = '') {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (cls) el.setAttribute('class', cls);
  el.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
  el.appendChild(use);
  return el;
}

function menuChevronSvg() {
  return svgUse(ICON.chevron, 'pbu-menu-chevron-svg');
}

function moreIconSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('aria-hidden', 'true');
  const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p1.setAttribute('d', 'm1.75,6.77148h2.6687c.34064,1.43018,1.62128,2.5,3.15405,2.5s2.81342-1.06982,3.15405-2.5h7.52319c.41406,0,.75-.33594.75-.75s-.33594-.75-.75-.75h-7.52319c-.34064-1.43018-1.62128-2.5-3.15405-2.5s-2.81342,1.06982-3.15405,2.5H1.75c-.41406,0-.75.33594-.75.75s.33594.75.75.75Zm5.82275-2.5c.96484,0,1.75.78516,1.75,1.75s-.78516,1.75-1.75,1.75-1.75-.78516-1.75-1.75.78516-1.75,1.75-1.75Z');
  p1.setAttribute('fill', 'currentColor');
  const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p2.setAttribute('d', 'm18.25,13.27148h-2.52319c-.34064-1.43018-1.62128-2.5-3.15405-2.5s-2.81342,1.06982-3.15405,2.5H1.75c-.41406,0-.75.33594-.75.75s.33594.75.75.75h7.6687c.34064,1.43018,1.62128,2.5,3.15405,2.5s2.81342-1.06982,3.15405-2.5h2.52319c.41406,0,.75-.33594.75-.75s-.33594-.75-.75-.75Zm-5.67725,2.5c-.96484,0-1.75-.78516-1.75-1.75s.78516-1.75,1.75-1.75,1.75.78516,1.75,1.75-.78516,1.75-1.75,1.75Z');
  p2.setAttribute('fill', 'currentColor');
  svg.append(p1, p2);
  return svg;
}

// ─── Authoring helpers ─────────────────────────────────────────────────────

function placeholderText(root, iconClass) {
  const icon = root.querySelector(`.${iconClass}`) || root.querySelector(`[class*="${iconClass}"]`);
  if (!icon) return '';
  return (icon.closest('li')?.innerText || '').replace(/\s+/g, ' ').trim();
}

function labelForField(root, iconClass, fallback) {
  const t = placeholderText(root, iconClass);
  return t || fallback;
}

/** Pull legal copy (Terms / Privacy links) from authoring before the config holder consumes the block. */
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
    /** @type {HTMLElement | null} */
    this.actionContainerEl = null;
  }

  // ─── Model config ─────────────────────────────────────────────────────────

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
      const raw = item['aspect-ratio'];
      if (item.id && raw) {
        try {
          this.aspectRatioMap[item.id] = JSON.parse(raw);
        } catch {
          this.aspectRatioMap[item.id] = raw.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }
    });
  }

  getAspectRatiosForModel(modelId) {
    return this.aspectRatioMap[modelId] || [];
  }

  readAuthoringConfig() {
    const root = this.el;
    this.showAspectRatio = !!root.querySelector('[class*="icon-show-aspect-ratio"]');
    this.showMore = !!root.querySelector('[class*="icon-show-more"]');
  }

  // ─── Dropdowns (DOM aligned with prompt-bar models-container / verb-list) ─

  /**
   * Match prompt-bar behavior: inline `display:none` on `.verb-list` is removed when opening
   * so `.models-container.show-menu .verb-list { display: block }` can apply.
   */
  attachModelsDropdownMenu(container, selectedElement, list) {
    const closeMenu = () => {
      container.classList.remove('show-menu');
      list.setAttribute('style', 'display: none;');
      selectedElement.setAttribute('aria-expanded', 'false');
    };
    selectedElement.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.models-container.show-menu').forEach((c) => {
        if (c === container) return;
        c.classList.remove('show-menu');
        const ul = c.querySelector(':scope > .verb-list');
        if (ul) ul.setAttribute('style', 'display: none;');
        c.querySelector('.selected-model')?.setAttribute('aria-expanded', 'false');
      });
      container.classList.toggle('show-menu');
      if (container.classList.contains('show-menu')) {
        list.removeAttribute('style');
      } else {
        list.setAttribute('style', 'display: none;');
      }
      selectedElement.setAttribute('aria-expanded', container.classList.contains('show-menu') ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (!container.contains(/** @type {Node} */ (e.target))) closeMenu();
    });
  }

  buildModelPicker() {
    if (!this.models?.length) return null;
    const defaultModel = this.models.find((m) => m.default === 'true' || m.default === true) || this.models[0];
    this.selectedModelId = defaultModel?.id || '';

    const container = createTag('div', { class: 'models-container', 'aria-label': 'Model options' });
    const nameContainer = createTag('span', { class: 'model-name' }, (defaultModel?.name || '').trim());
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    // const menuIcon = createTag('span', { class: 'menu-icon' });
    // menuIcon.append(menuChevronSvg());

    const selectedElement = createTag('button', {
      type: 'button',
      class: 'selected-model',
      'aria-expanded': 'false',
      'aria-controls': 'pbu-model-menu',
      'aria-haspopup': 'listbox',
      role: 'combobox',
    });
    if (defaultModel?.icon) {
      const img = createTag('img', { src: defaultModel.icon, alt: '' });
      selectedElement.append(img, nameContainer, menuIcon);
    } else {
      selectedElement.append(nameContainer, menuIcon);
    }

    const list = createTag('ul', {
      class: 'verb-list',
      id: 'pbu-model-menu',
      role: 'listbox',
      'aria-labelledby': 'listbox-label',
    });
    list.setAttribute('style', 'display: none;');

    this.models.forEach((model, idx) => {
      const li = createTag('li', { class: 'verb-item', role: 'presentation' });
      const nameSpan = createTag('span', { class: 'model-name' }, (model.name || model.id || '').trim());
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const modelLink = createTag('a', {
        href: '#',
        class: 'verb-link model-link',
        'data-model-id': model.id,
        'data-model-name': (model.name || '').trim(),
        ...(model.version != null && model.version !== '' ? { 'data-model-version': String(model.version) } : {}),
        'aria-selected': idx === 0 ? 'true' : 'false',
        role: 'option',
      });
      modelLink.append(selectedIcon);
      if (model.icon) {
        modelLink.append(createTag('img', { src: model.icon, alt: '' }));
      }
      modelLink.append(nameSpan);
      if (idx === 0) {
        li.classList.add('selected');
        modelLink.setAttribute('aria-selected', 'true');
      }
      li.append(modelLink);
      list.append(li);
    });

    list.addEventListener('click', (e) => {
      const modelLink = e.target.closest('a.model-link');
      if (!modelLink) return;
      e.preventDefault();
      e.stopPropagation();
      const modelId = modelLink.getAttribute('data-model-id') || '';
      const modelName = modelLink.getAttribute('data-model-name') || '';
      const modelVersion = modelLink.getAttribute('data-model-version') || '';
      this.selectedModelId = modelId;
      nameContainer.textContent = modelName;
      this.widgetWrap?.setAttribute('data-selected-model-id', modelId);
      this.widgetWrap?.setAttribute('data-selected-model-name', modelName);
      if (modelVersion) this.widgetWrap?.setAttribute('data-selected-model-version', modelVersion);
      else this.widgetWrap?.removeAttribute('data-selected-model-version');
      list.querySelectorAll('li').forEach((li) => {
        const a = li.querySelector('a');
        li.classList.toggle('selected', a === modelLink);
        a?.setAttribute('aria-selected', a === modelLink ? 'true' : 'false');
      });
      container.classList.remove('show-menu');
      list.setAttribute('style', 'display: none;');
      selectedElement.setAttribute('aria-expanded', 'false');
      if (this.showAspectRatio) this.updateAspectRatioOptions(modelId);
    });

    this.attachModelsDropdownMenu(container, selectedElement, list);
    container.append(selectedElement, list);

    this.widgetWrap?.setAttribute('data-selected-model-id', this.selectedModelId);
    this.widgetWrap?.setAttribute('data-selected-model-name', (defaultModel?.name || '').trim());
    if (defaultModel?.version != null && defaultModel.version !== '') {
      this.widgetWrap?.setAttribute('data-selected-model-version', String(defaultModel.version));
    } else {
      this.widgetWrap?.removeAttribute('data-selected-model-version');
    }
    return container;
  }

  buildAspectRatioDropdown(modelId) {
    const ratios = this.getAspectRatiosForModel(modelId);
    if (!ratios.length) return null;
    this.selectedAspectRatio = ratios[0];
    this.widgetWrap?.setAttribute('data-selected-aspect-ratio', this.selectedAspectRatio);

    const container = createTag('div', { class: 'models-container pbu-aspect-models', 'aria-label': 'Aspect ratio' });
    const nameContainer = createTag('span', { class: 'model-name' }, ratios[0]);
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    // const menuIcon = createTag('span', { class: 'menu-icon' });
    // menuIcon.append(menuChevronSvg());

    const selectedElement = createTag('button', {
      type: 'button',
      class: 'selected-model',
      'aria-expanded': 'false',
      'aria-controls': 'pbu-aspect-menu',
      'aria-haspopup': 'listbox',
      role: 'combobox',
    });
    selectedElement.append(nameContainer, menuIcon);

    const list = createTag('ul', {
      class: 'verb-list',
      id: 'pbu-aspect-menu',
      role: 'listbox',
    });
    list.setAttribute('style', 'display: none;');

    ratios.forEach((ratio, idx) => {
      const li = createTag('li', { class: 'verb-item', role: 'presentation' });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const link = createTag('a', {
        href: '#',
        class: 'verb-link model-link',
        'data-ratio': ratio,
        'aria-selected': idx === 0 ? 'true' : 'false',
        role: 'option',
      });
      link.append(selectedIcon, createTag('span', { class: 'model-name' }, ratio));
      if (idx === 0) li.classList.add('selected');
      li.append(link);
      list.append(li);
    });

    list.addEventListener('click', (e) => {
      const ratioLink = e.target.closest('a.model-link');
      if (!ratioLink) return;
      e.preventDefault();
      e.stopPropagation();
      const ratio = ratioLink.getAttribute('data-ratio') || '';
      this.selectedAspectRatio = ratio;
      nameContainer.textContent = ratio;
      this.widgetWrap?.setAttribute('data-selected-aspect-ratio', ratio);
      list.querySelectorAll('li').forEach((li) => {
        const a = li.querySelector('a');
        li.classList.toggle('selected', a === ratioLink);
        a?.setAttribute('aria-selected', a === ratioLink ? 'true' : 'false');
      });
      container.classList.remove('show-menu');
      list.setAttribute('style', 'display: none;');
      selectedElement.setAttribute('aria-expanded', 'false');
    });

    this.attachModelsDropdownMenu(container, selectedElement, list);
    container.append(selectedElement, list);
    return container;
  }

  updateAspectRatioOptions(modelId) {
    const ac = this.actionContainerEl || this.widgetWrap?.querySelector('.action-container');
    ac?.querySelector('.pbu-aspect-models')?.remove();
    const picker = this.buildAspectRatioDropdown(modelId);
    if (!picker || !ac) return;
    // Keep order: model → aspect → more (same as buildRightSection). append() would
    // place aspect after More and make the bar look like it "jumped".
    const modelPicker = ac.querySelector('.models-container:not(.pbu-aspect-models)');
    if (modelPicker) modelPicker.after(picker);
    else ac.append(picker);
  }

  buildDropZone() {
    const fileInput = createTag('input', {
      type: 'file',
      id: 'file-upload',
      accept: 'image/jpeg,image/jpg,image/png,image/webp',
      hidden: '',
      'aria-hidden': 'true',
    });

    const dropContent = createTag('div', { class: 'pbu-drop-content' });
    const uploadIcon = createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/upload.svg` });
    dropContent.append(uploadIcon);
    const dropZone = createTag('div', { class: 'drop-zone', role: 'button', tabindex: '0', 'aria-label': 'Upload image' });
    dropZone.append(fileInput, dropContent);
    const preview = createTag('div', { class: 'pbu-preview hidden', 'aria-hidden': 'true' });
    const previewImg = createTag('img', { class: 'pbu-preview-img', alt: 'Selected image preview' });
    const deleteBtn = createTag('span', { class: 'pbu-delete-btn' }, '<svg><use xlink:href="#unity-trash-icon"></use></svg>');
    // const deleteBtn = createTag('button', { class: 'pbu-delete-btn', 'aria-label': 'Remove image' });
    // deleteBtn.append(svgUse(ICON.trash, 'pbu-trash-svg'));
    const spinner = createTag('div', { class: 'pbu-spinner hidden', 'aria-label': 'Uploading', role: 'status' });
    preview.append(previewImg, deleteBtn, spinner);

    const wrap = createTag('div', { class: 'pbu-drop-zone-wrap' });
    wrap.append(dropZone, preview);
    return wrap;
  }

  buildPromptTextarea() {
    const placeholder = placeholderText(this.el, 'icon-placeholder-input') || 'Describe your video...';
    return createTag('textarea', {
      id: 'pbuPromptInput',
      class: 'inp-field',
      placeholder,
      rows: '1',
      maxlength: '750',
      'aria-label': placeholder,
      'aria-autocomplete': 'list',
    });
  }

  /**
   * Generate CTA — same classes as prompt-bar (`unity-act-btn gen-btn`, optional icon from authoring).
   */
  buildGenerateButton() {
    const generateLi = this.el.querySelector('[class*="icon-generate"]')?.closest('li');
    const genBtnText = (generateLi?.innerText || 'Generate').trim().split('\n')[0] || 'Generate';
    const btn = createTag('a', {
      href: '#',
      class: 'unity-act-btn gen-btn',
      'aria-label': genBtnText,
    });
    const svgLink = generateLi?.querySelector('a[href$=".svg"]');
    if (svgLink?.href) {
      btn.append(
        createTag('div', { class: 'btn-ico' }, createTag('img', { src: svgLink.href, alt: '' })),
        createTag('div', { class: 'btn-txt' }, genBtnText),
      );
    } else {
      btn.append(createTag('div', { class: 'btn-txt' }, genBtnText));
    }
    return btn;
  }

  buildMoreButton() {
    if (!this.showMore) return null;
    const moreLi = this.el.querySelector('[class*="icon-more"]')?.closest('li');
    const txt = (moreLi?.innerText || 'More').trim().split('\n')[0] || 'More';
    const btn = createTag('a', {
      href: '#',
      class: 'unity-act-btn pbu-more-btn more-btn',
      'aria-label': txt,
    });
    const ico = createTag('span', { class: 'btn-ico' }, '<svg><use xlink:href="#unity-more-icon"></use></svg>');
    // const ico = createTag('div', { class: 'btn-ico' });
    // ico.append(moreIconSvg());
    btn.append(ico, createTag('div', { class: 'btn-txt' }, txt));
    return btn;
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

  async initWidget() {
    this.readAuthoringConfig();

    try {
      await this.loadModels();
    } catch (e) {
      window.lana?.log(`Message: Failed to load video models, Error: ${e}`, this.lanaOptions);
    }

    // Build left and right sections
    const leftSection = this.buildLeftSection();
    const rightSection = await this.buildRightSection();
    
    // Create main container (flex-row) combining left and right sections
    const main = createTag('div', { class: 'pbu-main' });
    main.append(leftSection, rightSection);
    
    // Create interactive shell wrapper
    const skin = this.el.classList.contains('light') ? 'light' : 'dark';
    const interactiveShell = createTag('div', { class: `interactive-area ${skin}` });
    interactiveShell.append(main);
    
    // Create root container
    const root = createTag('div', { class: 'unity-prompt-bar-upload unity-enabled' });
    root.append(interactiveShell);
    
    // Move authoring config to hidden holder
    const holder = createTag('div', { class: 'unity-pbu-config-holder unity-slf-sr-only' });
    holder.setAttribute('aria-hidden', 'true');
    while (this.el.firstChild) {
      holder.append(this.el.firstChild);
    }
    this.el.append(holder);
    this.el.classList.add('unity-prompt-bar-upload-host');
    
    // Insert into page
    const widgetWrap = createTag('div', { class: 'ex-unity-wrap verb-options pbu-widget' });
    this.widgetWrap = widgetWrap;
    const unitySprite = createTag('div', { class: 'unity-sprite-container' });
    unitySprite.innerHTML = this.spriteCon || '';
    const legalFoot = extractLegalFootFromAuthoring(this.el);
    widgetWrap.append(unitySprite, root);
    if (legalFoot) widgetWrap.append(legalFoot);

    // Append to target
    this.addWidget();
    this.wireImagePreview();

    // Set up action map
    this.actionMap = {
      '.gen-btn': [{ actionType: 'generate' }],
      '.more-btn': [{ actionType: 'more' }],
      '.drop-zone': [{ actionType: 'file-selected' }],
      '#file-upload': [{ actionType: 'file-selected' }],
    };
    
    return this.actionMap;
  }

  buildLeftSection() {
    // const uploadHeading = labelForField(this.el, 'icon-label-upload', 'Upload image');
    const leftSectionLabel = placeholderText(this.el, 'icon-dropzone-label')
    const uploadLabel = createTag('div', { class: 'unity-slf-copy-label pbu-upload-heading' }, leftSectionLabel);
    const dropZoneWrap = this.buildDropZone();
    const leftSection = createTag('div', { class: 'pbu-left-section' });
    leftSection.append(uploadLabel, dropZoneWrap);
    return leftSection;
  }

  async buildRightSection() {
    const rightSection = createTag('div', { class: 'pbu-right-section' });

    // Prompt input shell (textarea + model/aspect/more controls)
    const promptHeading = placeholderText(this.el, 'icon-placeholder-prompt')
      || labelForField(this.el, 'icon-label-prompt', 'Prompt');
    const promptLabel = createTag('label', {
      for: 'pbuPromptInput',
      class: 'unity-slf-copy-label unity-slf-prompt-label',
    }, promptHeading);
    
    const promptTextarea = this.buildPromptTextarea();
    
    // Action controls: model picker, aspect ratio, more button
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

    // Build generate button wrapper
    const actWrap = createTag('div', { class: 'act-wrap' });
    const genBtn = this.buildGenerateButton();
    actWrap.append(genBtn);

    // Build controls footer
    const controlsFooter = createTag('div', { class: 'pbu-controls-footer' });
    controlsFooter.append(actionContainer, actWrap);

    // Assemble prompt bar container
    const promptBarContainer = createTag('div', { class: 'pbu-prompt-bar-container' });
    promptBarContainer.append(promptLabel, promptTextarea, controlsFooter);
    rightSection.append(promptBarContainer);
    
    return rightSection;
  }
}
