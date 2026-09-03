import { createTag } from '../../../scripts/utils.js';
import { mountWidget, placeholderText, labelForField, svgIcon, spriteIcon } from '../shared/widget-base.js';
import buildDropzone from '../shared/dropzone.js';
import buildPromptInput from '../shared/prompt-input.js';
import {
  buildDropdownShell, attachDropdownBehavior, syncDropdownSelection,
  closeDropdown, setComboboxTriggerAriaLabel,
} from '../shared/dropdown.js';

export default class PromptUploadWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.target = target;
    this.el = el;
    this.workflowCfg = workflowCfg;
    this.spriteCon = spriteCon;
    this.widgetWrap = null;
    this.cta = null;
    this.genBtn = null;
    this.resultsEl = null;
    this.searchMode = false;
    this.dismissBound = false;
    this.selectedOption = '';
    this.lanaOptions = { sampleRate: 1, tags: 'Unity-PU-Widget' };
  }

  get cfg() { return this.workflowCfg?.targetCfg || {}; }

  // Mirror the binder's resolveLimits() (base + limits-<verb> override) so the dropzone's
  // accept filter matches what the binder actually enforces for the active verb.
  get verbLimits() {
    const { cfg } = this;
    const verb = this.workflowCfg?.enabledFeatures?.[0];
    return { ...(cfg.limits || {}), ...(verb ? cfg[`limits-${verb}`] : {}) };
  }

  authoredFlag(iconClass, fallback) {
    const raw = placeholderText(this.el, iconClass);
    if (raw === '') return fallback;
    return raw.trim().toLowerCase() === 'true';
  }

  hasFlag(iconClass) {
    return !!this.el.querySelector(`.${iconClass}`);
  }

  setSelectedOption(value) {
    this.selectedOption = value;
    this.widgetWrap?.setAttribute('data-selected-option-value', value);
  }

  // Options dropdown (e.g. APA editions). Returns null when no values are authored.
  buildDropdown() {
    const raw = placeholderText(this.el, 'icon-prompt-dropdown-values');
    const options = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!options.length) return null;
    [this.selectedOption] = options;
    const { container, triggerBtn, nameContainer, list } = buildDropdownShell({ label: 'Options', menuId: 'pu-prompt-dropdown-menu', extraClass: 'pu-style-dropdown' });
    nameContainer.textContent = this.selectedOption;
    setComboboxTriggerAriaLabel(triggerBtn, nameContainer);

    options.forEach((opt, idx) => {
      const link = createTag('a', { href: '#', class: 'verb-link model-link', role: 'option', 'aria-selected': idx === 0 ? 'true' : 'false', 'data-option-value': opt });
      link.append(
        createTag('span', { class: 'selected-icon' }, svgIcon('#unity-checkmark-icon')),
        createTag('span', { class: 'model-name' }, opt),
      );
      const li = createTag('li', { class: `verb-item${idx === 0 ? ' selected' : ''}`, role: 'presentation' });
      li.append(link);
      list.append(li);
    });

    list.addEventListener('click', (e) => {
      const link = e.target.closest('a.model-link');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();
      const value = link.getAttribute('data-option-value') || '';
      nameContainer.textContent = value;
      setComboboxTriggerAriaLabel(triggerBtn, nameContainer);
      this.setSelectedOption(value);
      syncDropdownSelection(list, link);
      closeDropdown(container, triggerBtn, list);
    });
    attachDropdownBehavior(container, triggerBtn, list);
    return container;
  }

  // The primary CTA. In generate mode it carries `gen-btn` so the action-binder binds it to the
  // generate flow (query -> BE -> redirect). In search mode it's a `search-cta` whose click opens
  // the results dropdown; a separate hidden `.gen-btn` bridges result-selection -> generate.
  buildCta(searchMode) {
    const label = labelForField(this.el, 'icon-cta-text', 'Generate');
    const cta = createTag('a', {
      href: '#',
      class: `unity-act-btn ${searchMode ? 'search-cta' : 'gen-btn'} pu-cta`,
      'aria-label': label,
      role: 'button',
    });
    const iconName = placeholderText(this.el, 'icon-cta-icon');
    if (iconName) {
      const ico = createTag('span', { class: 'btn-ico', 'aria-hidden': 'true' });
      ico.innerHTML = spriteIcon(iconName);
      cta.append(ico);
    }
    cta.append(createTag('div', { class: 'btn-txt' }, label));
    if (searchMode) {
      cta.addEventListener('click', (e) => { e.preventDefault(); this.onSearch(); });
    }
    return cta;
  }

  async onSearch() {
    const input = this.widgetWrap?.querySelector('#pbuPromptInput');
    const query = input?.value?.trim() || '';
    if (!query) return;
    const { default: renderSearchResults } = await import('./search-results.js');
    await renderSearchResults({
      query,
      resultsEl: this.resultsEl,
      onSelect: (r) => this.onResultSelected(r),
      lanaOptions: this.lanaOptions,
    });
    this.bindResultsDismiss();
  }

  onResultSelected(result) {
    if (!result) return;
    const input = this.widgetWrap?.querySelector('#pbuPromptInput');
    if (input) input.value = result.title;
    this.genBtn?.click();
  }

  bindResultsDismiss() {
    if (this.dismissBound) return;
    this.dismissBound = true;
    const hide = () => this.resultsEl?.classList.add('hidden');
    document.addEventListener('click', (e) => {
      if (!this.widgetWrap?.contains(e.target)) hide();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  }

  // Compact upload affordance (inline icon/link + optional drag text) + optional subtext line.
  buildCompactUpload() {
    const label = placeholderText(this.el, 'icon-dropzone-label') || 'Add sources';
    const refs = buildDropzone({
      allowedFileTypes: this.verbLimits.allowedFileTypes || [],
      multiple: true,
      uploadLabel: label,
      selectFileText: label,
      dragText: placeholderText(this.el, 'icon-dropzone-drag-text'),
      showIcon: this.authoredFlag('icon-upload-icon', true),
    });
    const slot = createTag('div', { class: 'pu-upload-slot' });
    slot.append(refs.wrap);
    const subtext = placeholderText(this.el, 'icon-dropzone-subtext');
    if (subtext) slot.append(createTag('div', { class: 'pu-dropzone-subtext' }, subtext));
    return slot;
  }

  // The search/prompt pill: optional helper line above a single input.
  buildSearchField() {
    const placeholder = placeholderText(this.el, 'icon-placeholder-text')
      || 'URL, title, ISBN, DOI, or keywords';
    const field = createTag('div', { class: 'pu-search-field' });
    const inputWrap = createTag('div', { class: 'pu-input-wrap' });
    const helper = placeholderText(this.el, 'icon-prompt-helper');
    if (helper) inputWrap.append(createTag('div', { class: 'pu-input-helper' }, helper));
    inputWrap.append(
      createTag('label', { for: 'pbuPromptInput', class: 'unity-slf-sr-only' }, placeholder),
      buildPromptInput({ ariaLabel: placeholder, placeholder }),
    );
    field.append(inputWrap);
    return field;
  }

  buildHeader(title, dropdown, dropdownInHeader) {
    if (!title && !(dropdown && dropdownInHeader)) return null;
    const header = createTag('div', { class: 'pu-header' });
    if (title) header.append(createTag('div', { class: 'pu-title' }, title));
    if (dropdown && dropdownInHeader) {
      const wrap = createTag('div', { class: 'pu-header-dropdown' });
      const ddLabel = placeholderText(this.el, 'icon-dropdown-label');
      if (ddLabel) wrap.append(createTag('span', { class: 'pu-dropdown-label' }, ddLabel));
      wrap.append(dropdown);
      header.append(wrap);
    }
    return header;
  }

  buildFooter(hasUpload, dropdown, dropdownInFooter, ctaInFooter) {
    const footer = createTag('div', { class: 'pu-footer-container' });
    const left = createTag('div', { class: 'pu-footer-left' });
    if (hasUpload) left.append(this.buildCompactUpload());
    if (dropdown && dropdownInFooter) left.append(dropdown);
    footer.append(left);

    const secondaryText = placeholderText(this.el, 'icon-secondary-link-text');
    if (secondaryText) {
      footer.append(createTag('a', {
        href: placeholderText(this.el, 'icon-secondary-link-href') || '#',
        class: 'pu-secondary-link',
      }, secondaryText));
    }
    if (ctaInFooter) {
      const actWrap = createTag('div', { class: 'act-wrap' });
      actWrap.append(this.cta);
      footer.append(actWrap);
    }
    const hasContent = left.children.length || secondaryText || ctaInFooter;
    return hasContent ? footer : null;
  }

  // New single-column layout (citation / add-sources): header, search row (+ inline CTA), footer.
  buildDefaultMain({
    hasUpload, hasPrompt, title, dropdown, dropdownInHeader, ctaInline,
  }) {
    const main = createTag('div', { class: 'pu-main' });
    const header = this.buildHeader(title, dropdown, dropdownInHeader);
    if (header) main.append(header);
    if (hasPrompt) {
      const searchRow = createTag('div', { class: 'pu-search-row' });
      const field = this.buildSearchField();
      if (ctaInline) field.append(this.cta);
      searchRow.append(field);
      main.append(searchRow);
    }
    const footer = this.buildFooter(hasUpload, dropdown, !dropdownInHeader, !ctaInline);
    if (footer) main.append(footer);
    return main;
  }

  async initWidget() {
    // Components are inferred from authored content; `show-dropzone`/`show-prompt` force them on.
    const uploadContent = ['icon-dropzone-label', 'icon-dropzone-subtext', 'icon-dropzone-drag-text', 'icon-drag-text', 'icon-select-file-text'];
    const promptContent = ['icon-placeholder-text', 'icon-prompt-helper', 'icon-prompt-dropdown-values'];
    const hasUpload = this.authoredFlag('icon-show-dropzone', false) || uploadContent.some((f) => this.hasFlag(f));
    const hasPrompt = this.authoredFlag('icon-show-prompt', false) || promptContent.some((f) => this.hasFlag(f));

    const title = placeholderText(this.el, 'icon-title');
    const dropdown = this.buildDropdown();
    const dropdownInHeader = placeholderText(this.el, 'icon-dropdown-placement') === 'header';
    const ctaInline = placeholderText(this.el, 'icon-cta-placement') === 'inline';
    this.searchMode = placeholderText(this.el, 'icon-cta-action') === 'search';
    this.cta = this.buildCta(this.searchMode);
    // Generate mode: the visible CTA *is* the gen-btn. Search mode: a hidden gen-btn bridges
    // result-selection -> generate while the visible CTA opens the results.
    this.genBtn = this.searchMode
      ? createTag('a', { href: '#', class: 'unity-act-btn gen-btn hidden', 'aria-hidden': 'true', tabindex: '-1' }, 'Generate')
      : this.cta;

    // Layout selector: the default layout is inline (no extra network hop); the preserved
    // two-column "classic" layout is dynamic-imported only when `layout: classic` is authored.
    let main;
    if (placeholderText(this.el, 'icon-layout') === 'classic') {
      const { default: buildClassicMain } = await import('./citation-classic.js');
      main = buildClassicMain(this, { hasUpload, hasPrompt, dropdown });
    } else {
      main = this.buildDefaultMain({ hasUpload, hasPrompt, title, dropdown, dropdownInHeader, ctaInline });
    }

    if (this.searchMode) {
      main.append(this.genBtn);
      this.resultsEl = createTag('div', { class: 'pu-results hidden' });
      const promptInput = main.querySelector('#pbuPromptInput');
      promptInput?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.onSearch();
      });
    }

    this.widgetWrap = mountWidget({
      el: this.el,
      target: this.target,
      workflowCfg: this.workflowCfg,
      spriteCon: this.spriteCon,
      main,
      rootClass: 'unity-prompt-upload',
      wrapClass: 'pu-widget',
    });

    if (this.selectedOption) this.setSelectedOption(this.selectedOption);
    if (this.searchMode && this.resultsEl) {
      this.widgetWrap?.querySelector('.unity-prompt-upload')?.append(this.resultsEl);
    }
    return this.cfg.actionMap;
  }
}
