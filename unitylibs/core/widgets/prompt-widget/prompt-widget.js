/* eslint-disable class-methods-use-this */

/**
 * Hero / marquee Firefly prompt bar: verb switcher, prompt suggestions dropdown, sound hooks,
 * and DOM insertion into `.copy`. Not used for `promptWithStyleSelect` (prompt-with-style-select).
 */

import UnityWidget from '../../workflow/workflow-firefly/widget.js';
import { createTag, getConfig, getUnityLibs, loadStyle, unityConfig } from '../../../scripts/utils.js';

export class PromptWidget extends UnityWidget {
  async ensureSoundModuleLoaded() {
    if (this.selectedVerbType !== 'sound' || this.soundAugmented) return;
    try {
      const { default: augmentSound } = await import('../../workflow/workflow-firefly/sound-utils.js');
      augmentSound(this);
      this.soundAugmented = true;
    } catch (e) {
      window.lana?.log(`Message: Error loading sound module, Error: ${e}`, this.lanaOptions);
    }
  }

  popPlaceholders() {
    return Object.fromEntries(
      [...this.el.querySelectorAll('[class*="placeholder"]')].map((element) => [
        element.classList[1]?.replace('icon-', '') || '',
        element.closest('li')?.innerText || '',
      ]).filter(([key]) => key),
    );
  }

