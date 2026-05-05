/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */

import { createTag, getConfig } from '../../../scripts/utils.js';

let promptWithStyleEvents = null;

function getUnityPromptConfigsBaseUrl() {
  const { origin } = window.location;
  if (origin.includes('.aem.') || origin.includes('.hlx.')) {
    return `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`;
  }
  return origin;
}

function sanitizeCurrentPageFileBase(name) {
  if (!name || !name.trim()) return null;
  const normalized = name.trim().replace(/\s+/g, '-');
  const base = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!base) return null;
  return base.toLowerCase();
}

const CURRENT_PAGE_ICON_PREFIX = 'icon-operation-';
const PLACEHOLDER_PROMPT_LABEL = 'placeholder-prompt-label';
const PLACEHOLDER_PROMPT_DEFAULT = 'placeholder-prompt-default';
const PLACEHOLDER_EXPLORE = 'placeholder-explore';
const PLACEHOLDER_TERMS = 'placeholder-terms';
const VOICE_ROW_PEEK_CLASS = 'unity-paf-voice-row-peek';
const VOICE_ROW_PEEK_SCROLLED_CLASS = 'unity-paf-voice-row-peek-scrolled';
const EMPTY_PROMPT_RESTORE_MS = 10000;

function filterVoicesByModelId(voices, selectedModelId) {
  const id = (selectedModelId || '').trim();
  if (!id) return voices;
  return voices.filter((v) => {
    const m = v.modelId;
    if (m == null || String(m).trim() === '') return true;
    return String(m).trim().toLowerCase() === id.toLowerCase();
  });
}

function currentPageConfigItemToVoice(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    name: String(item.Name ?? '').trim(),
    description: String(item.Description ?? '').trim(),
    url: String(item.url ?? '').trim(),
    voiceId: String(item.VoiceId ?? '').trim(),
    modelId: String(item.ModelId ?? '').trim(),
  };
}

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

