import { createTag } from '../../../scripts/utils.js';
import { mountWidget, placeholderText, labelForField, svgIcon } from '../shared/widget-base.js';
import { buildDropzone, wirePreview } from '../shared/dropzone.js';
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

  buildLeftSection() {
    const heading = placeholderText(this.el, 'icon-dropzone-title') || 'Upload source files';
    const subtext = placeholderText(this.el, 'icon-dropzone-subtext');
    const titleInside = placeholderText(this.el, 'icon-dropzone-title-position') === 'inside';
    const refs = buildDropzone({
      allowedFileTypes: this.cfg.limits?.allowedFileTypes || [],
      multiple: true,
      uploadLabel: heading,
    });
    const titleEl = createTag('div', { class: 'unity-slf-copy-label pu-upload-heading' }, heading);
    const subtextEl = subtext ? createTag('div', { class: 'pu-dropzone-subtext' }, subtext) : null;
    const leftSection = createTag('div', { class: 'pu-left-section' });
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

  buildCitationStyleDropdown() {
    const raw = placeholderText(this.el, 'icon-show-citationdropdown-values');
    const options = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!options.length) return null;
    [this.selectedOption] = options;
    const { container, triggerBtn, nameContainer, list } = buildDropdownShell({ label: 'Citation style', menuId: 'pu-citation-style-menu', extraClass: 'pu-style-dropdown' });
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
    return createTag('a', {
      href: '#',
      class: 'unity-act-btn search-cta disabled',
      'aria-disabled': 'true',
      'aria-label': label,
      role: 'button',
    }, createTag('div', { class: 'btn-txt' }, label));
  }

  setSearchEnabled(enabled) {
    if (!this.searchCta) return;
    this.searchCta.classList.toggle('disabled', !enabled);
    this.searchCta.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  buildRightSection() {
    const promptHeading = placeholderText(this.el, 'icon-placeholder-text')
      || labelForField(this.el, 'icon-label-prompt', 'Search by URL, title, ISBN, DOI, or keywords');
    const promptLabel = createTag('label', { for: 'pbuPromptInput', class: 'unity-slf-copy-label unity-slf-sr-only' }, promptHeading);

    const input = buildPromptInput({
      ariaLabel: promptHeading,
      placeholder: promptHeading,
      onInput: (value) => this.setSearchEnabled(!!value),
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!this.searchCta.classList.contains('disabled')) this.onSearch();
    });

    this.searchCta = this.buildSearchCta();
    this.searchCta.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.searchCta.classList.contains('disabled')) return;
      this.onSearch();
    });

    this.genBtn = createTag('a', { href: '#', class: 'unity-act-btn gen-btn hidden', 'aria-hidden': 'true', tabindex: '-1' }, 'Generate');
    this.resultsEl = createTag('div', { class: 'pu-results hidden' });
    const searchIcon = createTag('span', { class: 'pu-search-icon', 'aria-hidden': 'true' });
    searchIcon.innerHTML = svgIcon('#unity-search-icon');
    const searchField = createTag('div', { class: 'pu-search-field' });
    searchField.append(searchIcon, input);

    const styleDropdown = this.buildCitationStyleDropdown();
    const actWrap = createTag('div', { class: 'act-wrap' });
    actWrap.append(this.searchCta, this.genBtn);

    const searchRow = createTag('div', { class: 'pu-search-row' });
    searchRow.append(searchField);

    const footerContainer = createTag('div', { class: 'pu-footer-container' });
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
      const { default: searchCitations } = await import('./citation-mock.js');
      const citations = await searchCitations(query);
      this.resultsEl.innerHTML = '';
      if (!citations.length) { this.resultsEl.classList.add('hidden'); return; }

      const list = createTag('ul', { class: 'pu-results-list', role: 'listbox', 'aria-label': 'Matching citations' });
      citations.forEach((c) => {
        const link = createTag('a', { href: '#', class: 'verb-link model-link', role: 'option', 'data-citation-id': c.id });
        const text = createTag('span', { class: 'model-name pu-citation-text' });
        text.append(
          createTag('span', { class: 'pu-citation-title' }, c.title),
          createTag('span', { class: 'pu-citation-meta' }, `${c.authors} (${c.year}). ${c.source}`),
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
        this.onCitationSelected(citations.find((c) => c.id === link.getAttribute('data-citation-id')));
      });

      this.resultsEl.append(list);
      this.resultsEl.classList.remove('hidden');
      this.bindResultsDismiss();
    } catch (err) {
      window.lana?.log(`Message: citation search failed, Error: ${err}`, this.lanaOptions);
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

  onCitationSelected(citation) {
    if (!citation) return;
    const input = this.widgetWrap?.querySelector('#pbuPromptInput');
    if (input) input.value = citation.title;
    this.genBtn?.click();
  }

  async initWidget() {
    const showUpload = this.authoredFlag('icon-show-dropzone', false);
    const showPrompt = this.authoredFlag('icon-show-search', false);

    const main = createTag('div', { class: 'pu-main' });
    let dropZoneRefs = null;
    if (showUpload) {
      const left = this.buildLeftSection();
      dropZoneRefs = left.dropZoneRefs;
      main.append(left.leftSection);
    }
    if (showPrompt) main.append(this.buildRightSection());

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
    if (dropZoneRefs) wirePreview(this.widgetWrap, dropZoneRefs);
    return this.cfg.actionMap;
  }
}