  createInpWrap(ph) {
    const inpWrap = createTag('div', { class: 'inp-wrap' });
    const actWrap = createTag('div', { class: 'act-wrap' });
    const inpField = createTag('textarea', {
      id: 'promptInput',
      class: 'inp-field',
      type: 'text',
      placeholder: ph['placeholder-input'],
      'aria-autocomplete': 'list',
      'aria-haspopup': 'listbox',
      'aria-controls': 'prompt-dropdown',
      'aria-activedescendant': '',
    });
    const dropdown = this.widget.querySelector('.prompt-dropdown-container');
    inpField.addEventListener('focus', () => this.hidePromptDropdown());
    inpField.addEventListener('click', () => this.resetAllSoundVariations?.(dropdown));
    inpField.addEventListener('input', () => this.resetAllSoundVariations?.(dropdown));
    const verbDropdown = this.verbDropdown();
    const modelDropdown = this.modelDropdown();
    const genBtn = this.createActBtn(this.el.querySelector('.icon-generate')?.closest('li'), 'gen-btn');
    actWrap.append(genBtn);
    const actionContainer = createTag('div', { class: 'action-container' });
    const hasPromptLabel = this.el.querySelector('.icon-placeholder-prompt-label');
    if (hasPromptLabel && ph['placeholder-prompt-label']) {
      const promptLabel = createTag('label', { for: 'promptInput', class: 'inp-field-label' }, ph['placeholder-prompt-label']);
      inpWrap.appendChild(promptLabel);
    }
    if (verbDropdown.length > 1) {
      const verbBtn = createTag('div', { class: 'verbs-container', 'aria-label': 'Media options' });
      verbBtn.append(...verbDropdown);
      actionContainer.append(verbBtn);
      inpWrap.append(inpField, actionContainer, actWrap);
    } else {
      inpWrap.append(inpField, actWrap);
    }
    if (modelDropdown.length > 1) {
      const modelBtn = createTag('div', { class: 'models-container', 'aria-label': 'Model options' });
      modelBtn.append(...modelDropdown);
      actionContainer.append(modelBtn);
    }
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

      if (this.selectedVerbType === 'sound') this.addSoundSuggestionHandlers(dropdown, item, { prompt, variations }, idx + 1);
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
    if (!this.outsideDropdownHandler) {
      this.outsideDropdownHandler = (ev) => {
        if (this.widgetWrap && window.getComputedStyle(this.widgetWrap).pointerEvents === 'none') return;
        const wrapper = this.widget.querySelector('.autocomplete');
        if (wrapper && wrapper.contains(ev.target)) return;
        if (promptDropdownContainer && !promptDropdownContainer.classList.contains('hidden') && !promptDropdownContainer.contains(ev.target)) {
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

  addWidget() {
    if (this.el.classList.contains('widget-prompt-with-style')) return;
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
    const promptFile = locale.prefix && locale.prefix !== '/'
      ? `${baseUrl}${locale.prefix}/unity/configs/prompt/firefly-prompt.json`
      : `${baseUrl}/unity/configs/prompt/firefly-prompt.json`;
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
      return (this.prompts?.[verb] || []).filter((item) => item.prompt && item.prompt.trim() !== '');
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
          let variations = [];
          if (item.verb === 'sound') {
            const ph = this.workflowCfg?.placeholder || {};
            const labels = Object.keys(ph)
              .filter((k) => k.startsWith('placeholder-variation-label-'))
              .map((k) => ({ idx: Number.parseInt(k.split('-').pop(), 10), val: (ph[k] || '').trim() }))
              .filter(({ idx, val }) => Number.isFinite(idx) && val)
              .sort((a, b) => a.idx - b.idx)
              .map(({ val }) => val);
            let urls = [];
            if (typeof item.variationUrls === 'string' && item.variationUrls.trim()) {
              const parts = item.variationUrls.split(/\s*,\s*https:\/\//);
              urls = parts.map((part, idx) => {
                const trimmed = part.trim();
                return idx === 0 ? trimmed : `https://${trimmed}`;
              }).filter((url) => url);
            }
            variations = labels.map((lbl, idx) => ({ label: lbl, url: urls[idx] || '' }));
          }
          promptMap[item.verb].push({ prompt: item.prompt, assetid: item.assetid, variations });
        }
      });
    }
    return promptMap;
  }

  async updateDropdownForVerb(verb) {
    if (!this.hasPromptSuggestions) return;
    await this.ensureSoundModuleLoaded();
    const dropdown = this.widget.querySelector('#prompt-dropdown');
    if (!dropdown) return;
    dropdown.querySelectorAll('.drop-item').forEach((item) => item.remove());
    const prompts = await this.getPrompt(verb);
    const limited = this.getLimitedDisplayPrompts(prompts);
    this.addPromptItemsToDropdown(dropdown, limited, this.workflowCfg.placeholder);
    this.widgetWrap.dispatchEvent(new CustomEvent('firefly-reinit-action-listeners'));
  }
}

/**
 * @param {PromptWidget} widget
 * @returns {Promise<object>}
 */
export async function initPromptWidget(widget) {
  await new Promise((resolve) => {
    loadStyle(`${getUnityLibs()}/core/widgets/prompt-widget/prompt-widget.css`, resolve);
  });

  const [widgetWrap, widgetEl, unitySprite] = ['ex-unity-wrap', 'ex-unity-widget', 'unity-sprite-container']
    .map((c) => createTag('div', { class: c }));
  widget.widgetWrap = widgetWrap;
  widget.widget = widgetEl;
  unitySprite.innerHTML = widget.spriteCon;
  widget.widgetWrap.append(unitySprite);
  widget.workflowCfg.placeholder = widget.popPlaceholders();
  const hasPromptPlaceholder = !!widget.el.querySelector('.icon-placeholder-prompt');
  const hasSuggestionsPlaceholder = !!widget.el.querySelector('.icon-placeholder-suggestions');
  const hasModels = !!widget.el.querySelector('[class*="icon-model"]');
  widget.hasModelOptions = hasModels;
  widget.hasPromptSuggestions = hasPromptPlaceholder && hasSuggestionsPlaceholder;
  if (widget.hasModelOptions) await widget.getModel();
  const inputWrapper = widget.createInpWrap(widget.workflowCfg.placeholder);
  await widget.ensureSoundModuleLoaded();
  let dropdown = null;
  if (widget.hasPromptSuggestions) dropdown = await widget.genDropdown(widget.workflowCfg.placeholder);
  const comboboxContainer = createTag('div', { class: 'autocomplete' });
  comboboxContainer.append(inputWrapper);
  if (dropdown) comboboxContainer.append(dropdown);
  widget.widget.append(comboboxContainer);
  widget.addWidget();
  if (widget.workflowCfg.targetCfg.floatPrompt && typeof widget.initIO === 'function') {
    widget.initIO();
  }
  return widget.workflowCfg.targetCfg.actionMap;
}
