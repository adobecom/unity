/*
 * prompt-upload widget — Option A (shared primitives).
 *
 * Composes the reusable primitives in `core/widgets/shared/` instead of duplicating
 * dropzone/dropdown/input logic per widget. Critical-path primitives are statically
 * imported (and preloaded via priorityLibFetch); the dropdown + citation search are
 * lazy-imported on first interaction so they never block initial render / LCP.
 *
 * Renders the Citation Generator surface: multi-file dropzone (left) + search field
 * with a disabled-until-typing Search CTA and a keyword -> citation results dropdown (right).
 *
 * Honors the workflow-prompt-upload binder DOM contract: `.drop-zone`, `#file-upload`,
 * `#pbuPromptInput`, `.gen-btn`, `.ex-unity-wrap`, `pbu-image-selected`, `pbu-delete-image`.
 */
import { createTag } from '../../../scripts/utils.js';
import { mountWidget, placeholderText, labelForField } from '../shared/widget-base.js';
import { buildDropzone, wirePreview } from '../shared/dropzone.js';
import buildPromptInput from '../shared/prompt-input.js';

export default class PromptUploadWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.target = target;
    this.el = el;
    this.workflowCfg = workflowCfg;
    this.spriteCon = spriteCon;
    this.widgetWrap = null;
    this.searchCta = null;
    this.resultsEl = null;
    this.dropdownRefs = null;
    this.lanaOptions = { sampleRate: 1, tags: 'Unity-PU-Widget' };
  }

  get cfg() { return this.workflowCfg?.targetCfg || {}; }

  buildLeftSection() {
    const uploadLabel = createTag('div', { class: 'unity-slf-copy-label pu-upload-heading' }, placeholderText(this.el, 'icon-dropzone-label') || 'Upload source files');
    const hint = placeholderText(this.el, 'icon-dropzone-hint');
    const refs = buildDropzone({
      allowedFileTypes: this.cfg.limits?.allowedFileTypes || [],
      multiple: true,
      uploadLabel: 'Upload source files',
    });
    const leftSection = createTag('div', { class: 'pu-left-section' });
    leftSection.append(uploadLabel, refs.wrap);
    if (hint) leftSection.append(createTag('div', { class: 'pu-dropzone-hint' }, hint));
    return { leftSection, dropZoneRefs: refs };
  }

  buildSearchCta() {
    const label = labelForField(this.el, 'icon-generate', 'Search');
    const btn = createTag('a', {
      href: '#',
      class: 'unity-act-btn search-cta disabled',
      'aria-disabled': 'true',
      'aria-label': label,
      role: 'button',
    }, createTag('div', { class: 'btn-txt' }, label));
    return btn;
  }

  setSearchEnabled(enabled) {
    if (!this.searchCta) return;
    this.searchCta.classList.toggle('disabled', !enabled);
    this.searchCta.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  }

  buildRightSection() {
    const promptHeading = placeholderText(this.el, 'icon-placeholder-prompt')
      || labelForField(this.el, 'icon-label-prompt', 'Search by URL, title, ISBN, DOI, or keywords');
    const promptLabel = createTag('label', { for: 'pbuPromptInput', class: 'unity-slf-copy-label' }, promptHeading);

    const input = buildPromptInput({
      ariaLabel: promptHeading,
      placeholder: promptHeading,
      onInput: (value) => this.setSearchEnabled(!!value),
    });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      // Own Enter so the binder's default (.gen-btn generate) doesn't pre-empt search.
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

    // Hidden binder-driven CTA used to hand a selected citation off to the redirect flow.
    this.genBtn = createTag('a', { href: '#', class: 'unity-act-btn gen-btn hidden', 'aria-hidden': 'true', tabindex: '-1' }, 'Generate');

    this.resultsEl = createTag('div', { class: 'pu-results' });

    const actWrap = createTag('div', { class: 'act-wrap' });
    actWrap.append(this.searchCta, this.genBtn);

    const searchRow = createTag('div', { class: 'pu-search-row' });
    searchRow.append(input, actWrap);

    const container = createTag('div', { class: 'pu-prompt-bar-container' });
    container.append(promptLabel, searchRow, this.resultsEl);

    const rightSection = createTag('div', { class: 'pu-right-section' });
    rightSection.append(container);
    return rightSection;
  }

  async onSearch() {
    const input = this.widgetWrap?.querySelector('#pbuPromptInput');
    const query = input?.value?.trim() || '';
    if (!query) return;
    try {
      // Deferred modules: only fetched on first interaction (kept out of preload/LCP).
      const [{ buildDropdownShell, attachDropdownBehavior, syncDropdownSelection }, { default: searchCitations }] = await Promise.all([
        import('../shared/dropdown.js'),
        import('./citation-mock.js'),
      ]);
      const citations = await searchCitations(query);
      this.resultsEl.innerHTML = '';
      const { container, triggerBtn, nameContainer, list } = buildDropdownShell({
        label: 'Matching citations',
        menuId: 'pu-citation-menu',
        extraClass: 'pu-citation-dropdown',
      });
      nameContainer.textContent = `${citations.length} result${citations.length === 1 ? '' : 's'} for “${query}”`;

      citations.forEach((c, idx) => {
        const link = createTag('a', { href: '#', class: 'verb-link model-link', role: 'option', 'aria-selected': idx === 0 ? 'true' : 'false', 'data-citation-id': c.id });
        const text = createTag('span', { class: 'model-name pu-citation-text' });
        text.append(
          createTag('span', { class: 'pu-citation-title' }, c.title),
          createTag('span', { class: 'pu-citation-meta' }, `${c.authors} (${c.year}). ${c.source}`),
        );
        link.append(text);
        const li = createTag('li', { class: `verb-item${idx === 0 ? ' selected' : ''}`, role: 'presentation' });
        li.append(link);
        list.append(li);
      });

      list.addEventListener('click', (e) => {
        const link = e.target.closest('a.model-link');
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();
        syncDropdownSelection(list, link);
        this.onCitationSelected(citations.find((c) => c.id === link.getAttribute('data-citation-id')));
      });

      this.resultsEl.append(container);
      attachDropdownBehavior(container, triggerBtn, list);
      // Open immediately so the results are visible right after Search.
      triggerBtn.click();
    } catch (err) {
      window.lana?.log(`Message: citation search failed, Error: ${err}`, this.lanaOptions);
    }
  }

  onCitationSelected(citation) {
    if (!citation) return;
    const input = this.widgetWrap?.querySelector('#pbuPromptInput');
    if (input) input.value = citation.title;
    // Hand off to the workflow's prompt->redirect flow (binder-driven).
    this.genBtn?.click();
  }

  async initWidget() {
    const showUpload = this.cfg.showUpload !== false;
    const showPrompt = this.cfg.showPrompt !== false;

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

    if (dropZoneRefs) wirePreview(this.widgetWrap, dropZoneRefs);
    return this.cfg.actionMap;
  }
}
