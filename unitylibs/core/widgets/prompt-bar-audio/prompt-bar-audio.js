/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */

import { createTag } from '../../../scripts/utils.js';

let promptWithStyleEvents = null;

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

  async updateDropdownForVerb() {
    await Promise.resolve();
  }
}

const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;

/** @type {WeakMap<object, { audio: HTMLAudioElement, ringFg: SVGCircleElement, playing: boolean }>} */
const voiceTileState = new WeakMap();

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

function placeholderRowText(root, iconClass) {
  const icon = root.querySelector(`.${iconClass}`)
    || root.querySelector(`[class*="${iconClass}"]`);
  if (!icon) return '';
  return (icon.closest('li')?.innerText || '').replace(/\s+/g, ' ').trim();
}

function stripTags(html) {
  const t = document.createElement('div');
  t.innerHTML = html;
  return t.textContent?.trim() ?? '';
}

/**
 * @param {HTMLLIElement} li
 * @returns {{ name: string, description: string, defaultPrompt: string, url: string } | null}
 */
export function parseVoiceLi(li) {
  const link = li.querySelector('a[href]');
  if (!link) return null;
  const url = link.getAttribute('href')?.trim() ?? '';
  if (!url || !/^https:\/\//i.test(url)) return null;
  const clone = li.cloneNode(true);
  clone.querySelectorAll('a').forEach((a) => a.remove());
  const parts = clone.innerHTML
    .split(/<br\s*\/?>/i)
    .map((p) => stripTags(p))
    .filter(Boolean);
  const name = parts[0] || 'Voice';
  const description = parts[1] || '';
  const defaultPrompt = parts[2] || '';
  return { name, description, defaultPrompt, url };
}

/**
 * @param {HTMLElement} root
 */
export function parsePromptBarAudioAuthoring(root) {
  let topDivs = [...root.children].filter((n) => n.nodeName === 'DIV');
  if (topDivs.length === 1) {
    const inner = topDivs[0];
    topDivs = [...inner.children].filter((n) => n.nodeName === 'DIV');
  }
  if (topDivs.length < 2) {
    return { voices: [], footerLink: null, sectionHeading: '' };
  }
  let voiceListRowIndex = -1;
  let ul = /** @type {HTMLUListElement | null} */ (null);
  for (let i = 1; i < topDivs.length; i += 1) {
    const row = topDivs[i];
    const found = row.querySelector(':scope > ul') || row.querySelector('ul');
    if (found) {
      ul = /** @type {HTMLUListElement} */ (found);
      voiceListRowIndex = i;
      break;
    }
  }
  if (!ul || voiceListRowIndex < 0) {
    return { voices: [], footerLink: null, sectionHeading: '' };
  }
  const sectionHeading = placeholderRowText(root, 'icon-placeholder-voice')
    || 'Choose a voice';
  const voices = [];
  topLevelLisInUl(ul).forEach((li) => {
    const v = parseVoiceLi(li);
    if (v) voices.push(v);
  });
  let footerLink = null;
  const after = topDivs.slice(voiceListRowIndex + 1);
  for (let j = 0; j < after.length; j += 1) {
    const a = after[j].querySelector('a[href^="https://"]');
    if (a) {
      const href = a.getAttribute('href')?.trim() ?? '';
      const text = a.textContent?.trim() || '';
      if (href) footerLink = { href, text: text || href };
      break;
    }
  }
  return { voices, footerLink, sectionHeading };
}

function buildVoiceTile(voice, index, row, widgetInstance) {
  const { name, description, url } = voice;
  const tile = createTag('div', {
    class: `unity-paf-voice-tile${index === 0 ? ' selected' : ''}`,
    role: 'listitem',
    tabindex: '0',
    'aria-pressed': 'false',
    'data-voice-index': String(index),
    'data-voice-name': name,
  });
  if (index === 0) tile.setAttribute('aria-current', 'true');

  const textCol = createTag('div', { class: 'unity-paf-voice-tile-text' });
  textCol.append(
    createTag('span', { class: 'unity-paf-voice-name' }, name),
    createTag('span', { class: 'unity-paf-voice-desc' }, description),
  );

  const player = createTag('div', { class: 'unity-paf-voice-player' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'unity-paf-progress-svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', '48');
  svg.setAttribute('height', '48');
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
 * @param {Array<{ defaultPrompt: string }>} voices
 */
function attachVoiceInteractivity(tiles, widgetInstance, inpField, voices) {
  const tilesArr = tiles;
  let selectedIdx = 0;
  const defaultFor = (i) => voices[i]?.defaultPrompt ?? '';

  function setSelectedVisual(idx) {
    selectedIdx = idx;
    widgetInstance.widgetWrap.setAttribute('data-selected-voice-index', String(idx));
    widgetInstance.widgetWrap.setAttribute('data-selected-voice-name', voices[idx]?.name ?? '');
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
    const prevDef = defaultFor(prevIdx);
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

  setSelectedVisual(0);
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
  const promptLabelText = placeholderRowText(el, 'icon-placeholder-prompt');
  const inpWrap = createTag('div', { class: 'inp-wrap' });
  const labelText = promptLabelText || 'Edit, enter, or paste your own text';
  const promptLabel = createTag('label', { for: 'promptInput', class: 'unity-slf-copy-label unity-slf-prompt-label' }, labelText);
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
 * @param {ReturnType<typeof parsePromptBarAudioAuthoring>['voices']} voices
 * @param {string} sectionHeading
 * @param {{ href: string, text: string } | null} footerLink
 * @param {import('../prompt-bar-style/prompt-bar-style.js').UnityWidget} widgetInstance
 */
function createVoiceStrip(voices, sectionHeading, footerLink, widgetInstance) {
  if (!voices.length) return { section: null, tiles: [] };
  const section = createTag('div', { class: 'unity-paf-voice-section' });
  const heading = createTag(
    'p',
    { class: 'unity-slf-copy-label unity-paf-voice-heading' },
    sectionHeading,
  );
  const row = createTag('div', { class: 'unity-paf-voice-row', role: 'list', 'aria-label': 'Voice samples' });
  const tiles = voices.map((v, i) => buildVoiceTile(v, i, row, widgetInstance));
  section.append(heading, row);
  if (footerLink) {
    const foot = createTag('p', { class: 'unity-paf-voice-footer' });
    const a = createTag('a', { href: footerLink.href, class: 'unity-paf-voice-footer-link' });
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = footerLink.text;
    foot.append(a);
    section.append(foot);
  }
  return { section, tiles };
}

/**
 * @param {HTMLElement} el
 * @param {import('../prompt-bar-style/prompt-bar-style.js').UnityWidget} widgetInstance
 * @param {HTMLElement} widgetWrap
 * @param {HTMLElement} voiceSection
 */
function insertPromptBarAudioRoot(el, widgetInstance, widgetWrap, voiceSection) {
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
 * @param {ReturnType<typeof parsePromptBarAudioAuthoring>} parsed
 */
async function mountPromptBarAudioUI(widgetInstance, parsed) {
  const { voices, footerLink, sectionHeading } = parsed;
  const [analyticsMod] = await Promise.all([
    import('../../../scripts/analytics.js'),
    widgetInstance.hasModelOptions ? widgetInstance.getModel() : Promise.resolve(),
  ]);
  promptWithStyleEvents = analyticsMod.PROMPT_WITH_STYLE_EVENTS;
  const { el } = widgetInstance;
  widgetInstance.hasModelOptions = !!el.querySelector('[class*="icon-model"]');
  const defaultPrompt = voices[0]?.defaultPrompt ?? '';
  const { widgetWrap, inpField } = await createPromptAudioInputShell(
    widgetInstance,
    el,
    defaultPrompt,
    analyticsMod,
  );
  const { section: voiceSection, tiles } = createVoiceStrip(
    voices,
    sectionHeading,
    footerLink,
    widgetInstance,
  );
  const disconnectVoices = voices.length
    ? attachVoiceInteractivity(tiles, widgetInstance, inpField, voices)
    : () => {};
  insertPromptBarAudioRoot(el, widgetInstance, widgetWrap, voiceSection);
  const root = widgetInstance.promptBarAudioRoot;
  let removalObserver = null;
  let interactivityTornDown = false;
  const teardown = () => {
    if (interactivityTornDown) return;
    interactivityTornDown = true;
    removalObserver?.disconnect();
    removalObserver = null;
    disconnectVoices();
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
    const parsed = parsePromptBarAudioAuthoring(this.el);
    const { el } = this;
    this.hasModelOptions = !!el.querySelector('[class*="icon-model"]');
    await mountPromptBarAudioUI(this, parsed);
    return this.workflowCfg.targetCfg.actionMap;
  }
}