function resolveCurrentPageSourceUrl(root) {
  const icon = root.querySelector(`[class*="${CURRENT_PAGE_ICON_PREFIX}"]`);
  if (!icon) return null;
  const classAttr = icon.getAttribute('class') || '';
  const re = new RegExp(`(?:^|\\s)${CURRENT_PAGE_ICON_PREFIX}(\\S+)`);
  const m = classAttr.match(re);
  const fileBase = sanitizeCurrentPageFileBase(m?.[1]);
  if (!fileBase) return null;
  const baseUrl = getUnityPromptConfigsBaseUrl();
  const { locale } = getConfig();
  return locale.prefix && locale.prefix !== '/'
    ? `${baseUrl}${locale.prefix}/unity/configs/prompt/${fileBase}.json`
    : `${baseUrl}/unity/configs/prompt/${fileBase}.json`;
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
    this.voices = null;
    this.voiceConfigAll = null;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF' };
    this.sound = { audio: null, currentTile: null, currentUrl: '' };
    this.durationCache = new Map();
  }

  /** Audio prompt bar authoring exposes a single verb; no media-type dropdown or DOM control. */
  verbDropdown() {
    const verb = this.el.querySelector('[class*="icon-verb"]');
    const selectedVerb = verb?.nextElementSibling;
    this.selectedVerbType = verb?.className.split('-')[2];
    this.selectedVerbText = selectedVerb?.textContent.trim() ?? '';
    this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
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

  handleModelLinkClick(link, listContainer, selectedElement, menuIcon) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      const verbLinkTexts = [];
      listContainer.querySelectorAll('.verb-link').forEach((listLink) => {
        listLink.parentElement.classList.remove('selected');
        listLink.setAttribute('aria-selected', 'false');
        const text = listLink.textContent.trim();
        if (text) verbLinkTexts.push(text);
      });
      verbLinkTexts.sort((a, b) => b.length - a.length);
      this.closeVerbOrModelMenu(selectedElement);
      link.parentElement.classList.add('selected');
      link.setAttribute('aria-selected', 'true');
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
      selectedElement.focus();
      const verbsWithoutPromptSuggestions = this.workflowCfg.targetCfg?.verbsWithoutPromptSuggestions ?? [];
      if (verbsWithoutPromptSuggestions.includes(this.selectedVerbType)) {
        this.widgetWrap.dispatchEvent(new CustomEvent('firefly-reinit-action-listeners'));
      }
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
      if (typeof this.refreshVoiceTilesForModel === 'function') {
        this.refreshVoiceTilesForModel();
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

  createDropdownItems(items, listContainer, selectedElement, menuIcon) {
    const fragment = document.createDocumentFragment();
    items.forEach((item, idx) => {
      const { name, icon, module, id, version } = item;
      const listItem = createTag('li', {
        class: 'verb-item',
        role: 'presentation',
      });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const nameContainer = createTag('span', { class: 'model-name' }, name.trim());
      const link = createTag('a', {
        href: '#',
        class: 'verb-link model-link',
        'data-model-module': module,
        'data-model-id': id,
        'data-model-version': version,
        'aria-selected': 'false',
        role: 'option',
      }, `<img loading="lazy" src="${icon}" alt="" />${nameContainer.outerHTML}`);
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
      this.handleModelLinkClick(link, listContainer, selectedElement, menuIcon)(e);
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
    if (models.length === 0) return [];
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
      if (e.key === 'Escape') {
        this.closeVerbOrModelMenu(selectedElement);
        selectedElement.focus();
      }
    });
    this.createDropdownItems(models, listItems, selectedElement, menuIcon);
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
    const modelFile = `${getUnityPromptConfigsBaseUrl()}/unity/configs/prompt/model-picker1.json`;
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
}

const RING_R = 20;
const RING_C = 2 * Math.PI * RING_R;
const RING_STROKE_WIDTH = (2.78751 * 48) / 33;
const RING_STROKE_ATTR = String(RING_STROKE_WIDTH);
const PAF_PP_PLAY_SVG = '<svg class="unity-paf-pp-svg" width="20" height="20" aria-hidden="true"><use xlink:href="#unity-play-icon"></use></svg>';
const PAF_PP_PAUSE_SVG = '<svg class="unity-paf-pp-svg" width="20" height="20" aria-hidden="true"><use xlink:href="#unity-pause-icon"></use></svg>';
const PAF_PLAYER_LOADING_SVG = `<svg class="unity-paf-voice-player-loading-svg" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle class="unity-paf-voice-player-loading-circle" cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="${RING_STROKE_ATTR}" stroke-linecap="round" transform="rotate(-90 24 24)" /></svg>`;

const voiceTileState = new WeakMap();

function setVoiceTilePlayerBuffering(tile, isBuffering) {
  const p = voiceTileState.get(tile);
  if (!p?.player || !p.bufferLayer || !p.progressSvg || !p.center) return;
  const on = Boolean(isBuffering);
  if (on === p.bufferingUi) return;
  p.bufferingUi = on;
  if (on) {
    p.player.classList.add('unity-paf-voice-player--buffering');
    p.bufferLayer.setAttribute('aria-busy', 'true');
    p.player.replaceChildren(p.bufferLayer);
  } else {
    p.player.classList.remove('unity-paf-voice-player--buffering');
    p.bufferLayer.removeAttribute('aria-busy');
    p.player.replaceChildren(p.progressSvg, p.center);
  }
}

function setVoiceTileCenterPlayIcon(tile) {
  const p = voiceTileState.get(tile);
  if (!p?.center) return;
  setVoiceTilePlayerBuffering(tile, false);
  p.center.innerHTML = PAF_PP_PLAY_SVG;
}

function setVoiceTileCenterPauseIcon(tile) {
  const p = voiceTileState.get(tile);
  if (!p?.center) return;
  setVoiceTilePlayerBuffering(tile, false);
  p.center.innerHTML = PAF_PP_PAUSE_SVG;
}

function primeVoiceAudioForPlayback(tile) {
  const p = voiceTileState.get(tile);
  if (!p || p.audio.src) return;
  setVoiceTilePlayerBuffering(tile, true);
  p.audio.preload = 'auto';
  p.audio.src = p.url;
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

function placeholderRowHtmlAfterIcon(root, iconClass) {
  const li = findPlaceholderIconLi(root, iconClass);
  if (!li) return '';
  const clone = li.cloneNode(true);
  const rm = clone.querySelector(`.${iconClass}`) || clone.querySelector(`[class*="${iconClass}"]`);
  if (rm) rm.remove();
  return (clone.innerHTML || '').replace(/^\s+/, '').trim();
}

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

function dispatchAudioPlaybackFailed(widgetWrap) {
  try {
    widgetWrap?.dispatchEvent(new CustomEvent('firefly-audio-error', { detail: { error: 'audio-playback-failed' } }));
  } catch { /* ignore */ }
}

export function parsePromptBarAudioAuthoring(root) {
  return {
    footerLink: findFooterLinkInRoot(root),
    sectionHeading: placeholderRowText(root, 'icon-placeholder-voice') || 'Choose a voice',
    currentPageSourceUrl: resolveCurrentPageSourceUrl(root),
    defaultPrompt: placeholderRowText(root, PLACEHOLDER_PROMPT_DEFAULT) || '',
    exploreHtml: placeholderRowHtmlAfterIcon(root, PLACEHOLDER_EXPLORE),
    termsHtml: placeholderRowHtmlAfterIcon(root, PLACEHOLDER_TERMS),
  };
}

function buildVoiceTile(voice, index, row, widgetInstance) {
  const { name, description, url, voiceId } = voice;
  const tile = createTag('div', {
    class: `unity-paf-voice-tile${index === 0 ? ' selected' : ''}`,
    role: 'listitem',
    tabindex: '0',
    'aria-pressed': 'false',
    'data-voice-index': String(index),
    'data-voice-name': name,
  });
  if (voiceId) tile.setAttribute('data-voice-id', voiceId);
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
  svg.setAttribute('aria-hidden', 'true');
  const ringBg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ringBg.setAttribute('class', 'unity-paf-ring-bg');
  ringBg.setAttribute('cx', '24');
  ringBg.setAttribute('cy', '24');
  ringBg.setAttribute('r', String(RING_R));
  ringBg.setAttribute('fill', 'none');
  ringBg.setAttribute('stroke-width', RING_STROKE_ATTR);
  ringBg.setAttribute('stroke-linecap', 'round');
  const ringFg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  ringFg.setAttribute('class', 'unity-paf-ring-fg');
  ringFg.setAttribute('cx', '24');
  ringFg.setAttribute('cy', '24');
  ringFg.setAttribute('r', String(RING_R));
  ringFg.setAttribute('fill', 'none');
  ringFg.setAttribute('stroke-width', RING_STROKE_ATTR);
  ringFg.setAttribute('stroke-linecap', 'round');
  ringFg.setAttribute('transform', 'rotate(-90 24 24)');
  ringFg.style.strokeDasharray = String(RING_C);
  ringFg.style.strokeDashoffset = String(RING_C);
  svg.append(ringBg, ringFg);

  const center = createTag('div', { class: 'unity-paf-pp-center' });
  center.innerHTML = PAF_PP_PLAY_SVG;

  const bufferLayer = createTag('div', { class: 'unity-paf-voice-player-loading' });
  bufferLayer.innerHTML = PAF_PLAYER_LOADING_SVG;

  const audioObj = new Audio();
  audioObj.preload = 'none';
  voiceTileState.set(tile, {
    audio: audioObj,
    ringFg,
    player,
    bufferLayer,
    progressSvg: svg,
    center,
    playing: false,
    url,
    bufferingUi: false,
  });
  player.append(svg, center);

  tile.append(textCol, player);
  row.append(tile);

  const setRingProgress = (t) => {
    const a = audioObj;
    if (!Number.isFinite(a.duration) || a.duration <= 0) return;
    const p = t / a.duration;
    ringFg.style.strokeDashoffset = String(RING_C * (1 - p));
  };

  const showPlayIcon = () => setVoiceTileCenterPlayIcon(tile);
  const showPauseIcon = () => setVoiceTileCenterPauseIcon(tile);

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
    voiceTileState.get(tile).playing = true;
    showPauseIcon();
    tile.setAttribute('aria-pressed', 'true');
    startRaf();
  });
  audioObj.addEventListener('pause', () => {
    const atEnd = audioObj.ended || (Number.isFinite(audioObj.duration) && audioObj.currentTime >= audioObj.duration - 0.25);
    voiceTileState.get(tile).playing = !atEnd && audioObj.currentTime > 0;
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
    voiceTileState.get(tile).playing = false;
    showPlayIcon();
    setRingProgress(0);
    ringFg.style.strokeDashoffset = String(RING_C);
    tile.setAttribute('aria-pressed', 'false');
    try { audioObj.currentTime = 0; } catch (e) { /* noop */ }
    stopRaf();
  });
  audioObj.addEventListener('error', () => {
    setVoiceTileCenterPlayIcon(tile);
    dispatchAudioPlaybackFailed(widgetInstance.widgetWrap);
  });
  audioObj.addEventListener('waiting', () => {
    if (!audioObj.paused) setVoiceTilePlayerBuffering(tile, true);
  });
  audioObj.addEventListener('playing', () => {
    if (!audioObj.paused) showPauseIcon();
  });
  return tile;
}

function attachVoiceInteractivity(tiles, widgetInstance, inpField, voices) {
  const wrap = widgetInstance.widgetWrap;
  let selectedIdx = 0;
  const authoring = (widgetInstance.defaultPromptFromAuthoring ?? '').trim();

  function setSelectedVisual(idx) {
    selectedIdx = idx;
    if (idx < 0) {
      wrap.removeAttribute('data-selected-voice-index');
      wrap.removeAttribute('data-selected-voice-name');
      wrap.removeAttribute('data-selected-voice-id');
      tiles.forEach((t) => {
        t.classList.remove('selected');
        t.removeAttribute('aria-current');
      });
      return;
    }
    wrap.setAttribute('data-selected-voice-index', String(idx));
    wrap.setAttribute('data-selected-voice-name', voices[idx]?.name ?? '');
    const voiceId = voices[idx]?.voiceId;
    if (voiceId) wrap.setAttribute('data-selected-voice-id', voiceId);
    else wrap.removeAttribute('data-selected-voice-id');
    tiles.forEach((t, i) => {
      t.classList.toggle('selected', i === idx);
      if (i === idx) t.setAttribute('aria-current', 'true');
      else t.removeAttribute('aria-current');
    });
  }

  function resetTileIdle(tile) {
    const p = voiceTileState.get(tile);
    if (!p) return;
    try { p.audio.pause(); } catch { /* ignore */ }
    try { p.audio.currentTime = 0; } catch { /* ignore */ }
    p.playing = false;
    p.ringFg.style.strokeDashoffset = String(RING_C);
    setVoiceTileCenterPlayIcon(tile);
    tile.setAttribute('aria-pressed', 'false');
  }

  function syncPromptIfStuckToDefaults() {
    const { value } = inpField;
    if (value === authoring || value.trim() === '') {
      inpField.value = authoring;
    }
  }

  function toggleTile(idx) {
    const tile = tiles[idx];
    const p = tile && voiceTileState.get(tile);
    if (!p) return;
    const { audio } = p;
    const isPlaying = !audio.paused && !audio.ended;
    if (isPlaying) {
      audio.pause();
      return;
    }
    primeVoiceAudioForPlayback(tile);
    audio.play().catch(() => {
      setVoiceTileCenterPlayIcon(tile);
      dispatchAudioPlaybackFailed(wrap);
    });
  }

  function onTileActivate(idx) {
    if (idx !== selectedIdx) {
      syncPromptIfStuckToDefaults();
      setSelectedVisual(idx);
      tiles.forEach((t, i) => { if (i !== idx) resetTileIdle(t); });
      const nextTile = tiles[idx];
      primeVoiceAudioForPlayback(nextTile);
      voiceTileState.get(nextTile).audio.play().catch(() => {
        setVoiceTileCenterPlayIcon(nextTile);
        dispatchAudioPlaybackFailed(wrap);
      });
      return;
    }
    toggleTile(idx);
  }

  tiles.forEach((tile, idx) => {
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
  return () => { tiles.forEach(resetTileIdle); };
}

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
  widgetInstance.verbDropdown();
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

  let emptyPromptRestoreTimerId = null;
  const clearEmptyPromptRestoreTimer = () => {
    if (emptyPromptRestoreTimerId != null) {
      clearTimeout(emptyPromptRestoreTimerId);
      emptyPromptRestoreTimerId = null;
    }
  };
  widgetInstance.clearEmptyPromptRestoreTimer = clearEmptyPromptRestoreTimer;
  inpField.addEventListener('input', () => {
    const trimmed = (inpField.value || '').trim();
    if (trimmed !== '') {
      clearEmptyPromptRestoreTimer();
      return;
    }
    clearEmptyPromptRestoreTimer();
    emptyPromptRestoreTimerId = window.setTimeout(() => {
      emptyPromptRestoreTimerId = null;
      if (!inpField.isConnected) return;
      if ((inpField.value || '').trim() !== '') return;
      inpField.value = (widgetInstance.defaultPromptFromAuthoring ?? '').trim();
    }, EMPTY_PROMPT_RESTORE_MS);
  });

  const actionContainer = createTag('div', { class: 'action-container' });
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

function syncVoiceRowPeekClasses(row, shouldPeek) {
  if (!row) return;
  row.classList.toggle(VOICE_ROW_PEEK_CLASS, shouldPeek);
  row.classList.toggle(VOICE_ROW_PEEK_SCROLLED_CLASS, shouldPeek && row.scrollLeft > 0);
}

function wireVoiceRowPeekTracking(widgetInstance, row, shouldPeek) {
  if (widgetInstance.detachVoiceRowPeekTracking) {
    try { widgetInstance.detachVoiceRowPeekTracking(); } catch (e) { /* noop */ }
    widgetInstance.detachVoiceRowPeekTracking = null;
  }
  if (!row) {
    syncVoiceRowPeekClasses(null, false);
    return;
  }
  const onScroll = () => {
    const active = row.classList.contains(VOICE_ROW_PEEK_CLASS);
    syncVoiceRowPeekClasses(row, active);
  };
  row.addEventListener('scroll', onScroll, { passive: true });
  widgetInstance.detachVoiceRowPeekTracking = () => row.removeEventListener('scroll', onScroll);
  syncVoiceRowPeekClasses(row, shouldPeek);
}

function createVoiceStrip(allVoices, visibleVoices, sectionHeading, footerLink, widgetInstance, opts = {}) {
  const { exploreHtml = '' } = opts;
  if (!allVoices.length) return { section: null, tiles: [] };
  if (!visibleVoices.length) {
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
  syncVoiceRowPeekClasses(row, visibleVoices.length > 4);
  const tiles = visibleVoices.map((v, i) => buildVoiceTile(v, i, row, widgetInstance));
  section.append(heading, row);
  appendVoiceExploreSubfoot(section, exploreHtml, footerLink);
  return { section, tiles };
}

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

async function mountPromptBarAudioUI(widgetInstance, parsed) {
  const {
    voices,
    footerLink,
    sectionHeading,
    exploreHtml = '',
    termsHtml = '',
  } = parsed;
  const authoring = (widgetInstance.defaultPromptFromAuthoring ?? '').trim();
  const [analyticsMod] = await Promise.all([
    import('../../../scripts/analytics.js'),
    widgetInstance.hasModelOptions ? widgetInstance.getModel() : Promise.resolve(),
  ]);
  promptWithStyleEvents = analyticsMod.PROMPT_WITH_STYLE_EVENTS;
  const { el } = widgetInstance;
  const { widgetWrap, inpField } = await createPromptAudioInputShell(widgetInstance, el, '', analyticsMod);
  const selectedModelId = (widgetInstance.selectedModelId
    || widgetInstance.widgetWrap?.getAttribute('data-selected-model-id')
    || '').trim();
  const visibleVoices = filterVoicesByModelId(voices, selectedModelId);
  inpField.value = authoring;
  const { section: voiceSection, tiles } = createVoiceStrip(
    voices,
    visibleVoices,
    sectionHeading,
    footerLink,
    widgetInstance,
    { exploreHtml: exploreHtml || '' },
  );
  const termsBanner = buildTermsBannerElement(termsHtml || '');
  const disconnectFirst = visibleVoices.length
    ? attachVoiceInteractivity(tiles, widgetInstance, inpField, visibleVoices)
    : () => {};
  widgetInstance.voicePromptInpField = inpField;
  widgetInstance.teardownVoiceTiles = disconnectFirst;
  /** Rebuilds voice tiles for the current model; prompt text stays unless empty or still the authoring default. */
  widgetInstance.refreshVoiceTilesForModel = function refreshVoiceTilesForModel() {
    const all = this.voiceConfigAll;
    if (!all || !all.length) return;
    const root = this.promptBarAudioRoot;
    const row = root?.querySelector('.unity-paf-voice-row') ?? null;
    if (!row) return;
    if (this.teardownVoiceTiles) {
      try { this.teardownVoiceTiles(); } catch (err) { /* noop */ }
      this.teardownVoiceTiles = null;
    }
    const mid = (this.selectedModelId || this.widgetWrap?.getAttribute('data-selected-model-id') || '').trim();
    const auth = (this.defaultPromptFromAuthoring ?? '').trim();
    row.replaceChildren();
    const visible = filterVoicesByModelId(all, mid);
    syncVoiceRowPeekClasses(row, visible.length > 4);
    if (this.voicePromptInpField) {
      const cur = (this.voicePromptInpField.value || '').trim();
      if (visible.length > 0 && (cur === '' || cur === auth)) {
        this.voicePromptInpField.value = auth;
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
  const initialRow = root?.querySelector('.unity-paf-voice-row') ?? null;
  wireVoiceRowPeekTracking(widgetInstance, initialRow, visibleVoices.length > 4);
  let removalObserver = null;
  let interactivityTornDown = false;
  const teardown = () => {
    if (interactivityTornDown) return;
    interactivityTornDown = true;
    widgetInstance.clearEmptyPromptRestoreTimer?.();
    delete widgetInstance.clearEmptyPromptRestoreTimer;
    removalObserver?.disconnect();
    removalObserver = null;
    if (widgetInstance.teardownVoiceTiles) {
      try { widgetInstance.teardownVoiceTiles(); } catch (e) { /* noop */ }
      widgetInstance.teardownVoiceTiles = null;
    }
    if (widgetInstance.detachVoiceRowPeekTracking) {
      try { widgetInstance.detachVoiceRowPeekTracking(); } catch (e) { /* noop */ }
      widgetInstance.detachVoiceRowPeekTracking = null;
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
      defaultPrompt,
      exploreHtml,
      termsHtml,
    } = meta;
    this.defaultPromptFromAuthoring = (defaultPrompt ?? '').trim();
    let voices = [];
    if (currentPageSourceUrl) {
      try {
        voices = await loadVoicesFromCurrentPageJson(currentPageSourceUrl);
      } catch (e) {
        window.lana?.log(`Message: current page config json load failed, Error: ${e}`, this.lanaOptions);
      }
    }
    this.voices = voices;
    this.voiceConfigAll = voices;
    const { el } = this;
    this.hasModelOptions = !!el.querySelector('[class*="icon-model"]');
    await mountPromptBarAudioUI(this, {
      voices,
      footerLink,
      sectionHeading,
      exploreHtml: exploreHtml || '',
      termsHtml: termsHtml || '',
    });
    const baseMap = this.workflowCfg.targetCfg.actionMap || {};
    return {
      ...baseMap,
      '.unity-paf-voice-subfoot a': { actionType: 'generate' },
    };
  }
}
