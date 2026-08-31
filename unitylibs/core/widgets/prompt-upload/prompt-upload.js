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
    this.searchCta = null;
    this.genBtn = null;
    this.resultsEl = null;
    this.selectedOption = '';
    this.lanaOptions = { sampleRate: 1, tags: 'Unity-PU-Widget' };
  }

  get cfg() { return this.workflowCfg?.targetCfg || {}; }

  authoredFlag(iconClass, fallback) {
    const raw = placeholderText(this.el, iconClass);
    if (raw === '') return fallback;
    return raw.trim().toLowerCase() === 'true';
  }

  hasFlag(iconClass) {
    return !!this.el.querySelector(`.${iconClass}`);
  }

  buildLeftSection() {
    const style = placeholderText(this.el, 'icon-dropzone-style') || 'box';
    const heading = placeholderText(this.el, 'icon-dropzone-label') || 'Upload source files';
    const subtext = placeholderText(this.el, 'icon-dropzone-subtext');
    const refs = buildDropzone({
      allowedFileTypes: this.cfg.limits?.allowedFileTypes || [],
      multiple: true,
      uploadLabel: heading,
      style,
      selectFileText: placeholderText(this.el, 'icon-select-file-text') || 'Select file',
      dragText: placeholderText(this.el, 'icon-drag-text'),
    });
    const subtextEl = subtext ? createTag('div', { class: 'pu-dropzone-subtext' }, subtext) : null;
    const leftSection = createTag('div', { class: 'pu-left-section' });

    if (style === 'panel') {
      leftSection.classList.add('pu-left-panel');
      if (subtextEl) refs.dropZone.append(subtextEl);
      leftSection.append(refs.wrap);
      return { leftSection, dropZoneRefs: refs };
    }
    const titleInside = placeholderText(this.el, 'icon-dropzone-label-position') === 'inside';
    const titleEl = createTag('div', { class: 'unity-slf-copy-label pu-upload-heading' }, heading);
    if (titleInside) {
      leftSection.classList.add('pu-dz-title-inside');
      refs.dropZone.append(titleEl);
      if (subtextEl) refs.dropZone.append(subtextEl);
      leftSection.append(refs.wrap);
    } else {
      leftSection.append(titleEl);
      if (subtextEl) leftSection.append(subtextEl);
      leftSection.append(refs.wrap);
    }
    return { leftSection, dropZoneRefs: refs };
  }

  setSelectedOption(value) {
    this.selectedOption = value;
    this.widgetWrap?.setAttribute('data-selected-option-value', value);
  }

  buildPromptDropdown() {
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

  buildSearchCta() {
    const label = labelForField(this.el, 'icon-cta-text', 'Generate');
    const cta = createTag('a', {
      href: '#',
      class: 'unity-act-btn search-cta',
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
    return cta;
  }

  buildRightSection({ compactUpload = false } = {}) {
    const promptHeading = placeholderText(this.el, 'icon-placeholder-text')
    const promptLabelText = placeholderText(this.el, 'icon-prompt-label');
    const promptLabel = createTag('label', {
      for: 'pbuPromptInput',
      class: `unity-slf-copy-label ${promptLabelText ? 'pu-prompt-label' : 'unity-slf-sr-only'}`,
    }, promptLabelText || promptHeading);

    const input = buildPromptInput({
      ariaLabel: promptHeading,
      placeholder: promptHeading,
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.onSearch();
    });

    this.searchCta = this.buildSearchCta();
    this.searchCta.addEventListener('click', (e) => {
      e.preventDefault();
      this.onSearch();
    });

    this.genBtn = createTag('a', { href: '#', class: 'unity-act-btn gen-btn hidden', 'aria-hidden': 'true', tabindex: '-1' }, 'Generate');
    this.resultsEl = createTag('div', { class: 'pu-results hidden' });
    const searchField = createTag('div', { class: 'pu-search-field' });
    const searchIconName = placeholderText(this.el, 'icon-search-icon');
    if (searchIconName) {
      const searchIcon = createTag('span', { class: 'pu-search-icon', 'aria-hidden': 'true' });
      searchIcon.innerHTML = spriteIcon(searchIconName);
      searchField.append(searchIcon);
    }
    searchField.append(input);

    const styleDropdown = this.buildPromptDropdown();
    const actWrap = createTag('div', { class: 'act-wrap' });
    actWrap.append(this.searchCta, this.genBtn);

    const searchRow = createTag('div', { class: 'pu-search-row' });
    searchRow.append(searchField);

    const footerContainer = createTag('div', { class: 'pu-footer-container' });
    if (compactUpload) {
      const label = placeholderText(this.el, 'icon-dropzone-label') || 'Add sources';
      const addSources = buildDropzone({
        allowedFileTypes: this.cfg.limits?.allowedFileTypes || [],
        multiple: true,
        uploadLabel: label,
        style: 'compact',
        selectFileText: label,
      });
      footerContainer.append(addSources.wrap);
    }
    if (styleDropdown) footerContainer.append(styleDropdown);
    footerContainer.append(actWrap);

    const container = createTag('div', { class: 'pu-prompt-bar-container' });
    container.append(promptLabel, searchRow, footerContainer);

    const rightSection = createTag('div', { class: 'pu-right-section' });
    rightSection.append(container);
    return rightSection;
  }

  async onSearch() {
    const input = this.widgetWrap?.querySelector('#pbuPromptInput');
    const query = input?.value?.trim() || '';
    if (!query) return;
    try {
      const { default: searchResults } = await import('./results-mock.js');
      const results = await searchResults(query);
      this.resultsEl.innerHTML = '';
      if (!results.length) { this.resultsEl.classList.add('hidden'); return; }

      const list = createTag('ul', { class: 'pu-results-list', role: 'listbox', 'aria-label': 'Matching results' });
      results.forEach((r) => {
        const link = createTag('a', { href: '#', class: 'verb-link model-link', role: 'option', 'data-result-id': r.id });
        const text = createTag('span', { class: 'model-name pu-result-text' });
        text.append(
          createTag('span', { class: 'pu-result-title' }, r.title),
          createTag('span', { class: 'pu-result-meta' }, `${r.authors} (${r.year}). ${r.source}`),
        );
        link.append(text);
        const li = createTag('li', { class: 'verb-item', role: 'presentation' });
        li.append(link);
        list.append(li);
      });
      list.addEventListener('click', (e) => {
        const link = e.target.closest('a.model-link');
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();
        this.onResultSelected(results.find((r) => r.id === link.getAttribute('data-result-id')));
      });

      this.resultsEl.append(list);
      this.resultsEl.classList.remove('hidden');
      this.bindResultsDismiss();
    } catch (err) {
      window.lana?.log(`Message: result search failed, Error: ${err}`, this.lanaOptions);
    }
  }

  bindResultsDismiss() {
    if (this.dismissBound) return;
    this.dismissBound = true;
    const hide = () => this.resultsEl?.classList.add('hidden');
    document.addEventListener('click', (e) => {
      if (!this.widgetWrap?.contains(e.target)) hide();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hide();
    });
  }

  onResultSelected(result) {
    if (!result) return;
    const input = this.widgetWrap?.querySelector('#pbuPromptInput');
    if (input) input.value = result.title;
    this.genBtn?.click();
  }

  async initWidget() {
    // Infer components from authored content; `show-dropzone`/`show-prompt` are optional
    // overrides to force an empty dropzone/prompt (no content) when needed.
    const dropzoneContent = [
      'icon-dropzone-label', 'icon-dropzone-subtext', 'icon-dropzone-style',
      'icon-select-file-text', 'icon-drag-text',
    ];
    const promptContent = ['icon-prompt-label', 'icon-placeholder-text', 'icon-prompt-dropdown-values'];
    const showUpload = this.authoredFlag('icon-show-dropzone', false)
      || dropzoneContent.some((f) => this.hasFlag(f));
    const showPrompt = this.authoredFlag('icon-show-prompt', false)
      || promptContent.some((f) => this.hasFlag(f));
    const compactUpload = showUpload && placeholderText(this.el, 'icon-dropzone-style') === 'compact';

    const main = createTag('div', { class: 'pu-main' });
    if (showUpload && !compactUpload) main.append(this.buildLeftSection().leftSection);
    if (showPrompt) main.append(this.buildRightSection({ compactUpload }));

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
    const root = this.widgetWrap?.querySelector('.unity-prompt-upload');
    if (this.resultsEl && root) root.append(this.resultsEl);
    return this.cfg.actionMap;
  }
}
