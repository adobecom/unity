/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */

import { createTag, getConfig } from '../../../scripts/utils.js';

/** Authoring: `icon-operation-<name>`; `<name>` is the current page key → `unity/configs/prompt/<name>.json`. */
const CURRENT_PAGE_ICON_PREFIX = 'icon-operation-';

let promptWithStyleEvents = null;

/**
 * Same `baseUrl` + `/unity/configs/prompt/...` pattern as `loadPrompts` / `loadModels` in
 * `prompt-bar.js` (e.g. firefly-prompt.json, model-picker.json).
 *
 * @returns {string}
 */
function getUnityPromptConfigsBaseUrl() {
  const { origin } = window.location;
  if (origin.includes('.aem.') || origin.includes('.hlx.')) {
    return `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`;
  }
  return origin;
}

/**
 * Read `<name>` from the first `icon-operation-<name>` class in the document (e.g. `Text2Speech`).
 *
 * @param {HTMLElement} root
 * @returns {string | null}
 */
function findCurrentPageName(root) {
  const el = root.querySelector(`[class*="${CURRENT_PAGE_ICON_PREFIX}"]`);
  if (!el) return null;
  const { className } = el;
  if (typeof className !== 'string' || !className) return null;
  const token = className.split(/\s+/).find(
    (c) => c.startsWith(CURRENT_PAGE_ICON_PREFIX) && c.length > CURRENT_PAGE_ICON_PREFIX.length,
  );
  if (!token) return null;
  return token.slice(CURRENT_PAGE_ICON_PREFIX.length) || null;
}

/**
 * Safe file basename for `unity/configs/prompt/{base}.json` (current page key from authoring).
 * Whitespace becomes `-` (e.g. `My Page` → `my-page`); other unsafe chars are removed.
 * The result is lowercased: paths on the host are case-sensitive, while authoring may use
 * `Text2Speech` for a file published as `text2speech.json` (see main Unity prompt configs).
 *
 * @param {string} name
 * @returns {string | null}
 */
function sanitizeCurrentPageFileBase(name) {
  if (!name || !name.trim()) return null;
  const normalized = name.trim().replace(/\s+/g, '-');
  const base = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!base) return null;
  return base.toLowerCase();
}

/**
 * Default `/{name}.json` under prompt configs; same locale rules as `loadPrompts` in `prompt-bar.js`.
 *
 * @param {string} pageName From `icon-operation-<pageName>` (current page / config key)
 * @returns {string | null}
 */
function getDefaultCurrentPageJsonUrl(pageName) {
  const fileBase = sanitizeCurrentPageFileBase(pageName);
  if (!fileBase) return null;
  const baseUrl = getUnityPromptConfigsBaseUrl();
  const { locale } = getConfig();
  return locale.prefix && locale.prefix !== '/'
    ? `${baseUrl}${locale.prefix}/unity/configs/prompt/${fileBase}.json`
    : `${baseUrl}/unity/configs/prompt/${fileBase}.json`;
}

/**
 * @param {Record<string, unknown>} item
 * @param {string} k
 * @returns {string}
 */
function currentPageConfigField(item, k) {
  const v = item[k];
  return v == null ? '' : String(v).trim();
}

/** Authoring: row with `placeholder-prompt-label` / `placeholder-prompt-default` (see `placeholderRowText`); `icon-placeholder-voice` for section heading. */
const PLACEHOLDER_PROMPT_LABEL = 'placeholder-prompt-label';
const PLACEHOLDER_DEFAULT_PROMPT = 'placeholder-prompt-default';
/** Subcopy below the voice tile row (order: explore, then terms). */
const PLACEHOLDER_EXPLORE = 'placeholder-explore';
const PLACEHOLDER_TERMS = 'placeholder-terms';

/**
 * @param {Array<{ modelId?: string, name: string, description: string, defaultPrompt: string, url: string, voiceId?: string }>} voices
 * @param {string} selectedModelId From model dropdown (`data-model-id` / `selectedModelId`)
 * @returns {Array<{ modelId?: string, name: string, description: string, defaultPrompt: string, url: string, voiceId?: string }>}
 */
function filterVoicesByModelId(voices, selectedModelId) {
  const id = (selectedModelId || '').trim();
  if (!id) return voices;
  return voices.filter((v) => {
    const m = v.modelId;
    if (m == null || String(m).trim() === '') return true;
    return String(m).trim().toLowerCase() === id.toLowerCase();
  });
}

/**
 * Fills in `defaultPrompt` from authoring when JSON omits a non-empty `defaultPrompt` per row.
 * JSON / sheet `defaultPrompt` wins when present and non-empty after trim.
 * @param {Array<Record<string, unknown>>} voices
 * @param {string} domDefault
 * @returns {Array<Record<string, unknown>>}
 */
function mergeVoicesWithAuthoringDefault(voices, domDefault) {
  const d = (domDefault || '').trim();
  if (!d || !Array.isArray(voices) || !voices.length) return voices;
  return voices.map((v) => {
    const fromJson = v?.defaultPrompt != null && String(v.defaultPrompt).trim() !== ''
      ? String(v.defaultPrompt).trim()
      : '';
    if (fromJson) return { ...v, defaultPrompt: fromJson };
    return { ...v, defaultPrompt: d };
  });
}

