/* eslint-disable class-methods-use-this */

import { createTag, getConfig, unityConfig } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
    this.spriteCon = spriteCon;
    this.prompts = null;
    this.selectedVerbType = '';
    this.selectedVerbText = '';
    this.promptItems = [];
    this.genBtn = null;
    this.hasPromptSuggestions = false;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF' };
    this.sound = { audio: null, currentTile: null, currentUrl: '' };
    this.durationCache = new Map();
  }

  async initWidget() {
    const [widgetWrap, widget, unitySprite] = ['ex-unity-wrap', 'ex-unity-widget', 'unity-sprite-container']
      .map((c) => createTag('div', { class: c }));
    this.widgetWrap = widgetWrap;
    this.widget = widget;
    unitySprite.innerHTML = this.spriteCon;
    this.widgetWrap.append(unitySprite);
    this.workflowCfg.placeholder = this.popPlaceholders();
    const hasPromptPlaceholder = !!this.el.querySelector('.icon-placeholder-prompt');
    const hasSuggestionsPlaceholder = !!this.el.querySelector('.icon-placeholder-suggestions');
    this.hasPromptSuggestions = hasPromptPlaceholder && hasSuggestionsPlaceholder;
    const inputWrapper = this.createInpWrap(this.workflowCfg.placeholder);
    let dropdown = null;
    if (this.hasPromptSuggestions) dropdown = await this.genDropdown(this.workflowCfg.placeholder);
    const comboboxContainer = createTag('div', { class: 'autocomplete' });
    comboboxContainer.append(inputWrapper);
    if (dropdown) comboboxContainer.append(dropdown);
    this.widget.append(comboboxContainer);
    this.addWidget();
    if (this.workflowCfg.targetCfg.floatPrompt) this.initIO();
    return this.workflowCfg.targetCfg.actionMap;
  }

  popPlaceholders() {
    return Object.fromEntries(
      [...this.el.querySelectorAll('[class*="placeholder"]')].map((element) => [
        element.classList[1]?.replace('icon-', '') || '',
        element.closest('li')?.innerText || '',
      ]).filter(([key]) => key),
    );
  }

  showVerbMenu(selectedElement) {
    const menuContainer = selectedElement.parentElement;
    document.querySelectorAll('.verbs-container').forEach((container) => {
      if (container !== menuContainer) {
        container.classList.remove('show-menu');
        container.querySelector('.selected-verb')?.setAttribute('aria-expanded', 'false');
      }
    });
    menuContainer.classList.toggle('show-menu');
    selectedElement.setAttribute('aria-expanded', menuContainer.classList.contains('show-menu') ? 'true' : 'false');
    if (selectedElement.nextElementSibling.hasAttribute('style')) selectedElement.nextElementSibling.removeAttribute('style');
  }

  hidePromptDropdown() {
    // Target the prompt dropdown explicitly
    const dropdown = this.widget.querySelector('.prompt-dropdown-container');
    // Always perform reset of variations associated with the dropdown scope
    const scope = dropdown || this.widget;
    this.resetAllSoundVariations(scope);
    // Also stop any globally tracked audio objects
    if (this.activeAudios) {
      this.activeAudios.forEach((a) => { try { a.pause(); a.currentTime = 0; } catch (e) { /* noop */ } });
      this.activeAudios.clear();
    }
    if (dropdown && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
      dropdown.setAttribute('inert', '');
      dropdown.setAttribute('aria-hidden', 'true');
    }
    if (dropdown) {
      // Clean up expanded state and details to prevent orphaned audio refs
      dropdown.querySelectorAll('.sound-details').forEach((d) => d.remove());
      dropdown.querySelectorAll('.drop-item.sound-expanded').forEach((el) => el.classList.remove('sound-expanded'));
    }
  }

  updateAnalytics(verb) {
    if (this.promptItems && this.promptItems.length > 0) {
      this.promptItems.forEach((item) => {
        const ariaLabel = item.getAttribute('aria-label') || '';
        item.setAttribute('daa-ll', `${ariaLabel.slice(0, 20)}--${verb}--Prompt suggestion`);
      });
    }
    if (this.genBtn) {
      this.genBtn.setAttribute('daa-ll', `Generate--${verb}`);
    }
  }

  handleVerbLinkClick(link, verbList, selectedElement, menuIcon, inputPlaceHolder) {
    return (e) => {
      e.preventDefault();
      e.stopPropagation();
      const verbLinkTexts = [];
      verbList.querySelectorAll('.verb-link').forEach((listLink) => {
        listLink.parentElement.classList.remove('selected');
        listLink.parentElement.setAttribute('aria-label', `${listLink.getAttribute('data-verb-type')} prompt: ${inputPlaceHolder}`);
        const text = listLink.textContent.trim();
        if (text) verbLinkTexts.push(text);
      });
      verbLinkTexts.sort((a, b) => b.length - a.length);
      selectedElement.parentElement.classList.toggle('show-menu');
      selectedElement.setAttribute('aria-expanded', selectedElement.parentElement.classList.contains('show-menu') ? 'true' : 'false');
      link.parentElement.classList.add('selected');
      const copiedNodes = link.cloneNode(true).childNodes;
      copiedNodes[0].remove();
      this.selectedVerbType = link.getAttribute('data-verb-type');
      this.selectedVerbText = link.textContent.trim();
      selectedElement.replaceChildren(...copiedNodes, menuIcon);
      selectedElement.dataset.selectedVerb = this.selectedVerbType;
      selectedElement.setAttribute('aria-label', `${this.selectedVerbText} prompt: ${inputPlaceHolder}`);
      selectedElement.focus();
      link.parentElement.setAttribute('aria-label', `${this.selectedVerbText} prompt selected:  ${inputPlaceHolder}`);
      const verbsWithoutPromptSuggestions = this.workflowCfg.targetCfg?.verbsWithoutPromptSuggestions ?? [];
      if (!verbsWithoutPromptSuggestions.includes(this.selectedVerbType)) this.updateDropdownForVerb(this.selectedVerbType);
      else this.widgetWrap.dispatchEvent(new CustomEvent('firefly-reinit-action-listeners'));
      this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
      this.updateAnalytics(this.selectedVerbType);
      if (this.genBtn) {
        this.genBtn.setAttribute(
          'aria-label',
          (this.genBtn.getAttribute('aria-label') || '').replace(
            new RegExp(`\\b(${verbLinkTexts.join('|')})\\b`),
            this.selectedVerbText,
          ),
        );
      }
    };
  }

  verbDropdown() {
    const verbs = this.el.querySelectorAll('[class*="icon-verb"]');
    const inputPlaceHolder = this.el.querySelector('.icon-placeholder-input').parentElement.textContent;
    const selectedVerbType = verbs[0]?.className.split('-')[2];
    const selectedVerb = verbs[0]?.nextElementSibling;
    const { href } = selectedVerb;
    const selectedElement = createTag('button', {
      class: 'selected-verb',
      'aria-expanded': 'false',
      'aria-controls': 'prompt-menu',
      'aria-label': `${selectedVerbType} prompt: ${inputPlaceHolder}`,
      'data-selected-verb': selectedVerbType,
    }, `<img src="${href}" alt="" />${selectedVerb?.textContent.trim()}`);
    this.selectedVerbType = selectedVerbType;
    this.widgetWrap.setAttribute('data-selected-verb', this.selectedVerbType);
    this.selectedVerbText = selectedVerb?.textContent.trim();
    if (verbs.length <= 1) {
      selectedElement.setAttribute('disabled', 'true');
      return [selectedElement];
    }
    const menuIcon = createTag('span', { class: 'menu-icon' }, '<svg><use xlink:href="#unity-chevron-icon"></use></svg>');
    const verbList = createTag('ul', { class: 'verb-list', id: 'prompt-menu' });
    verbList.setAttribute('style', 'display: none;');
    selectedElement.append(menuIcon);
    const handleDocumentClick = (e) => {
      const menuContainer = selectedElement.parentElement;
      if (!menuContainer.contains(e.target)) {
        document.removeEventListener('click', handleDocumentClick);
        menuContainer.classList.remove('show-menu');
        selectedElement.setAttribute('aria-expanded', 'false');
      }
    };
    selectedElement.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hidePromptDropdown();
      this.showVerbMenu(selectedElement);
      document.addEventListener('click', handleDocumentClick);
    }, true);
    selectedElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        this.hidePromptDropdown();
        this.showVerbMenu(selectedElement);
      }
      if (e.key === 'Escape' || e.code === 27) {
        selectedElement.parentElement.classList?.remove('show-menu');
        selectedElement.focus();
      }
    });
    verbs.forEach((verb, idx) => {
      const name = verb.nextElementSibling?.textContent.trim();
      const verbType = verb.className.split('-')[2];
      const icon = verb.nextElementSibling?.href;
      const item = createTag('li', {
        class: 'verb-item',
        'aria-label': `${name} prompt: ${inputPlaceHolder}`,
      });
      const selectedIcon = createTag('span', { class: 'selected-icon' }, '<svg><use xlink:href="#unity-checkmark-icon"></use></svg>');
      const link = createTag('a', {
        href: '#',
        class: 'verb-link',
        'data-verb-type': verbType,
      }, `<img loading="lazy" src="${icon}" alt="" />${name}`);
      if (idx === 0) {
        item.classList.add('selected');
        item.setAttribute('aria-label', `${name} prompt selected: ${inputPlaceHolder}`);
      }
      verbs[0].classList.add('selected');
      link.prepend(selectedIcon);
      item.append(link);
      verbList.append(item);
      link.addEventListener('click', this.handleVerbLinkClick(link, verbList, selectedElement, menuIcon, inputPlaceHolder));
    });
    return [selectedElement, verbList];
  }

  createInpWrap(ph) {
    const inpWrap = createTag('div', { class: 'inp-wrap' });
    const actWrap = createTag('div', { class: 'act-wrap' });
    const verbBtn = createTag('div', { class: 'verbs-container', 'aria-label': 'Prompt options' });
    const inpField = createTag('input', {
      id: 'promptInput',
      class: 'inp-field',
      type: 'text',
      placeholder: ph['placeholder-input'],
      'aria-autocomplete': 'list',
      'aria-haspopup': 'listbox',
      'aria-controls': 'prompt-dropdown',
      'aria-owns': 'prompt-dropdown',
      'aria-activedescendant': '',
    });
    const clearSoundUI = () => {
      const dropdownWrap = this.widget.querySelector('.prompt-dropdown-container');
      if (!dropdownWrap) return;
      this.resetAllSoundVariations(dropdownWrap);
      dropdownWrap.querySelectorAll('.sound-details').forEach((d) => d.remove());
      dropdownWrap.querySelectorAll('.drop-item.sound-expanded').forEach((el) => el.classList.remove('sound-expanded'));
      dropdownWrap.querySelectorAll('.use-prompt-btn.inline').forEach((b) => b.remove());
    };
    inpField.addEventListener('focus', clearSoundUI);
    inpField.addEventListener('click', clearSoundUI);
    inpField.addEventListener('input', clearSoundUI);
    const verbDropdown = this.verbDropdown();
    const genBtn = this.createActBtn(this.el.querySelector('.icon-generate')?.closest('li'), 'gen-btn');
    actWrap.append(genBtn);
    verbBtn.append(...verbDropdown);
    inpWrap.append(verbBtn, inpField, actWrap);
    return inpWrap;
  }

  getLimitedDisplayPrompts(prompts) {
    const shuffled = prompts.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3).map(({ prompt, assetid, variations }) => ({
      prompt,
      assetid,
      variations,
    }));
  }

  addPromptItemsToDropdown(dropdown, prompts, placeholder) {
    this.promptItems = [];
    prompts.forEach(({ prompt, assetid, variations }, idx) => {
      const item = createTag('li', {
        id: assetid,
        class: 'drop-item',
        role: 'option',
        tabindex: '0',
        'aria-label': prompt,
        'aria-description': `${placeholder['placeholder-prompt']} ${placeholder['placeholder-suggestions']}`,
        'daa-ll': `${prompt.slice(0, 20)}--${this.selectedVerbType}--Prompt suggestion`,
      });
      const iconWrap = createTag('span', { class: 'prompt-icon' }, '<svg><use xlink:href="#unity-prompt-icon"></use></svg>');
      const text = createTag('span', { class: 'drop-text' }, prompt);
      item.append(iconWrap, text);
      dropdown.append(item);
      this.promptItems.push(item);

      // Sound: expand details with variations & Use prompt
      if (this.selectedVerbType === 'sound') {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          // prevent ActionBinder's .drop-item listener from firing
          e.stopImmediatePropagation();
          e.stopPropagation();
          this.toggleSoundDetails(dropdown, item, { prompt, variations }, idx + 1);
        });
      }
    });
  }

  async genDropdown(ph) {
    if (!this.hasPromptSuggestions) return null;
    const promptDropdownContainer = createTag('div', { class: 'prompt-dropdown-container drop hidden', 'aria-hidden': 'true' });
    const dd = createTag('ul', {
      id: 'prompt-dropdown',
      class: 'prompt-suggestions-list',
      'daa-lh': 'Marquee',
      role: 'listbox',
      'aria-labelledby': 'promptInput',
    });
    const titleCon = createTag('div', { class: 'drop-title-con' });
    const title = createTag('span', { class: 'drop-title', id: 'prompt-suggestions' }, `${ph['placeholder-prompt']} ${ph['placeholder-suggestions']}`);
    titleCon.append(title);
    const prompts = await this.getPrompt(this.selectedVerbType);
    const limited = this.getLimitedDisplayPrompts(prompts);
    this.addPromptItemsToDropdown(dd, limited, ph);
    promptDropdownContainer.append(titleCon, dd, this.createFooter(ph));
    // Clicking outside the dropdown should reset and hide suggestions (persistent handler)
    if (!this.outsideDropdownHandler) {
      this.outsideDropdownHandler = (ev) => {
        const dd_con = this.widget.querySelector('.prompt-dropdown-container');
        const wrapper = this.widget.querySelector('.autocomplete');
        // Ignore clicks inside the autocomplete wrapper (input/prompt bar)
        if (wrapper && wrapper.contains(ev.target)) return;
        if (dd_con && !dd_con.classList.contains('hidden') && !dd_con.contains(ev.target)) {
          this.hidePromptDropdown();
        }
      };
      setTimeout(() => document.addEventListener('click', this.outsideDropdownHandler, true), 0);
    }
    return promptDropdownContainer;
  }

  createFooter(ph) {
    const footer = createTag('div', { class: 'drop-footer' });
    const tipEl = this.el.querySelector('.icon-tip')?.closest('li');
    const tipCon = createTag('div', { id: 'tip-content', class: 'tip-con', tabindex: '-1', role: 'note', 'aria-label': `${ph['placeholder-tip']} ${tipEl?.innerText}` }, '<svg><use xlink:href="#unity-info-icon"></use></svg>');
    const tipText = createTag('span', { class: 'tip-text', id: 'tip-text' }, `${ph['placeholder-tip']}:`);
    const tipDesc = createTag('span', { class: 'tip-desc', id: 'tip-desc' }, tipEl?.innerText || '');
    tipCon.append(tipText, tipDesc);
    const legalEl = this.el.querySelector('.icon-legal')?.closest('li');
    const legalCon = createTag('div', { class: 'legal-con' });
    const legalLink = legalEl?.querySelector('a');
    const legalText = createTag('a', { href: legalLink?.href || '#', class: 'legal-text' }, legalLink?.innerText || 'Legal');
    legalCon.append(legalText);
    footer.append(tipCon, legalCon);
    return footer;
  }

  createActBtn(cfg, cls) {
    if (!cfg) return null;
    const txt = cfg.innerText?.trim();
    const img = cfg.querySelector('img[src*=".svg"]');
    const btn = createTag('a', { href: '#', class: `unity-act-btn ${cls}`, 'daa-ll': `Generate--${this.selectedVerbType}`, 'aria-label': `${txt?.split('\n')[0]} ${this.selectedVerbText}` });
    if (img) btn.append(createTag('div', { class: 'btn-ico' }, img));
    if (txt) btn.append(createTag('div', { class: 'btn-txt' }, txt.split('\n')[0]));
    this.genBtn = btn;
    return btn;
  }

  addWidget() {
    const interactArea = this.target.querySelector('.copy');
    const para = interactArea?.querySelector(this.workflowCfg.targetCfg.target);
    this.widgetWrap.append(this.widget);
    if (para && this.workflowCfg.targetCfg.insert === 'before') para.before(this.widgetWrap);
    else if (para) para.after(this.widgetWrap);
    else interactArea?.appendChild(this.widgetWrap);
  }

  async loadPrompts() {
    const { locale } = getConfig();
    const { origin } = window.location;
    const baseUrl = (origin.includes('.aem.') || origin.includes('.hlx.'))
      ? `https://main--unity--adobecom.${origin.includes('.hlx.') ? 'hlx' : 'aem'}.live`
      : origin;
    // TODO vipulg: remove draft urls and use production urls
    const promptFile = locale.prefix && locale.prefix !== '/'
      ? `${baseUrl}${locale.prefix}/drafts/vipulg/prompt/firefly-prompt.json`
      : `${baseUrl}/drafts/vipulg/prompt/firefly-prompt.json`;
    const promptRes = await fetch(promptFile);
    if (!promptRes.ok) {
      throw new Error('Failed to fetch prompts.');
    }
    const promptJson = await promptRes.json();
    this.prompts = this.createPromptMap(promptJson?.content?.data);
  }

  async getPrompt(verb) {
    if (!this.hasPromptSuggestions) return [];
    try {
      if (!this.prompts || Object.keys(this.prompts).length === 0) await this.loadPrompts();
      const list = (this.prompts?.[verb] || []).filter((item) => item.prompt && item.prompt.trim() !== '');
      return list;
    } catch (e) {
      window.lana?.log(`Message: Error loading promts, Error: ${e}`, this.lanaOptions);
      return [];
    }
  }

  createPromptMap(data) {
    const promptMap = {};
    if (Array.isArray(data)) {
      data.forEach((item) => {
        const itemEnv = item.env || 'prod';
        if (item.verb && item.prompt && itemEnv === unityConfig.env) {
          if (!promptMap[item.verb]) promptMap[item.verb] = [];
          // Normalize variations: prefer item.variations; else parse delimited columns
          let variations = Array.isArray(item.variations) ? item.variations : null;
          if (!variations) {
            const labelsRaw = typeof item.variationLabels === 'string' ? item.variationLabels : '';
            const urlsRaw = typeof item.variationUrls === 'string' ? item.variationUrls : '';
            const split = (str) => str.split('||').map((s) => s.trim()).filter((s) => s);
            const labels = split(labelsRaw);
            const urls = split(urlsRaw);
            if (urls.length > 0) {
              variations = urls.slice(0, 4).map((u, idx) => ({
                label: labels[idx] || `Variation ${idx + 1}`,
                url: u,
              }));
            }
          }
          promptMap[item.verb].push({ prompt: item.prompt, assetid: item.assetid, variations });
        }
      });
    }
    return promptMap;
  }

  async updateDropdownForVerb(verb) {
    if (!this.hasPromptSuggestions) return;
    const dropdown = this.widget.querySelector('#prompt-dropdown');
    if (!dropdown) return;
    this.stopAnyAudio();
    this.clearSoundDetails(dropdown);
    dropdown.querySelectorAll('.drop-item').forEach((item) => item.remove());
    const prompts = await this.getPrompt(verb);
    const limited = this.getLimitedDisplayPrompts(prompts);
    this.addPromptItemsToDropdown(dropdown, limited, this.workflowCfg.placeholder);
    this.widgetWrap.dispatchEvent(new CustomEvent('firefly-reinit-action-listeners'));
  }

  // ===== Sound helpers =====
  ensureAudio() {
    if (!this.sound.audio) {
      this.sound.audio = new Audio();
    }
  }

  stopAnyAudio() {
    if (this.sound.audio) {
      try { this.sound.audio.pause(); } catch (e) { /* noop */ }
    }
    if (this.sound.currentTile) this.sound.currentTile.classList.remove('playing');
    this.sound.currentTile = null;
    this.sound.currentUrl = '';
  }

  clearSoundDetails(dropdown) {
    dropdown?.querySelectorAll('.sound-details').forEach((d) => d.remove());
  }

  // Reset all variation tiles (pause audio, reset progress/time, hide button)
  resetAllSoundVariations(rootEl) {
    const root = rootEl || this.widget;
    root.querySelectorAll('.variation-tile').forEach((t) => {
      try { t.audioRef?.pause(); } catch (e) { /* noop */ }
      if (t.audioRef) {
        try { t.audioRef.currentTime = 0; } catch (e) { /* noop */ }
      }
      t.classList.remove('playing', 'selected');
      t.setAttribute('aria-pressed', 'false');
      const pb = t.querySelector('.pause-btn');
      if (pb) pb.classList.add('hidden');
      const fill = t.querySelector('.seek-fill');
      if (fill) fill.style.transform = 'scaleX(0)';
      const bar = t.querySelector('.seek-bar');
      if (bar) bar.setAttribute('aria-valuenow', '0');
      const tm = t.querySelector('.time-el');
      if (tm && t.audioRef) {
        const updateToDuration = () => {
          const d = Number.isFinite(t.audioRef.duration) && t.audioRef.duration > 0 ? Math.floor(t.audioRef.duration) : 0;
          const min = Math.floor(d / 60);
          const sec = d % 60;
          tm.textContent = `${min}:${String(sec).padStart(2, '0')}`;
        };
        if (Number.isFinite(t.audioRef.duration) && t.audioRef.duration > 0) updateToDuration();
        else t.audioRef.addEventListener('loadedmetadata', updateToDuration, { once: true });
      }
    });
  }

  toggleSoundDetails(dropdown, item, promptObj, promptIndex) {
    // If this item is already expanded, collapse it
    const next = item.nextElementSibling;
    if (next && next.classList.contains('sound-details')) {
      // Pause and reset any audio before collapsing
      this.resetAllSoundVariations(next);
      next.remove();
      item.classList.remove('sound-expanded');
      item.querySelector('.use-prompt-btn.inline')?.remove();
      return;
    }
    // Collapse any other expanded prompt
    this.resetAllSoundVariations(dropdown);
    this.clearSoundDetails(dropdown);
    dropdown.querySelectorAll('.drop-item.sound-expanded .use-prompt-btn.inline')
      .forEach((btn) => btn.remove());
    dropdown.querySelectorAll('.drop-item.sound-expanded')
      .forEach((it) => it.classList.remove('sound-expanded'));

    // Add inline "Use prompt" button to this item (same line as prompt)
    const inlineBtn = createTag('button', {
      class: 'use-prompt-btn inline',
      'data-prompt-index': String(promptIndex),
      'aria-label': `Use prompt ${promptIndex}: ${promptObj.prompt}`,
    }, 'Use prompt');
    inlineBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hidePromptDropdown();
      // For sound: pass suggestion as an override without mutating input, then trigger Generate
      const btn = this.genBtn;
      if (btn) {
        btn.dataset.soundPrompt = promptObj.prompt;
        btn.click();
      }
    });
    item.classList.add('sound-expanded');
    item.append(inlineBtn);

    // Render variations below the item
    const details = this.renderSoundDetails(promptObj);
    item.after(details);
  }

  renderSoundDetails(promptObj) {
    const details = createTag('div', { class: 'sound-details', role: 'region' });
    const strip = createTag('div', { class: 'variation-strip' });
    const vars = Array.isArray(promptObj.variations) && promptObj.variations.length === 4
      ? promptObj.variations
      : this.getGeneratedSamples();

    // Ensure a global registry of audio objects for robust cleanup
    if (!this.activeAudios) this.activeAudios = new Set();
    vars.forEach((v, i) => {
      const tile = createTag('div', { class: 'variation-tile', role: 'button', tabindex: '0', 'aria-pressed': 'false' });
      const label = createTag('div', { class: 'variation-label inline' }, v.label || `Example ${i + 1}`);
      const audioObj = new Audio(v.url);
      audioObj.preload = 'metadata';
      tile.audioRef = audioObj; // internal reference
      this.activeAudios.add(audioObj);

      const player = createTag('div', { class: 'custom-player' });
      const pauseBtn = createTag('button', { class: 'pause-btn hidden', 'aria-label': `Pause ${v.label || `Example ${i + 1}`}` });
      let mouseInside = false;
      const setBtnToPause = () => {
        pauseBtn.innerHTML = '<svg width="20" height="20" aria-hidden="true"><use xlink:href="#unity-pause-icon"></use></svg>';
        pauseBtn.dataset.state = 'pause';
        pauseBtn.setAttribute('aria-label', `Pause ${v.label || `Example ${i + 1}`}`);
      };
      const setBtnToPlay = () => {
        pauseBtn.innerHTML = '<svg width="20" height="20" aria-hidden="true"><use xlink:href="#unity-play-icon"></use></svg>';
        pauseBtn.dataset.state = 'play';
        pauseBtn.setAttribute('aria-label', `Play ${v.label || `Example ${i + 1}`}`);
      };
      setBtnToPlay();
      // Time label: prefer cached duration to avoid flicker, else fill later on metadata
      const cached = this.durationCache.get(v.url);
      const timeEl = createTag('div', { class: 'time-el' }, cached ? `${Math.floor(cached / 60)}:${String(Math.floor(cached % 60)).padStart(2,'0')}` : '0:00');
      const progressBar = createTag('div', {
        class: 'seek-bar',
        role: 'progressbar',
        'aria-label': `Progress ${v.label || `Example ${i + 1}`}`,
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': '0',
        style: 'height:6px;border-radius:3px;overflow:hidden;flex:1;',
      });
      const progressFill = createTag('div', { class: 'seek-fill', style: 'height:100%;width:0%;background:#3B63FB;border-radius:3px;transition:width 100ms linear;' });
      progressBar.append(progressFill);
      player.append(pauseBtn, label, timeEl, progressBar);
      // Begin in idle layout via class (CSS handles layout)
      tile.classList.add('is-idle');

      const pauseOthers = () => {
        strip.querySelectorAll('.variation-tile').forEach((t) => {
          if (t !== tile && t.audioRef) {
            // Mark this pause as a programmatic reset so its pause handler fully idles the tile
            t.dataset.forceIdle = '1';
            try { t.audioRef.pause(); } catch (e) { /* noop */ }
            try { t.audioRef.currentTime = 0; } catch (e) { /* noop */ }
          }
          if (t !== tile) {
            t.classList.remove('playing', 'selected', 'paused');
            t.classList.remove('is-active');
            t.classList.add('is-idle');
            t.setAttribute('aria-pressed', 'false');
            const pb = t.querySelector('.pause-btn');
            if (pb) pb.classList.add('hidden');
            const fill = t.querySelector('.seek-fill');
            if (fill) fill.style.transform = 'scaleX(0)';
            const bar = t.querySelector('.seek-bar');
            if (bar) bar.setAttribute('aria-valuenow', '0');
            const tm = t.querySelector('.time-el');
            if (tm && t.audioRef) {
              const updateToDuration = () => {
                const d = Number.isFinite(t.audioRef.duration) && t.audioRef.duration > 0 ? Math.floor(t.audioRef.duration) : 0;
                const m = Math.floor(d / 60);
                const s = d % 60;
                tm.textContent = `${m}:${String(s).padStart(2, '0')}`;
              };
              if (Number.isFinite(t.audioRef.duration) && t.audioRef.duration > 0) updateToDuration();
              else t.audioRef.addEventListener('loadedmetadata', updateToDuration, { once: true });
            }
          }
        });
      };

      // Audio events
      const fmtTime = (sec) => {
        const s = Math.max(0, Math.floor(sec || 0));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${String(r).padStart(2, '0')}`;
      };

      let rafId = null;
      const startRaf = () => {
        if (rafId) cancelAnimationFrame(rafId);
        const tick = () => {
          if (Number.isFinite(audioObj.duration) && audioObj.duration > 0) {
            const pct = (audioObj.currentTime / audioObj.duration) * 100;
            progressFill.style.width = `${pct}%`;
            progressBar.style.setProperty('--progress', `${pct}%`);
            progressBar.setAttribute('aria-valuenow', String(pct));
            timeEl.textContent = fmtTime(audioObj.currentTime);
          }
          if (!audioObj.paused && !audioObj.ended) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);
      };
      const stopRaf = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } };
      audioObj.addEventListener('loadedmetadata', () => {
        // Show total duration in the default (idle) state
        const dur = Number.isFinite(audioObj.duration) && audioObj.duration > 0 ? audioObj.duration : 0;
        if (dur > 0) this.durationCache.set(v.url, dur);
        timeEl.textContent = fmtTime(dur);
        progressFill.style.width = '0%';
        progressBar.style.setProperty('--progress', '0%');
        progressBar.setAttribute('aria-valuenow', '0');
      });
      audioObj.addEventListener('timeupdate', () => {
        // keep for coarse updates; fine animation handled by rAF
        if (!Number.isFinite(audioObj.duration) || audioObj.duration === 0) return;
        const pct = (audioObj.currentTime / audioObj.duration) * 100;
        progressFill.style.width = `${pct}%`;
        progressBar.style.setProperty('--progress', `${pct}%`);
        progressBar.setAttribute('aria-valuenow', String(pct));
        // Show elapsed while playing or paused; show total when idle (neither playing nor paused)
        if (tile.classList.contains('playing') || tile.classList.contains('paused')) {
          timeEl.textContent = fmtTime(audioObj.currentTime);
        } else {
          timeEl.textContent = fmtTime(audioObj.duration);
        }
      });
      audioObj.addEventListener('play', () => {
        pauseOthers();
        strip.querySelectorAll('.variation-tile').forEach((t) => { if (t !== tile) t.classList.remove('selected'); });
        // Ensure this tile is not treated as a programmatic reset later
        if (tile.dataset && tile.dataset.forceIdle) delete tile.dataset.forceIdle;
        tile.classList.add('playing', 'selected');
        tile.classList.remove('paused');
        tile.setAttribute('aria-pressed', 'true');
        setBtnToPause();
        pauseBtn.classList.remove('hidden');
        startRaf();
        timeEl.textContent = fmtTime(audioObj.currentTime);
        // Active layout via class
        tile.classList.remove('is-idle');
        tile.classList.add('is-active');
      });
      audioObj.addEventListener('pause', () => {
        // If this pause was triggered by another tile starting, fully reset to idle and exit
        if (tile.dataset.forceIdle === '1') {
          delete tile.dataset.forceIdle;
          tile.classList.remove('playing', 'selected', 'paused', 'is-active');
          tile.classList.add('is-idle');
          pauseBtn.classList.add('hidden');
          // Reset progress + timer to total duration
          try { audioObj.currentTime = 0; } catch (e) { /* noop */ }
          progressFill.style.width = '0%';
          progressBar.style.setProperty('--progress', '0%');
          progressBar.setAttribute('aria-valuenow', '0');
          const dur = Number.isFinite(audioObj.duration) && audioObj.duration > 0 ? audioObj.duration : 0;
          timeEl.textContent = fmtTime(dur);
          stopRaf();
          return;
        }
        tile.classList.remove('playing');
        tile.classList.add('paused');
        tile.setAttribute('aria-pressed', 'false');
        // Keep it selected/paused so UI persists
        setBtnToPlay();
        // Keep visible if hovered or focused; otherwise hide
        const hasFocus = tile.contains(document.activeElement);
        if (!mouseInside && !hasFocus) pauseBtn.classList.add('hidden');
        // On pause, show elapsed time
        timeEl.textContent = fmtTime(audioObj.currentTime);
        stopRaf();
      });
      audioObj.addEventListener('ended', () => {
        tile.classList.remove('playing');
        tile.classList.remove('paused');
        tile.setAttribute('aria-pressed', 'false');
        pauseBtn.classList.add('hidden');
        // Reset timer and progress when playback completes
        try { audioObj.currentTime = 0; } catch (e) { /* noop */ }
        progressFill.style.width = '0%';
        progressBar.style.setProperty('--progress', '0%');
        progressBar.setAttribute('aria-valuenow', '0');
        // Show full duration after completion
        const dur = Number.isFinite(audioObj.duration) && audioObj.duration > 0 ? audioObj.duration : 0;
        timeEl.textContent = fmtTime(dur);
        stopRaf();
        // Back to idle layout via class
        tile.classList.remove('is-active', 'paused');
        tile.classList.add('is-idle');
      });

      // Controls
      let pointerDownOnBtn = false;
      const togglePlayback = () => {
        const isPlaying = !audioObj.paused && !audioObj.ended;
        if (isPlaying) {
          setBtnToPlay();
          audioObj.pause();
        } else {
          setBtnToPause();
          audioObj.play().catch(() => { setBtnToPlay(); });
        }
      };
      pauseBtn.addEventListener('pointerdown', (e) => {
        pointerDownOnBtn = true;
        e.preventDefault();
        e.stopPropagation();
        try { pauseBtn.setPointerCapture && pauseBtn.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
        togglePlayback();
      });
      pauseBtn.addEventListener('pointerup', () => { pointerDownOnBtn = false; });
      // Prevent duplicate toggle from click; pointerdown already toggles
      pauseBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
      pauseBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePlayback(); } });
      // Progress bar is display-only (no seeking)

      // Clicking the tile should start playback and show the pause button
      tile.addEventListener('click', (ev) => {
        if (ev.target.closest && ev.target.closest('.pause-btn')) return; // button handles its own
        ev.preventDefault();
        if (audioObj.paused) {
          setBtnToPause();
          pauseBtn.classList.remove('hidden');
          audioObj.play().catch(() => {});
        }
      });
      tile.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          if (audioObj.paused) {
            setBtnToPause();
            pauseBtn.classList.remove('hidden');
            audioObj.play().catch(() => {});
          }
        }
      });
      // Do not hide play button on mouse leave when paused

      tile.append(player);
      strip.append(tile);
    });

    details.append(strip);

    return details;
  }
}
