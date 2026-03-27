/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file -- UnityWidget duplicated alongside PromptBarStyleWidget for a single network bundle */

import {
  createTag,
  defineDeviceByScreenSize,
} from '../../../scripts/utils.js';

export class UnityWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
    this.spriteCon = spriteCon;
    this.prompts = null;
    this.models = null;
    this.selectedVerbType = '';
    this.selectedVerbText = '';
    this.selectedModelModule = '';
    this.selectedModelId = '';
    this.selectedModelText = '';
    this.selectedModelVersion = '';
    this.selectedModelName = '';
    this.promptItems = [];
    this.genBtn = null;
    this.hasPromptSuggestions = false;
    this.hasModelOptions = false;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF' };
    this.sound = { audio: null, currentTile: null, currentUrl: '' };
    this.durationCache = new Map();
  }

  async ensureSoundModuleLoaded() {
    await Promise.resolve();
  }

  verbDropdown() {
    const verbs = this.el.querySelectorAll('[class*="icon-verb"]');
    const inputPlaceHolder = this.el.querySelector('.icon-placeholder-input').parentElement.textContent;
    const selectedVerbType = verbs[0]?.className.split('-')[2];
    const selectedVerb = verbs[0]?.nextElementSibling;
    const selectedElement = createTag('button', {
      class: 'selected-verb',
      'aria-expanded': 'false',
      'aria-controls': 'media-menu',
      'aria-label': 'media type',
      'aria-haspopup': 'listbox',
      role: 'combobox',
      'aria-labelledby': 'listbox-label',
      'data-selected-verb': selectedVerbType,
    }, `${selectedVerb?.textContent.trim()}`);
    this.selectedVerbType = selectedVerbType;
    this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
    this.selectedVerbText = selectedVerb?.textContent.trim();
    if (verbs.length <= 1) {
      selectedElement.setAttribute('disabled', 'true');
      return [selectedElement];
    }
    this.widgetWrap.classList.add('verb-options');
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const verbList = createTag('ul', { class: 'verb-list', id: 'media-menu', role: 'listbox', 'aria-labelledby': 'listbox-label' });
    verbList.setAttribute('style', 'display: none;');
    selectedElement.append(menuIcon);
    const handleDocumentClick = (e) => {
      const menuContainer = selectedElement.parentElement;
      if (!menuContainer.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        this.closeVerbOrModelMenu(selectedElement);
      }
    };
    selectedElement.addEventListener('click', (e) => {
      e.stopPropagation();
      const menuContainer = selectedElement.parentElement;
      const wasOpen = menuContainer.classList.contains('show-menu');
      this.hidePromptDropdown(selectedElement);
      this.showVerbMenu(selectedElement);
      if (!wasOpen) {
        this.widgetWrap.dispatchEvent(new CustomEvent('firefly-analytics', {
          detail: {
            adobeEventName: this.PROMPT_WITH_STYLE_UI.MODULE_PICKER,
            splunkData: { action: 'open' },
          },
        }));
      }
      document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const menuContainer = selectedElement.parentElement;
        const wasOpen = menuContainer.classList.contains('show-menu');
        this.hidePromptDropdown(selectedElement);
        this.showVerbMenu(selectedElement);
        if (!wasOpen) {
          this.widgetWrap.dispatchEvent(new CustomEvent('firefly-analytics', {
            detail: {
              adobeEventName: this.PROMPT_WITH_STYLE_UI.MODULE_PICKER,
              splunkData: { action: 'open' },
            },
          }));
        }
      }
      if (e.key === 'Escape' || e.keyCode === 27) {
        this.closeVerbOrModelMenu(selectedElement);
        selectedElement.focus();
      }
    });
    verbs[0]?.classList.add('selected');
    const verbsData = Array.from(verbs).map((verb) => ({
      name: verb.nextElementSibling?.textContent.trim(),
      type: verb.classList[1].split('-')[2],
      icon: verb.nextElementSibling?.href,
    }));
    this.createDropdownItems(verbsData, verbList, selectedElement, menuIcon, inputPlaceHolder, false);
    return [selectedElement, verbList];
  }

  closeVerbOrModelMenu(selectedElement) {
    const menuContainer = selectedElement?.parentElement;
    if (!menuContainer) return;
    menuContainer.classList.remove('show-menu');
    selectedElement.setAttribute('aria-expanded', 'false');
    const list = selectedElement.nextElementSibling;
    if (list?.classList?.contains('verb-list')) {
      list.setAttribute('style', 'display: none;');
    }
  }

  showVerbMenu(selectedElement) {
    const menuContainer = selectedElement.parentElement;
    document.querySelectorAll('.verbs-container').forEach((container) => {
      if (container !== menuContainer) {
        const sv = container.querySelector('.selected-verb');
        if (sv) this.closeVerbOrModelMenu(sv);
      }
    });
    document.querySelectorAll('.models-container').forEach((container) => {
      if (container !== menuContainer) {
        const sm = container.querySelector('.selected-model');
        if (sm) this.closeVerbOrModelMenu(sm);
      }
    });
    menuContainer.classList.toggle('show-menu');
    const isOpen = menuContainer.classList.contains('show-menu');
    selectedElement.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    const siblingList = selectedElement.nextElementSibling;
    if (siblingList?.classList?.contains('verb-list')) {
      if (isOpen) {
        siblingList.removeAttribute('style');
      } else {
        siblingList.setAttribute('style', 'display: none;');
      }
    }
  }

  hidePromptDropdown(exceptElement = null) {
    const dropdown = this.widget.querySelector('.prompt-dropdown-container');
    if (dropdown && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
      dropdown.setAttribute('inert', '');
      dropdown.setAttribute('aria-hidden', 'true');
    }
    if (this.selectedVerbType === 'sound') {
      this.resetAllSoundVariations?.(dropdown);
    }
    const modelDropdown = this.widget.querySelector('.models-container');
    const modelButton = modelDropdown?.querySelector('.selected-model');
    if (modelDropdown && modelDropdown.classList.contains('show-menu') && modelButton && modelButton !== exceptElement) {
      this.closeVerbOrModelMenu(modelButton);
    }
    const verbDropdown = this.widget.querySelector('.verbs-container');
    const verbButton = verbDropdown?.querySelector('.selected-verb');
    if (verbDropdown && verbDropdown.classList.contains('show-menu') && verbButton && verbButton !== exceptElement) {
      this.closeVerbOrModelMenu(verbButton);
    }
  }

  updateAnalytics(verb) {
    if (this.promptItems && this.promptItems.length > 0) {
      this.promptItems.forEach((item) => {
        const ariaLabel = item.getAttribute('aria-label') || '';
        item.setAttribute('daa-ll', `${ariaLabel.slice(0, 20)}--${verb}--Prompt suggestion`);
      });
    }
  }

  clearSelectedModelState() {
    this.selectedModelId = '';
    this.selectedModelName = '';
    this.selectedModelVersion = '';
    this.selectedModelModule = '';
    this.selectedModelText = '';
    this.widgetWrap?.removeAttribute('data-selected-model-name');
  }

  handleVerbLinkClick(link, verbList, selectedElement, menuIcon, inputPlaceHolder, modelList) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      const verbLinkTexts = [];
      verbList.querySelectorAll('.verb-link').forEach((listLink) => {
        listLink.parentElement.classList.remove('selected');
        listLink.setAttribute('aria-selected', 'false');
        const text = listLink.textContent.trim();
        if (text) verbLinkTexts.push(text);
      });
      verbLinkTexts.sort((a, b) => b.length - a.length);
      this.closeVerbOrModelMenu(selectedElement);
      link.parentElement.classList.add('selected');
      link.setAttribute('aria-selected', 'true');
      if (modelList) {
        this.selectedModelId = link.getAttribute('data-model-id');
        this.selectedModelName = link.textContent.trim();
        this.selectedModelVersion = link.getAttribute('data-model-version');
        this.selectedModelModule = link.getAttribute('data-model-module');
        this.selectedModelText = link.textContent.trim();
        const copiedNodes = link.cloneNode(true).childNodes;
        copiedNodes[0].remove();
        selectedElement.replaceChildren(...copiedNodes, menuIcon);
        selectedElement.dataset.selectedModelId = this.selectedModelId;
        selectedElement.dataset.selectedModelVersion = this.selectedModelVersion;
      } else {
        this.selectedVerbType = link.getAttribute('data-verb-type');
        this.selectedVerbText = link.textContent.trim();
        selectedElement.replaceChildren(this.selectedVerbText, menuIcon);
        selectedElement.dataset.selectedVerb = this.selectedVerbType;
      }
      selectedElement.focus();
      this.ensureSoundModuleLoaded();
      const verbsWithoutPromptSuggestions = this.workflowCfg.targetCfg?.verbsWithoutPromptSuggestions ?? [];
      if (!verbsWithoutPromptSuggestions.includes(this.selectedVerbType)) this.updateDropdownForVerb(this.selectedVerbType);
      else this.widgetWrap.dispatchEvent(new CustomEvent('firefly-reinit-action-listeners'));
      if (link.getAttribute('data-model-module') !== this.selectedVerbType) {
        const oldModelContainer = this.widget.querySelector('.models-container');
        const modelDropdown = this.modelDropdown();
        if (oldModelContainer) {
          if (modelDropdown.length > 1) {
            const newModelContainer = createTag('div', { class: 'models-container', 'aria-label': 'Model options' });
            newModelContainer.append(...modelDropdown);
            oldModelContainer.replaceWith(newModelContainer);
          } else {
            oldModelContainer.remove();
            this.clearSelectedModelState();
          }
        } else if (modelDropdown.length > 1) {
          const actionContainer = this.widget.querySelector('.action-container');
          if (actionContainer) {
            const newModelContainer = createTag('div', { class: 'models-container', 'aria-label': 'Prompt options' });
            newModelContainer.append(...modelDropdown);
            actionContainer.append(newModelContainer);
          }
        } else this.clearSelectedModelState();
      }
      this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
      if (this.selectedModelId) {
        this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
        this.widgetWrap.setAttribute('data-selected-model-name', this.selectedModelName || '');
      } else {
        this.widgetWrap.removeAttribute('data-selected-model-id');
        this.widgetWrap.removeAttribute('data-selected-model-name');
      }
      if (this.selectedModelVersion) this.widgetWrap.setAttribute('data-selected-model-version', this.selectedModelVersion);
      else this.widgetWrap.removeAttribute('data-selected-model-version');
      this.updateAnalytics(this.selectedVerbType);
      if (this.genBtn) {
        const img = this.genBtn.querySelector('img[src*=".svg"]');
        this.genBtn.setAttribute(
          'aria-label',
          (this.genBtn.getAttribute('aria-label') || '').replace(
            new RegExp(`\\b(${verbLinkTexts.join('|')})\\b`),
            this.selectedVerbText,
          ),
        );
        if (img) img.setAttribute('alt', `${this.genBtn.getAttribute('aria-label') || ''}`);
      }
    };
  }

  createDropdownItems(items, listContainer, selectedElement, menuIcon, inputPlaceHolder, isModelList) {
    const fragment = document.createDocumentFragment();
    items.forEach((item, idx) => {
      const {
        name, type, icon, module, id, version,
      } = item;
      const listItem = createTag('li', {
        class: 'verb-item',
        role: 'presentation',
      });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const nameContainer = isModelList && createTag('span', { class: 'model-name' }, name.trim());
      const link = createTag('a', {
        href: '#',
        class: isModelList ? 'verb-link model-link' : 'verb-link',
        ...(!isModelList && { 'data-verb-type': type }),
        ...(isModelList && { 'data-model-module': module }),
        ...(isModelList && { 'data-model-id': id }),
        ...(isModelList && { 'data-model-version': version }),
        'aria-selected': 'false',
        role: 'option',
      }, `<img loading="lazy" src="${icon}" alt="" />${nameContainer ? nameContainer.outerHTML : name}`);
      if (idx === 0) {
        listItem.classList.add('selected');
        link.setAttribute('aria-selected', 'true');
      }
      link.prepend(selectedIcon);
      listItem.append(link);
      fragment.append(listItem);
    });
    listContainer.append(fragment);
    listContainer.addEventListener('click', (e) => {
      const link = e.target.closest('.verb-link');
      if (!link) return;
      this.handleVerbLinkClick(link, listContainer, selectedElement, menuIcon, inputPlaceHolder, isModelList)(e);
    });
  }

  modelDropdown() {
    if (!this.hasModelOptions) return [];
    const models = Array.isArray(this.models)
      ? this.models.filter((obj) => obj.module === this.selectedVerbType)
      : [];
    if (!Array.isArray(models) || models.length === 0) return [];
    const inputPlaceHolder = this.el.querySelector('.icon-placeholder-input').parentElement.textContent;
    const selectedModelType = models[0].id;
    const selectedModelVersion = models[0].version;
    const selectedModelModule = models[0].module;
    const selectedModelName = models[0].name.trim();
    const nameContainer = createTag('span', { class: 'model-name' }, models[0].name.trim());
    const selectedElement = createTag('button', {
      class: 'selected-model',
      'aria-expanded': 'false',
      'aria-controls': 'model-menu',
      'aria-label': 'model type',
      'aria-haspopup': 'listbox',
      role: 'combobox',
      'aria-labelledby': 'listbox-label',
      'data-selected-model-id': selectedModelType,
      'data-selected-model-version': selectedModelVersion,
      'data-selected-model-module': selectedModelModule,
    }, `<img src="${models[0].icon}" alt="" />${nameContainer.outerHTML}`);
    this.selectedModelModule = selectedModelModule;
    this.selectedModelId = selectedModelType;
    this.selectedModelVersion = selectedModelVersion;
    this.selectedModelName = selectedModelName;
    this.widgetWrap.setAttribute('data-selected-model-id', this.selectedModelId);
    this.widgetWrap.setAttribute('data-selected-model-version', this.selectedModelVersion);
    this.widgetWrap.setAttribute('data-selected-model-name', this.selectedModelName);
    this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
    this.selectedModelText = models[0].name.trim();
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const listItems = createTag('ul', { class: 'verb-list', id: 'model-menu', role: 'listbox', 'aria-labelledby': 'listbox-label' });
    listItems.setAttribute('style', 'display: none;');
    selectedElement.append(menuIcon);
    const handleDocumentClick = (e) => {
      const menuContainer = selectedElement.parentElement;
      if (!menuContainer.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        this.closeVerbOrModelMenu(selectedElement);
      }
    };
    selectedElement.addEventListener('click', (e) => {
      e.stopPropagation();
      const menuContainer = selectedElement.parentElement;
      const wasOpen = menuContainer.classList.contains('show-menu');
      this.hidePromptDropdown(selectedElement);
      this.showVerbMenu(selectedElement);
      if (!wasOpen) {
        this.widgetWrap.dispatchEvent(new CustomEvent('firefly-analytics', {
          detail: {
            adobeEventName: this.PROMPT_WITH_STYLE_UI.MODEL_SELECT_DROPDOWN,
            splunkData: { action: 'open' },
          },
        }));
      }
      document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const menuContainer = selectedElement.parentElement;
        const wasOpen = menuContainer.classList.contains('show-menu');
        this.hidePromptDropdown(selectedElement);
        this.showVerbMenu(selectedElement);
        if (!wasOpen) {
          this.widgetWrap.dispatchEvent(new CustomEvent('firefly-analytics', {
            detail: {
              adobeEventName: this.PROMPT_WITH_STYLE_UI.MODEL_SELECT_DROPDOWN,
              splunkData: { action: 'open' },
            },
          }));
        }
      }
      if (e.key === 'Escape' || e.code === 27) {
        this.closeVerbOrModelMenu(selectedElement);
        selectedElement.focus();
      }
    });
    this.createDropdownItems(models, listItems, selectedElement, menuIcon, inputPlaceHolder, true);
    return [selectedElement, listItems];
  }

  createActBtn(cfg, cls) {
    if (!cfg) return null;
    const txt = cfg.innerText?.trim();
    const img = cfg.querySelector('img[src*=".svg"]');
    if (img) img.setAttribute('alt', `${txt?.split('\n')[0]} ${this.selectedVerbText}`);
    const btn = createTag('a', {
      href: '#',
      class: `unity-act-btn ${cls}`,
      'daa-ll': this.PROMPT_WITH_STYLE_UI.GENERATE_CTA,
      'aria-label': `${txt?.split('\n')[0]} ${this.selectedVerbText}`,
    });
    if (img) btn.append(createTag('div', { class: 'btn-ico' }, img));
    if (txt) btn.append(createTag('div', { class: 'btn-txt' }, txt.split('\n')[0]));
    this.genBtn = btn;
    return btn;
  }

  async loadModels() {
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    const modelFile = `${baseUrl}/unity/configs/prompt/model-picker.json`;
    const results = await fetch(modelFile);
    if (!results.ok) {
      throw new Error('Failed to fetch models.');
    }
    const modelJson = await results.json();
    this.models = modelJson?.content?.data;
  }

  async getModel() {
    if (!this.hasModelOptions) return [];
    try {
      if (!this.models || Object.keys(this.models).length === 0) await this.loadModels();
      return this.models;
    } catch (e) {
      window.lana?.log(`Message: Error loading models, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  createModelMap(data) {
    const modelMap = {};
    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (item.type) {
          if (!modelMap[item.module]) modelMap[item.module] = [];
          modelMap[item.module].push({ name: item.name, id: item.id, version: item.version, icon: item.icon });
        }
      });
    }
    return modelMap;
  }

  async updateDropdownForVerb() {
    await Promise.resolve();
  }
}

const VIEWPORT_COL = { MOBILE: 0, TABLET: 1, DESKTOP: 2 };

function placeholderRowText(root, iconClass) {
  const icon = root.querySelector(`.${iconClass}`)
    || root.querySelector(`[class*="${iconClass}"]`);
  if (!icon) return '';
  return (icon.closest('li')?.innerText || '').replace(/\s+/g, ' ').trim();
}

export function parseStyleLi(li) {
  const picture = li.querySelector('picture');
  if (!picture) return null;
  const clone = li.cloneNode(true);
  clone.querySelector('picture')?.remove();
  const parts = clone.innerHTML
    .split(/<br\s*\/?>/i)
    .map((p) => {
      const t = document.createElement('span');
      t.innerHTML = p;
      return t.textContent.trim();
    })
    .filter(Boolean);

  let label;
  let styleDescription;
  let prompt;

  if (parts.length >= 3) {
    const [p0, p1, ...rest] = parts;
    label = p0;
    styleDescription = p1;
    prompt = rest.join(' ').trim();
  } else if (parts.length === 2) {
    const [first, second] = parts;
    label = first;
    styleDescription = '';
    prompt = second;
  } else {
    const [only] = parts;
    label = only || '';
    styleDescription = '';
    prompt = '';
  }

  return {
    picture: /** @type {HTMLPictureElement} */ (picture.cloneNode(true)),
    label,
    styleDescription,
    prompt,
  };
}

function isDirectLiOfUl(ul, li) {
  let p = li.parentElement;
  while (p) {
    if (p === ul) return true;
    if (p.tagName === 'UL' || p.tagName === 'OL') return false;
    p = p.parentElement;
  }
  return false;
}

function topLevelLisInUl(ul) {
  return [...ul.querySelectorAll('li')].filter((li) => isDirectLiOfUl(ul, li));
}

export function parsePromptBarStyleAuthoring(root) {
  let topDivs = [...root.children].filter((n) => n.nodeName === 'DIV');
  if (topDivs.length === 1) {
    const inner = topDivs[0];
    topDivs = [...inner.children].filter((n) => n.nodeName === 'DIV');
  }
  if (topDivs.length < 2) return { styles: [], previewRows: [] };

  /* 1. Skip row 0 (config). First later row that contains a <ul> is the style strip. */
  let styleStripRowIndex = -1;
  let ul = /** @type {HTMLUListElement | null} */ (null);
  for (let i = 1; i < topDivs.length; i += 1) {
    const found = topDivs[i].querySelector('ul');
    if (found) {
      ul = /** @type {HTMLUListElement} */ (found);
      styleStripRowIndex = i;
      break;
    }
  }
  if (!ul || styleStripRowIndex < 0) return { styles: [], previewRows: [] };

  /* 2. Each top-level <li> in that <ul> → one style entry. */
  const styles = [];
  const listItems = topLevelLisInUl(ul);
  listItems.forEach((li) => {
    const result = parseStyleLi(li);
    if (result) {
      styles.push(result);
    } else if (styles.length && !styles[styles.length - 1].prompt) {
      styles[styles.length - 1].prompt = li.textContent.trim();
    }
  });

  if (!styles.length) return { styles: [], previewRows: [] };

  /* 3. Next N top-level rows (N = styles.length): each is one preview row (3 column divs × picture). */
  const afterStyleStrip = topDivs.slice(styleStripRowIndex + 1);
  const previewRows = [];
  for (let k = 0; k < styles.length; k += 1) {
    const row = afterStyleStrip[k];
    if (!row) {
      previewRows.push([]);
    } else {
      const cols = [...row.querySelectorAll(':scope > div')];
      const pics = cols.map((col) => col.querySelector('picture'));
      const valid = pics.length === 3 && pics.every(Boolean);
      previewRows.push(valid ? pics : []);
    }
  }

  return { styles, previewRows };
}

function previewForViewport(previewRow, colIndex) {
  if (!previewRow || !previewRow.length) return null;
  const pic = previewRow[colIndex] || previewRow[0];
  return pic ? /** @type {HTMLPictureElement} */ (pic.cloneNode(true)) : null;
}

function currentPreviewColumn() {
  const v = defineDeviceByScreenSize();
  return VIEWPORT_COL[v] ?? 2;
}

function applyAuthoringPreviewGridLoadingPriorities(previewRows, selectedStyleIdx, activeViewportColIndex) {
  previewRows.forEach((row, styleIdx) => {
    row.forEach((pic, colIdx) => {
      if (!pic) return;
      const img = pic.querySelector('img');
      if (!img) return;
      const eager = selectedStyleIdx === 0 && styleIdx === 0 && colIdx === activeViewportColIndex;
      img.setAttribute('loading', eager ? 'eager' : 'lazy');
      if (eager) {
        img.setAttribute('fetchpriority', 'high');
      } else {
        img.removeAttribute('fetchpriority');
      }
    });
  });
}

async function createPromptInputShell(widgetInstance, el, styles) {
  const widgetWrap = createTag('div', { class: 'ex-unity-wrap verb-options' });
  const [widget, unitySprite] = ['ex-unity-widget', 'unity-sprite-container']
    .map((c) => createTag('div', { class: c }));
  widgetInstance.widgetWrap = widgetWrap;
  widgetInstance.widget = widget;
  unitySprite.innerHTML = widgetInstance.spriteCon;
  unitySprite.classList.add('unity-slf-sprite');
  widgetWrap.append(unitySprite);

  const phStub = createTag('div', { hidden: true, 'aria-hidden': 'true' });
  phStub.innerHTML = '<ul><li><span class="icon icon-placeholder-input"></span> </li></ul>';
  el.append(phStub);

  widgetInstance.hasModelOptions = !!el.querySelector('[class*="icon-model"]');
  if (widgetInstance.hasModelOptions) await widgetInstance.getModel();

  const verbParts = widgetInstance.verbDropdown();
  const modelParts = widgetInstance.modelDropdown();

  const promptLabelText = placeholderRowText(el, 'icon-placeholder-prompt');

  const inpWrap = createTag('div', { class: 'inp-wrap' });
  const labelText = promptLabelText || 'Prompt';
  const promptLabel = createTag('label', { for: 'promptInput', class: 'inp-field-label unity-slf-prompt-label' }, labelText);
  const inpField = createTag('textarea', {
    id: 'promptInput',
    class: 'inp-field',
    'aria-autocomplete': 'list',
    'aria-haspopup': 'listbox',
    rows: '4',
  });
  inpField.value = styles[0].prompt;
  let promptEngagedTracked = false;
  inpField.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target !== inpField) return;
    widgetInstance.hidePromptDropdown();
    if (!promptEngagedTracked) {
      promptEngagedTracked = true;
      widgetWrap.dispatchEvent(new CustomEvent('firefly-analytics', {
        detail: {
          adobeEventName: widgetInstance.PROMPT_WITH_STYLE_UI.ENTER_PROMPT,
          splunkData: { action: 'enter-prompt' },
        },
      }));
    }
  });
  inpField.addEventListener('blur', () => { promptEngagedTracked = false; });

  const actionContainer = createTag('div', { class: 'action-container' });
  if (verbParts.length > 1) {
    const verbBtn = createTag('div', { class: 'verbs-container', 'aria-label': 'Media options' });
    verbBtn.append(...verbParts);
    actionContainer.append(verbBtn);
  }
  if (modelParts.length > 1) {
    const modelBtn = createTag('div', { class: 'models-container', 'aria-label': 'Model options' });
    modelBtn.append(...modelParts);
    actionContainer.append(modelBtn);
  } else {
    widgetWrap.setAttribute('data-selected-model-id', 'adobe-firefly');
    widgetWrap.setAttribute('data-selected-model-version', 'image3');
    const fallbackName = Array.isArray(widgetInstance.models)
      ? widgetInstance.models.find((m) => m.id === 'adobe-firefly' && (!m.version || m.version === 'image3'))?.name?.trim()
        || widgetInstance.models.find((m) => m.id === 'adobe-firefly')?.name?.trim()
      : '';
    if (fallbackName) widgetWrap.setAttribute('data-selected-model-name', fallbackName);
  }

  const actWrap = createTag('div', { class: 'act-wrap' });
  const generateLi = el.querySelector('.icon-generate')?.closest('li');
  let genBtn = widgetInstance.createActBtn(generateLi, 'gen-btn unity-slf-gen-btn');
  if (!genBtn) {
    genBtn = createTag('a', {
      href: '#',
      class: 'unity-act-btn gen-btn unity-slf-gen-btn',
      'daa-ll': widgetInstance.PROMPT_WITH_STYLE_UI.GENERATE_CTA,
      'aria-label': 'Generate',
    });
    genBtn.append(createTag('div', { class: 'btn-txt' }, 'Generate'));
    widgetInstance.genBtn = genBtn;
  } else if (!genBtn.querySelector('.btn-ico') && generateLi) {
    const svgLink = generateLi.querySelector('a[href$=".svg"]');
    if (svgLink?.href) {
      const img = createTag('img', { src: svgLink.href, alt: 'Generate' });
      genBtn.prepend(createTag('div', { class: 'btn-ico' }, img));
    }
  }
  actWrap.append(genBtn);

  inpWrap.append(promptLabel, inpField, actionContainer, actWrap);

  const comboboxContainer = createTag('div', { class: 'autocomplete' });
  comboboxContainer.append(inpWrap);
  widget.append(comboboxContainer);
  widgetWrap.append(widget);

  return { widgetWrap, widget, inpField };
}

function createStylePreviewSection(styles, previewRows, styleSectionHeadingText) {
  const styleContainer = createTag('div', { class: 'unity-slf-style-container' });
  const stylesHeading = createTag(
    'h4',
    { class: 'unity-slf-styles-heading' },
    styleSectionHeadingText || 'Choose a style',
  );
  const styleList = createTag('ul', { class: 'unity-slf-style-list', role: 'listbox', 'aria-label': 'Style variants' });

  const styleItems = styles.map((style, i) => {
    const li = createTag('li', {
      class: `unity-slf-style-item${i === 0 ? ' selected' : ''}`,
      role: 'option',
      tabindex: '0',
      'aria-selected': i === 0 ? 'true' : 'false',
    });
    if (style.styleDescription) {
      li.setAttribute('data-style-connector-suffix', style.styleDescription);
    }
    li.append(style.picture.cloneNode(true));
    li.append(createTag('span', { class: 'unity-slf-style-label' }, style.label));
    return li;
  });
  styleItems.forEach((item) => styleList.append(item));
  styleContainer.append(stylesHeading, styleList);

  const previewArea = createTag('div', { class: 'unity-slf-preview' });
  const initialPreviewCol = currentPreviewColumn();
  applyAuthoringPreviewGridLoadingPriorities(previewRows, 0, initialPreviewCol);
  const firstPic = previewForViewport(previewRows[0], initialPreviewCol);
  if (firstPic) previewArea.replaceChildren(firstPic);

  return { styleContainer, styleItems, previewArea };
}

const EMPTY_PROMPT_RESTORE_MS = 10000;

function attachPromptBarStyleInteractivity(styles, previewRows, inpField, styleItems, previewArea) {
  let currentStyleIdx = 0;
  let emptyPromptRestoreTimerId = null;

  function setPreviewPicture(pic) {
    if (pic) previewArea.replaceChildren(pic);
  }

  function isPromptVisuallyEmpty() {
    return inpField.value.trim() === '';
  }

  function clearEmptyPromptRestoreTimer() {
    if (emptyPromptRestoreTimerId != null) {
      clearTimeout(emptyPromptRestoreTimerId);
      emptyPromptRestoreTimerId = null;
    }
  }

  function scheduleEmptyPromptRestoreIfStillEmpty() {
    clearEmptyPromptRestoreTimer();
    emptyPromptRestoreTimerId = setTimeout(() => {
      emptyPromptRestoreTimerId = null;
      if (!isPromptVisuallyEmpty()) return;
      inpField.value = styles[currentStyleIdx]?.prompt ?? '';
    }, EMPTY_PROMPT_RESTORE_MS);
  }

  function selectStyle(idx) {
    clearEmptyPromptRestoreTimer();
    const prevIdx = currentStyleIdx;
    const prevDefault = styles[prevIdx]?.prompt ?? '';
    const stillSyncedWithPreviousStyle = inpField.value === prevDefault;
    currentStyleIdx = idx;
    styleItems.forEach((item, i) => {
      item.classList.toggle('selected', i === idx);
      item.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    if (stillSyncedWithPreviousStyle) {
      inpField.value = styles[idx].prompt;
    }
    const col = currentPreviewColumn();
    applyAuthoringPreviewGridLoadingPriorities(previewRows, idx, col);
    setPreviewPicture(previewForViewport(previewRows[idx], col));
    if (isPromptVisuallyEmpty()) {
      scheduleEmptyPromptRestoreIfStillEmpty();
    }
  }

  styleItems.forEach((item, i) => {
    item.addEventListener('click', () => selectStyle(i));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectStyle(i);
      }
    });
  });

  inpField.addEventListener('input', () => {
    clearEmptyPromptRestoreTimer();
    if (isPromptVisuallyEmpty()) {
      scheduleEmptyPromptRestoreIfStillEmpty();
    }
  });

  let lastPreviewCol = currentPreviewColumn();
  const onResize = () => {
    const col = currentPreviewColumn();
    if (col === lastPreviewCol) return;
    lastPreviewCol = col;
    applyAuthoringPreviewGridLoadingPriorities(previewRows, currentStyleIdx, col);
    setPreviewPicture(previewForViewport(previewRows[currentStyleIdx], col));
  };
  window.addEventListener('resize', onResize);

  let interactivityTornDown = false;
  return () => {
    if (interactivityTornDown) return;
    interactivityTornDown = true;
    window.removeEventListener('resize', onResize);
    clearEmptyPromptRestoreTimer();
  };
}

function insertPromptBarStyleRoot(el, widgetInstance, widgetWrap, styleContainer, previewArea) {
  const controlsContainer = createTag('div', { class: 'unity-slf-controls' });
  controlsContainer.append(widgetWrap, styleContainer);

  const left = createTag('div', { class: 'unity-slf-left' });
  left.append(controlsContainer);

  const right = createTag('div', { class: 'unity-slf-right' });
  right.append(previewArea);

  const main = createTag('div', { class: 'unity-slf-main' });
  main.append(left, right);

  const skin = el.classList.contains('light') ? 'light' : 'dark';
  const interactiveShell = createTag('div', { class: `interactive-area ${skin}` });
  const root = createTag('div', { class: 'unity-prompt-bar-style unity-enabled' });
  interactiveShell.append(main);
  root.append(interactiveShell);

  const holder = createTag('div', { class: 'unity-slf-config-holder unity-slf-sr-only' });
  holder.setAttribute('aria-hidden', 'true');
  while (el.firstChild) {
    holder.append(el.firstChild);
  }
  el.append(holder);
  el.classList.add('unity-prompt-bar-style-host');

  if (el.parentNode) {
    el.parentNode.insertBefore(root, el);
  } else {
    el.append(root);
  }

  widgetInstance.promptBarStyleRoot = root;
}

async function mountPromptBarStyleUI(widgetInstance, parsed) {
  const { styles, previewRows } = parsed;
  if (!styles.length) return;

  const { el } = widgetInstance;
  widgetInstance.hasModelOptions = !!el.querySelector('[class*="icon-model"]');

  const [analyticsMod] = await Promise.all([
    import('../../../scripts/analytics.js'),
    widgetInstance.hasModelOptions ? widgetInstance.getModel() : Promise.resolve(),
  ]);
  widgetInstance.PROMPT_WITH_STYLE_UI = analyticsMod.PROMPT_WITH_STYLE_UI;

  const styleSectionHeadingText = placeholderRowText(el, 'icon-placeholder-style');

  const { widgetWrap, inpField } = await createPromptInputShell(widgetInstance, el, styles);
  const { styleContainer, styleItems, previewArea } = createStylePreviewSection(
    styles,
    previewRows,
    styleSectionHeadingText,
  );

  const disconnectInteractivity = attachPromptBarStyleInteractivity(styles, previewRows, inpField, styleItems, previewArea);
  insertPromptBarStyleRoot(el, widgetInstance, widgetWrap, styleContainer, previewArea);

  const root = widgetInstance.promptBarStyleRoot;
  let removalObserver = null;
  const teardownPromptBarStyle = () => {
    removalObserver?.disconnect();
    removalObserver = null;
    disconnectInteractivity();
    if (widgetInstance.disconnectPromptBarStyle === teardownPromptBarStyle) {
      widgetInstance.disconnectPromptBarStyle = null;
    }
  };
  if (root) {
    removalObserver = new MutationObserver(() => {
      if (!root.isConnected) teardownPromptBarStyle();
    });
    removalObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  widgetInstance.disconnectPromptBarStyle = teardownPromptBarStyle;
}

export default class PromptBarStyleWidget extends UnityWidget {
  constructor(...args) {
    super(...args);
    this.promptBarStyleRoot = null;
    this.disconnectPromptBarStyle = null;
  }

  async initWidget() {
    const parsed = parsePromptBarStyleAuthoring(this.el);
    if (!parsed.styles.length) return this.workflowCfg.targetCfg.actionMap;
    await mountPromptBarStyleUI(this, parsed);
    return this.workflowCfg.targetCfg.actionMap;
  }
}