/**
 * Map one JSON / sheet row to a voice tile entry.
 * Expected columns: `Model`, `Name`, `Description`, `VoiceId`, `url` (optional `defaultPrompt`).
 * Legacy keys (`displayName`, `name`, etc.) are still accepted for older configs.
 *
 * @param {Record<string, unknown>} item
 * @returns {{ name: string, description: string, defaultPrompt: string, url: string, voiceId?: string, modelId?: string } | null}
 */
function currentPageConfigItemToVoice(item) {
  if (!item || typeof item !== 'object') return null;
  const name = currentPageConfigField(item, 'Name')
    || currentPageConfigField(item, 'name')
    || currentPageConfigField(item, 'displayName')
    || currentPageConfigField(item, 'Display Name');
  const url = currentPageConfigField(item, 'url') || currentPageConfigField(item, 'URL');
  if (!name || !url) return null;
  if (!/^https:\/\//i.test(url)) return null;
  const voiceIdRaw = currentPageConfigField(item, 'VoiceId') || currentPageConfigField(item, 'voiceId');
  const modelIdRaw = currentPageConfigField(item, 'Model') || currentPageConfigField(item, 'model');
  const description = currentPageConfigField(item, 'Description') || currentPageConfigField(item, 'description');
  const defaultPrompt = currentPageConfigField(item, 'defaultPrompt') || currentPageConfigField(item, 'DefaultPrompt');
  return {
    name: name || 'Voice',
    description,
    defaultPrompt,
    url,
    ...(voiceIdRaw ? { voiceId: voiceIdRaw } : {}),
    ...(modelIdRaw ? { modelId: modelIdRaw } : {}),
  };
}

/**
 * Same as `loadPrompts` / `loadModels`: `fetch` + `res.json()`, then `content.data` (array) or `content.data.voices`.
 *
 * @param {string} sourceUrl Absolute URL to the current page config JSON
 * @returns {Promise<Array<{ name: string, description: string, defaultPrompt: string, url: string, voiceId?: string }>>}
 */
async function loadVoicesFromCurrentPageJson(sourceUrl) {
  const finalUrl = sourceUrl?.trim();
  if (!finalUrl) return [];
  const res = await fetch(finalUrl);
  if (!res.ok) {
    throw new Error(`Current page config fetch failed: ${res.status}`);
  }
  const json = await res.json();
  const data = json?.content?.data;
  let rows = [];
  if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === 'object' && Array.isArray(data.voices)) {
    rows = data.voices;
  }
  if (!rows.length) return [];
  return rows
    .map((row) => currentPageConfigItemToVoice(/** @type {Record<string, unknown>} */ (row)))
    .filter((v) => v != null);
}

/**
 * If authoring includes `icon-operation-<name>`, load voices from
 * `unity/configs/prompt/<name>.json` (with locale prefix like `loadPrompts`), or from the
 * list item’s `a[href]` when it points at a `.json` file.
 *
 * @param {HTMLElement} root
 * @returns {string | null}
 */
function resolveCurrentPageSourceFromAuthoring(root) {
  const pageName = findCurrentPageName(root);
  if (!pageName) return null;
  const icon = root.querySelector(`[class*="${CURRENT_PAGE_ICON_PREFIX}"]`);
  const li = icon?.closest('li');
  const a = li?.querySelector('a[href]');
  const href = a?.getAttribute('href')?.trim();
  if (href) {
    try {
      const u = new URL(href, window.location.href);
      if (/\.json$/i.test(u.pathname || '')) {
        return u.href;
      }
    } catch {
      /* invalid href */
    }
  }
  return getDefaultCurrentPageJsonUrl(pageName);
}

class UnityWidget {
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
    this.hasVoiceOptions = false;
    this.voices = null;
    /** @type {Array<{ modelId?: string, name: string, description: string, defaultPrompt: string, url: string, voiceId?: string }> | null} */
    this.voiceConfigAll = null;
    /** Filled in init; `placeholderRowText` for {@link PLACEHOLDER_DEFAULT_PROMPT} */
    this.defaultPromptFromAuthoring = '';
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
      this.showVerbOrModelMenuAndTrackOpen(selectedElement, promptWithStyleEvents.MODULE_PICKER);
      document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        this.showVerbOrModelMenuAndTrackOpen(selectedElement, promptWithStyleEvents.MODULE_PICKER);
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

  showVerbOrModelMenuAndTrackOpen(selectedElement, adobeEventName) {
    const menuContainer = selectedElement.parentElement;
    const wasOpen = menuContainer.classList.contains('show-menu');
    this.hidePromptDropdown(selectedElement);
    this.showVerbMenu(selectedElement);
    if (!wasOpen) {
      this.widgetWrap.dispatchEvent(new CustomEvent('firefly-analytics', {
        detail: {
          adobeEventName,
          splunkData: { action: 'open' },
        },
      }));
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
      let previousModelId = '';
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
        previousModelId = this.selectedModelId || '';
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
      if (modelList && typeof this.refreshVoiceTilesForModel === 'function') {
        this.refreshVoiceTilesForModel(previousModelId);
      }
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
    listContainer.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const menuContainer = selectedElement.parentElement;
      if (!menuContainer?.classList.contains('show-menu')) return;
      const links = listContainer.querySelectorAll('.verb-link');
      if (!links.length) return;
      const active = document.activeElement;
      const idx = [...links].findIndex((a) => a === active || a.contains(active));
      if (idx < 0) return;
      const atStart = idx === 0;
      const atEnd = idx === links.length - 1;
      if ((e.shiftKey && atStart) || (!e.shiftKey && atEnd)) {
        this.closeVerbOrModelMenu(selectedElement);
      }
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
      this.showVerbOrModelMenuAndTrackOpen(selectedElement, promptWithStyleEvents.MODEL_SELECT_DROPDOWN);
      document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        this.showVerbOrModelMenuAndTrackOpen(selectedElement, promptWithStyleEvents.MODEL_SELECT_DROPDOWN);
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
    const btn = createTag('a', { href: '#', class: `unity-act-btn ${cls}`, 'daa-ll': promptWithStyleEvents.GENERATE_CTA, 'aria-label': `${txt?.split('\n')[0]} ${this.selectedVerbText}` });
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
    const modelFile = `${baseUrl}/unity/configs/prompt/model-picker1.json`;
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

  /**
   * Loads voice tiles from the current page JSON (same source as in `initWidget` when
   * `icon-operation-<name>` / authoring `a[href$=".json"]` is present).
   */
  async loadVoices() {
    const currentPageSourceUrl = resolveCurrentPageSourceFromAuthoring(this.el);
    if (!currentPageSourceUrl) {
      this.voices = [];
      this.voiceConfigAll = [];
      return;
    }
    const raw = await loadVoicesFromCurrentPageJson(currentPageSourceUrl);
    const domDef = (this.defaultPromptFromAuthoring || '').trim();
    this.voices = mergeVoicesWithAuthoringDefault(raw, domDef);
    this.voiceConfigAll = this.voices;
  }

  /**
   * Returns voice list for the current page config (filtered by selected model when `Model` is set in JSON);
   * loads on first use (see `getPrompt` / `getModel`).
   * @returns {Promise<Array<{ name: string, description: string, defaultPrompt: string, url: string, voiceId?: string, modelId?: string }>>}
   */
  async getVoice() {
    if (!this.hasVoiceOptions) return [];
    try {
      if (this.voices == null) {
        await this.loadVoices();
      }
      const all = this.voiceConfigAll != null ? this.voiceConfigAll : (this.voices || []);
      const list = Array.isArray(all) ? all : [];
      const mid = (this.selectedModelId
        || this.widgetWrap?.getAttribute('data-selected-model-id')
        || '').trim();
      return filterVoicesByModelId(list, mid);
    } catch (e) {
      window.lana?.log(`Message: Error loading voices, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  async updateDropdownForVerb() {
    await Promise.resolve();
  }
}

const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;

/** @type {WeakMap<object, { audio: HTMLAudioElement, ringFg: SVGCircleElement, playing: boolean }>} */
const voiceTileState = new WeakMap();

function placeholderRowText(root, iconClass) {
  const icon = root.querySelector(`.${iconClass}`)
    || root.querySelector(`[class*="${iconClass}"]`);
  if (!icon) return '';
  return (icon.closest('li')?.innerText || '').replace(/\s+/g, ' ').trim();
}

/**
 * Markup in the placeholder row after the icon (keeps &lt;a&gt; from authoring). Treated as author HTML.
 * @param {Element} root
 * @param {string} iconClass
 * @returns {string}
 */
function placeholderRowHtmlAfterIcon(root, iconClass) {
  if (!root) return '';
  const icon = root.querySelector(`.${iconClass}`)
    || root.querySelector(`[class*="${iconClass}"]`);
  if (!icon) return '';
  const li = icon.closest('li');
  if (!li) return '';
  const clone = li.cloneNode(true);
  const rm = clone.querySelector(`.${iconClass}`) || clone.querySelector(`[class*="${iconClass}"]`);
  if (rm) rm.remove();
  return (clone.innerHTML || '').replace(/^\s+/, '').trim();
}

/**
 * First non-config https link in authoring (skips `.json` URLs), for optional footer.
 *
 * @param {HTMLElement} root
 * @returns {{ href: string, text: string } | null }
 */
function findFooterLinkInRoot(root) {
  const anchors = Array.from(root.querySelectorAll('a[href^="https://"]'));
  const a = anchors.find((el) => {
    const href = el.getAttribute('href')?.trim() ?? '';
    if (!href) return false;
    try {
      if (/\.json$/i.test(new URL(href, window.location.href).pathname)) return false;
    } catch {
      return false;
    }
    return true;
  });
  if (!a) return null;
  const href = a.getAttribute('href')?.trim() ?? '';
  return { href, text: a.textContent?.trim() || href };
}

/**
 * Read section heading, current-page JSON URL, default prompt, explore (`{@link PLACEHOLDER_EXPLORE}`) and terms (`{@link PLACEHOLDER_TERMS}`) markup, and optional legacy footer link.
 * Explore renders inside the voice card; terms render below `.interactive-area` (still inside `.unity-prompt-bar-audio`).
 * Voice tiles and `defaultPrompt` per row (when in JSON) come from `loadVoicesFromCurrentPageJson` in `initWidget`
 * when `currentPageSourceUrl` is set; when a row has no `defaultPrompt`, the DOM `defaultPromptFromAuthoring` is used.
 *
 * @param {HTMLElement} root
 * @returns {{
 *   footerLink: { href: string, text: string } | null,
 *   sectionHeading: string,
 *   currentPageSourceUrl: string | null,
 *   defaultPromptFromAuthoring: string,
 *   exploreHtml: string,
 *   termsHtml: string
 * }}
 */
export function parsePromptBarAudioAuthoring(root) {
  return {
    footerLink: findFooterLinkInRoot(root),
    sectionHeading: placeholderRowText(root, 'icon-placeholder-voice') || 'Choose a voice',
    currentPageSourceUrl: resolveCurrentPageSourceFromAuthoring(root),
    defaultPromptFromAuthoring: placeholderRowText(root, PLACEHOLDER_DEFAULT_PROMPT) || '',
    exploreHtml: placeholderRowHtmlAfterIcon(root, PLACEHOLDER_EXPLORE) || '',
    termsHtml: placeholderRowHtmlAfterIcon(root, PLACEHOLDER_TERMS) || '',
  };
}

function buildVoiceTile(voice, index, row, widgetInstance) {
  const { name, description, url, voiceId } = voice;
  const tile = createTag('div', {
    class: 'unity-paf-voice-tile',
    role: 'listitem',
    tabindex: '0',
    'aria-pressed': 'false',
    'data-voice-index': String(index),
    'data-voice-name': name,
  });
  if (voiceId) tile.setAttribute('data-voice-id', voiceId);

  const textCol = createTag('div', { class: 'unity-paf-voice-tile-text' });
  textCol.append(
    createTag('span', { class: 'unity-paf-voice-name' }, name),
    createTag('span', { class: 'unity-paf-voice-desc' }, description),
  );

  const player = createTag('div', { class: 'unity-paf-voice-player' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'unity-paf-progress-svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  const ringBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ringBg.setAttribute('class', 'unity-paf-ring-bg');
  ringBg.setAttribute('cx', '24');
  ringBg.setAttribute('cy', '24');
  ringBg.setAttribute('r', String(RING_R));
  ringBg.setAttribute('fill', 'none');
  ringBg.setAttribute('stroke-width', '2');
  const ringFg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ringFg.setAttribute('class', 'unity-paf-ring-fg');
  ringFg.setAttribute('cx', '24');
  ringFg.setAttribute('cy', '24');
  ringFg.setAttribute('r', String(RING_R));
  ringFg.setAttribute('fill', 'none');
  ringFg.setAttribute('stroke-width', '2');
  ringFg.setAttribute('transform', 'rotate(-90 24 24)');
  ringFg.style.strokeDasharray = String(RING_C);
  ringFg.style.strokeDashoffset = String(RING_C);
  svg.append(ringBg, ringFg);

  const center = createTag('div', { class: 'unity-paf-pp-center' });
  const iconPlay = '<svg class="unity-paf-pp-svg" width="20" height="20" aria-hidden="true"><use xlink:href="#unity-play-icon"></use></svg>';
  const iconPause = '<svg class="unity-paf-pp-svg" width="20" height="20" aria-hidden="true"><use xlink:href="#unity-pause-icon"></use></svg>';
  center.innerHTML = iconPlay;

  const audioObj = new Audio(url);
  audioObj.preload = 'auto';
  voiceTileState.set(tile, { audio: audioObj, ringFg, playing: false });
  player.append(svg, center);

  tile.append(textCol, player);
  row.append(tile);

  const setRingProgress = (t) => {
    const a = audioObj;
    if (!Number.isFinite(a.duration) || a.duration <= 0) return;
    const p = t / a.duration;
    ringFg.style.strokeDashoffset = String(RING_C * (1 - p));
  };

  const showPlayIcon = () => { center.innerHTML = iconPlay; };
  const showPauseIcon = () => { center.innerHTML = iconPause; };

  let rafId = null;
  const tick = () => {
    if (audioObj.paused && !audioObj.ended) {
      rafId = null;
      return;
    }
    setRingProgress(audioObj.currentTime);
    rafId = requestAnimationFrame(tick);
  };

  const startRaf = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  };
  const stopRaf = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  audioObj.addEventListener('loadedmetadata', () => {
    const dur = Number.isFinite(audioObj.duration) && audioObj.duration > 0 ? audioObj.duration : 0;
    if (dur > 0) widgetInstance.durationCache.set(url, dur);
    setRingProgress(0);
  });
  audioObj.addEventListener('play', () => {
    const st = voiceTileState.get(tile);
    if (st) st.playing = true;
    showPauseIcon();
    tile.setAttribute('aria-pressed', 'true');
    startRaf();
  });
  audioObj.addEventListener('pause', () => {
    const atEnd = audioObj.ended || (Number.isFinite(audioObj.duration) && audioObj.currentTime >= audioObj.duration - 0.25);
    const stPause = voiceTileState.get(tile);
    if (stPause) stPause.playing = !atEnd && audioObj.currentTime > 0;
    showPlayIcon();
    if (atEnd) {
      setRingProgress(0);
      ringFg.style.strokeDashoffset = String(RING_C);
    } else {
      setRingProgress(audioObj.currentTime);
    }
    tile.setAttribute('aria-pressed', 'false');
    stopRaf();
  });
  audioObj.addEventListener('ended', () => {
    const stEnd = voiceTileState.get(tile);
    if (stEnd) stEnd.playing = false;
    showPlayIcon();
    setRingProgress(0);
    ringFg.style.strokeDashoffset = String(RING_C);
    tile.setAttribute('aria-pressed', 'false');
    try { audioObj.currentTime = 0; } catch (e) { /* noop */ }
    stopRaf();
  });
  audioObj.addEventListener('error', () => {
    try {
      widgetInstance.widgetWrap?.dispatchEvent(new CustomEvent('firefly-audio-error', { detail: { error: 'audio-playback-failed' } }));
    } catch (e) { /* noop */ }
  });
  return tile;
}

/**
 * @param {HTMLElement[]} tiles
 * @param {import('../prompt-bar-style/prompt-bar-style.js').UnityWidget} widgetInstance
 * @param {HTMLTextAreaElement} inpField
 * @param {Array<{ defaultPrompt: string, voiceId?: string }>} voices
 */
function attachVoiceInteractivity(tiles, widgetInstance, inpField, voices) {
  const tilesArr = tiles;
  /** @type {number} No tile selected until user activates one */
  let selectedIdx = -1;
  const defaultFor = (i) => voices[i]?.defaultPrompt ?? '';
  const baselinePromptWhenNoneSelected = () => defaultFor(0)
    || (widgetInstance.voiceConfigAll?.[0]?.defaultPrompt ?? '')
    || (widgetInstance.defaultPromptFromAuthoring ?? '');

  function setSelectedVisual(idx) {
    selectedIdx = idx;
    if (idx < 0) {
      widgetInstance.widgetWrap.removeAttribute('data-selected-voice-index');
      widgetInstance.widgetWrap.removeAttribute('data-selected-voice-name');
      widgetInstance.widgetWrap.removeAttribute('data-selected-voice-id');
      tilesArr.forEach((t) => {
        t.classList.remove('selected');
        t.removeAttribute('aria-current');
      });
      return;
    }
    widgetInstance.widgetWrap.setAttribute('data-selected-voice-index', String(idx));
    widgetInstance.widgetWrap.setAttribute('data-selected-voice-name', voices[idx]?.name ?? '');
    const voiceId = voices[idx]?.voiceId;
    if (voiceId) widgetInstance.widgetWrap.setAttribute('data-selected-voice-id', voiceId);
    else widgetInstance.widgetWrap.removeAttribute('data-selected-voice-id');
    tilesArr.forEach((t, i) => {
      t.classList.toggle('selected', i === idx);
      if (i === idx) t.setAttribute('aria-current', 'true');
      else t.removeAttribute('aria-current');
    });
  }

  function resetTileIdle(tile) {
    const p = voiceTileState.get(tile);
    if (!p) return;
    try { p.audio.pause(); } catch (e) { /* noop */ }
    try { p.audio.currentTime = 0; } catch (e) { /* noop */ }
    p.playing = false;
    p.ringFg.style.strokeDashoffset = String(RING_C);
    const center = tile.querySelector('.unity-paf-pp-center');
    if (center) {
      center.innerHTML = '<svg class="unity-paf-pp-svg" width="20" height="20" aria-hidden="true"><use xlink:href="#unity-play-icon"></use></svg>';
    }
    tile.setAttribute('aria-pressed', 'false');
  }

  function syncPromptIfStuckToDefaults(prevIdx, newIdx) {
    const prevDef = prevIdx >= 0 ? defaultFor(prevIdx) : baselinePromptWhenNoneSelected();
    const nextDef = defaultFor(newIdx);
    const { value } = inpField;
    if (value === prevDef || value.trim() === '') {
      inpField.value = nextDef;
    }
  }

  function toggleTile(idx) {
    const tile = tilesArr[idx];
    const p = tile && voiceTileState.get(tile);
    if (!p) return;
    const { audio } = p;
    const isPlaying = !audio.paused && !audio.ended;
    if (isPlaying) {
      audio.pause();
      return;
    }
    audio.play().catch(() => {
      try {
        widgetInstance.widgetWrap?.dispatchEvent(new CustomEvent('firefly-audio-error', { detail: { error: 'audio-playback-failed' } }));
      } catch (e) { /* noop */ }
    });
  }

  function onTileActivate(idx) {
    if (idx !== selectedIdx) {
      syncPromptIfStuckToDefaults(selectedIdx, idx);
      setSelectedVisual(idx);
      tilesArr.forEach((t, i) => { if (i !== idx) resetTileIdle(t); });
      voiceTileState.get(tilesArr[idx])?.audio.play().catch(() => {
        try {
          widgetInstance.widgetWrap?.dispatchEvent(new CustomEvent('firefly-audio-error', { detail: { error: 'audio-playback-failed' } }));
        } catch (e) { /* noop */ }
      });
      return;
    }
    toggleTile(idx);
  }

  tilesArr.forEach((tile, idx) => {
    tile.addEventListener('click', (ev) => {
      if (ev.target?.closest && ev.target.closest('a[href]')) return;
      ev.preventDefault();
      onTileActivate(idx);
    });
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onTileActivate(idx);
      }
    });
  });

  setSelectedVisual(-1);
  return () => { tilesArr.forEach(resetTileIdle); };
}

/**
 * @param {InstanceType<typeof import('../prompt-bar-style/prompt-bar-style.js').UnityWidget>} widgetInstance
 * @param {HTMLElement} el
 * @param {string} defaultPrompt
 * @param {{ PROMPT_WITH_STYLE_EVENTS?: { GENERATE_CTA?: string, ENTER_PROMPT?: string } }} analyticsMod
 */
async function createPromptAudioInputShell(widgetInstance, el, defaultPrompt, analyticsMod) {
  const pws = analyticsMod?.PROMPT_WITH_STYLE_EVENTS;
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
  const promptLabelText = placeholderRowText(el, PLACEHOLDER_PROMPT_LABEL);
  const inpWrap = createTag('div', { class: 'inp-wrap' });
  const promptLabel = createTag('label', { for: 'promptInput', class: 'unity-slf-copy-label unity-slf-prompt-label' }, promptLabelText);
  const inpField = createTag('textarea', {
    id: 'promptInput',
    class: 'inp-field',
    'aria-autocomplete': 'list',
    'aria-haspopup': 'listbox',
    rows: '4',
  });
  inpField.value = defaultPrompt;
  let promptEngagedTracked = false;
  inpField.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target !== inpField) return;
    widgetInstance.hidePromptDropdown();
    if (!promptEngagedTracked && pws?.ENTER_PROMPT) {
      promptEngagedTracked = true;
      const det = { adobeEventName: pws.ENTER_PROMPT, splunkData: { action: 'enter-prompt' } };
      widgetInstance.widgetWrap?.dispatchEvent(new CustomEvent('firefly-analytics', { detail: det }));
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
      'daa-ll': pws?.GENERATE_CTA ?? 'Generate',
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

/**
 * @param {HTMLElement} container
 */
function enhanceSubfootExternalLinks(container) {
  if (!container) return;
  container.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href')?.trim() || '';
    if (!href) return;
    if (/^javascript:/i.test(href)) return;
    if (/^https?:\/\//i.test(href) || href.startsWith('//')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

/**
 * Explore link (and legacy single footer link) stay inside the rounded prompt card, below the tile row.
 * @param {HTMLElement} section Voice section inside `.unity-slf-left`
 * @param {string} exploreHtml
 * @param {{ href: string, text: string } | null} footerLink Legacy: used when no explore markup
 */
function appendVoiceExploreSubfoot(section, exploreHtml, footerLink) {
  const ex = (exploreHtml || '').trim();
  if (ex) {
    const wrap = createTag('div', { class: 'unity-paf-voice-subfoot' });
    const p = createTag('p', { class: 'unity-paf-voice-subfoot-line' });
    p.innerHTML = ex;
    enhanceSubfootExternalLinks(p);
    wrap.append(p);
    section.append(wrap);
  } else if (footerLink) {
    const foot = createTag('p', { class: 'unity-paf-voice-footer' });
    const a = createTag('a', { href: footerLink.href, class: 'unity-paf-voice-footer-link' });
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = footerLink.text;
    foot.append(a);
    section.append(foot);
  }
}

/**
 * Terms copy from `placeholder-terms`: rendered outside `.interactive-area`, below it (sibling under `.unity-prompt-bar-audio`).
 * @param {string} termsHtml
 * @returns {HTMLElement | null}
 */
function buildTermsBannerElement(termsHtml) {
  const te = (termsHtml || '').trim();
  if (!te) return null;
  const outer = createTag('div', {
    class: 'unity-paf-terms-banner',
    role: 'note',
  });
  const p = createTag('p', { class: 'unity-paf-terms-banner-line' });
  p.innerHTML = te;
  enhanceSubfootExternalLinks(p);
  outer.append(p);
  return outer;
}

/**
 * @param {Array<{ modelId?: string, name: string, description: string, defaultPrompt: string, url: string, voiceId?: string }>} voices
 * @param {string} sectionHeading
 * @param {{ href: string, text: string } | null} footerLink
 * @param {import('../prompt-bar-style/prompt-bar-style.js').UnityWidget} widgetInstance
 * @param {{ serverVoiceRowCount?: number, exploreHtml?: string }=} opts When the sheet has rows but none match the current model, still show the section with an empty row.
 */
function createVoiceStrip(voices, sectionHeading, footerLink, widgetInstance, opts = {}) {
  const { serverVoiceRowCount = 0, exploreHtml = '' } = opts;
  if (serverVoiceRowCount === 0) return { section: null, tiles: [] };
  if (!voices.length) {
    const sectionEmpty = createTag('div', { class: 'unity-paf-voice-section' });
    const headingEmpty = createTag(
      'p',
      { class: 'unity-slf-copy-label unity-paf-voice-heading' },
      sectionHeading,
    );
    const rowEmpty = createTag('div', { class: 'unity-paf-voice-row', role: 'list', 'aria-label': 'Voice samples' });
    sectionEmpty.append(headingEmpty, rowEmpty);
    appendVoiceExploreSubfoot(sectionEmpty, exploreHtml, footerLink);
    return { section: sectionEmpty, tiles: [] };
  }
  const section = createTag('div', { class: 'unity-paf-voice-section' });
  const heading = createTag(
    'p',
    { class: 'unity-slf-copy-label unity-paf-voice-heading' },
    sectionHeading,
  );
  const row = createTag('div', { class: 'unity-paf-voice-row', role: 'list', 'aria-label': 'Voice samples' });
  const tiles = voices.map((v, i) => buildVoiceTile(v, i, row, widgetInstance));
  section.append(heading, row);
  appendVoiceExploreSubfoot(section, exploreHtml, footerLink);
  return { section, tiles };
}

/**
 * @param {HTMLElement} el
 * @param {import('../prompt-bar-style/prompt-bar-style.js').UnityWidget} widgetInstance
 * @param {HTMLElement} widgetWrap
 * @param {HTMLElement | null} voiceSection
 * @param {HTMLElement | null} termsBanner Below `.interactive-area`, sibling under `.unity-prompt-bar-audio` (`placeholder-terms`)
 */
function insertPromptBarAudioRoot(el, widgetInstance, widgetWrap, voiceSection, termsBanner) {
  const controls = createTag('div', { class: 'unity-slf-controls' });
  controls.append(widgetWrap);
  if (voiceSection) controls.append(voiceSection);
  const left = createTag('div', { class: 'unity-slf-left' });
  left.append(controls);
  const main = createTag('div', { class: 'unity-paf-main' });
  main.append(left);
  const skin = el.classList.contains('light') ? 'light' : 'dark';
  const interactiveShell = createTag('div', { class: `interactive-area ${skin}` });
  const root = createTag('div', { class: 'unity-prompt-bar-audio unity-enabled' });
  interactiveShell.append(main);
  root.append(interactiveShell);
  if (termsBanner) root.append(termsBanner);
  const holder = createTag('div', { class: 'unity-slf-config-holder unity-slf-sr-only' });
  holder.setAttribute('aria-hidden', 'true');
  while (el.firstChild) {
    holder.append(el.firstChild);
  }
  el.append(holder);
  el.classList.add('unity-prompt-bar-audio-host');
  if (el.parentNode) {
    el.parentNode.insertBefore(root, el);
  } else {
    el.append(root);
  }
  widgetInstance.promptBarAudioRoot = root;
}

/**
 * @param {import('../prompt-bar-style/prompt-bar-style.js').UnityWidget} widgetInstance
 * @param {ReturnType<typeof parsePromptBarAudioAuthoring> & {
 *   voices: Array<{ name: string, description: string, defaultPrompt: string, url: string, voiceId?: string, modelId?: string }>
 * }} parsed
 */
async function mountPromptBarAudioUI(widgetInstance, parsed) {
  const {
    voices,
    footerLink,
    sectionHeading,
    defaultPromptFromAuthoring: domAuthoring = '',
    exploreHtml = '',
    termsHtml = '',
  } = parsed;
  const allVoices = Array.isArray(voices) ? voices : [];
  const domDef = (domAuthoring || '').trim();
  widgetInstance.defaultPromptFromAuthoring = domDef;
  widgetInstance.voiceConfigAll = allVoices;
  const [analyticsMod] = await Promise.all([
    import('../../../scripts/analytics.js'),
    widgetInstance.hasModelOptions ? widgetInstance.getModel() : Promise.resolve(),
  ]);
  promptWithStyleEvents = analyticsMod.PROMPT_WITH_STYLE_EVENTS;
  const { el } = widgetInstance;
  widgetInstance.hasModelOptions = !!el.querySelector('[class*="icon-model"]');
  const { widgetWrap, inpField } = await createPromptAudioInputShell(
    widgetInstance,
    el,
    '',
    analyticsMod,
  );
  const selectedModelId = (widgetInstance.selectedModelId
    || widgetInstance.widgetWrap?.getAttribute('data-selected-model-id')
    || '').trim();
  const visibleVoices = filterVoicesByModelId(allVoices, selectedModelId);
  if (inpField) {
    inpField.value = visibleVoices[0]?.defaultPrompt
      ?? allVoices[0]?.defaultPrompt
      ?? domDef
      ?? '';
  }
  const { section: voiceSection, tiles } = createVoiceStrip(
    visibleVoices,
    sectionHeading,
    footerLink,
    widgetInstance,
    {
      serverVoiceRowCount: allVoices.length,
      exploreHtml: exploreHtml || '',
    },
  );
  const termsBanner = buildTermsBannerElement(termsHtml || '');
  const disconnectFirst = visibleVoices.length
    ? attachVoiceInteractivity(tiles, widgetInstance, inpField, visibleVoices)
    : () => {};
  widgetInstance.voicePromptInpField = inpField;
  widgetInstance.teardownVoiceTiles = disconnectFirst;
  /**
   * @param {string} [previousModelId] Model id before a dropdown change (for prompt default heuristics)
   */
  widgetInstance.refreshVoiceTilesForModel = function refreshVoiceTilesForModel(previousModelId) {
    const all = this.voiceConfigAll;
    if (!all || !all.length) return;
    const root = this.promptBarAudioRoot;
    const row = root?.querySelector?.('.unity-paf-voice-row') ?? null;
    if (!row) return;
    if (this.teardownVoiceTiles) {
      try { this.teardownVoiceTiles(); } catch (err) { /* noop */ }
      this.teardownVoiceTiles = null;
    }
    const mid = (this.selectedModelId || this.widgetWrap?.getAttribute('data-selected-model-id') || '').trim();
    const oldVisible = filterVoicesByModelId(all, (previousModelId || '').trim());
    const oldFirstDef = oldVisible[0]?.defaultPrompt ?? this.defaultPromptFromAuthoring ?? '';
    row.replaceChildren();
    const visible = filterVoicesByModelId(all, mid);
    if (this.voicePromptInpField) {
      const cur = (this.voicePromptInpField.value || '').trim();
      if (visible.length > 0 && (cur === '' || cur === oldFirstDef)) {
        this.voicePromptInpField.value = visible[0].defaultPrompt
          ?? (this.defaultPromptFromAuthoring || '')
          ?? '';
      } else if (!visible.length) {
        this.voicePromptInpField.value = '';
      }
    }
    if (visible.length === 0) {
      this.widgetWrap?.removeAttribute('data-selected-voice-index');
      this.widgetWrap?.removeAttribute('data-selected-voice-name');
      this.widgetWrap?.removeAttribute('data-selected-voice-id');
      return;
    }
    const newTiles = visible.map((v, i) => buildVoiceTile(v, i, row, this));
    this.teardownVoiceTiles = attachVoiceInteractivity(
      newTiles,
      this,
      this.voicePromptInpField,
      visible,
    );
  };

  insertPromptBarAudioRoot(el, widgetInstance, widgetWrap, voiceSection, termsBanner);
  const root = widgetInstance.promptBarAudioRoot;
  let removalObserver = null;
  let interactivityTornDown = false;
  const teardown = () => {
    if (interactivityTornDown) return;
    interactivityTornDown = true;
    removalObserver?.disconnect();
    removalObserver = null;
    if (widgetInstance.teardownVoiceTiles) {
      try { widgetInstance.teardownVoiceTiles(); } catch (e) { /* noop */ }
      widgetInstance.teardownVoiceTiles = null;
    }
    delete widgetInstance.refreshVoiceTilesForModel;
    if (widgetInstance.disconnectPromptBarAudio === teardown) {
      widgetInstance.disconnectPromptBarAudio = null;
    }
  };
  if (root) {
    removalObserver = new MutationObserver(() => {
      if (!root.isConnected) teardown();
    });
    removalObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  widgetInstance.disconnectPromptBarAudio = teardown;
}

export default class PromptBarAudioWidget extends UnityWidget {
  constructor(...args) {
    super(...args);
    /** @type {HTMLElement | null} */
    this.promptBarAudioRoot = null;
    this.disconnectPromptBarAudio = null;
  }

  async initWidget() {
    const meta = parsePromptBarAudioAuthoring(this.el);
    const {
      footerLink,
      sectionHeading,
      currentPageSourceUrl,
      defaultPromptFromAuthoring,
      exploreHtml,
      termsHtml,
    } = meta;
    const domDef = (defaultPromptFromAuthoring || '').trim();
    this.defaultPromptFromAuthoring = domDef;
    this.hasVoiceOptions = !!currentPageSourceUrl;
    let voices = null;
    if (currentPageSourceUrl) {
      try {
        voices = await loadVoicesFromCurrentPageJson(currentPageSourceUrl);
      } catch (e) {
        window.lana?.log(`Message: current page config json load failed, Error: ${e}`, this.lanaOptions);
        voices = [];
      }
    }
    const raw = Array.isArray(voices) ? voices : [];
    const merged = mergeVoicesWithAuthoringDefault(raw, domDef);
    this.voices = merged;
    this.voiceConfigAll = merged;
    const { el } = this;
    this.hasModelOptions = !!el.querySelector('[class*="icon-model"]');
    await mountPromptBarAudioUI(this, {
      voices: merged,
      footerLink,
      sectionHeading,
      defaultPromptFromAuthoring: domDef,
      exploreHtml: exploreHtml || '',
      termsHtml: termsHtml || '',
    });
    return this.workflowCfg.targetCfg.actionMap;
  }
}
