/*
 * prompt-upload widget — Option B (inlined single bundle).
 *
 * Functionally identical to Option A, but every primitive (dropzone, prompt input,
 * dropdown, widget shell) and the citation mock are inlined into this one module so
 * the widget ships as a single network request — the "single network bundle" pattern
 * used elsewhere in the codebase (cf. prompt-bar-style.js). This is the LCP control
 * for the A-vs-B comparison; there is NO core/widgets/shared/ layer on this branch.
 *
 * Honors the workflow-prompt-upload binder DOM contract: `.drop-zone`, `#file-upload`,
 * `#pbuPromptInput`, `.gen-btn`, `.ex-unity-wrap`, `pbu-image-selected`, `pbu-delete-image`.
 */
import { createTag, getUnityLibs } from '../../../scripts/utils.js';

// ---- POC mock (inlined): keyword -> citation matches (requirement #2). ----
const MOCK_CITATIONS = [
  { id: 'c1', title: 'Spectroscopic constraints on dark matter–photon coupling in dwarf galaxies', authors: 'Martínez, E., Singh, R., & Okafor, P.', year: '2026', source: 'Cosmological Physics, 17(2), 88–113.' },
  { id: 'c2', title: 'A survey of transformer architectures for scientific text', authors: 'Chen, L., & Gupta, A.', year: '2025', source: 'Journal of Machine Learning, 41(4), 210–245.' },
  { id: 'c3', title: 'Climate feedback loops in Arctic permafrost systems', authors: 'Olsen, K., Ahmed, S., & Rivera, M.', year: '2024', source: 'Nature Climate Science, 9(1), 12–34.' },
  { id: 'c4', title: 'Neural correlates of memory consolidation during sleep', authors: 'Nakamura, T., & Bauer, J.', year: '2023', source: 'Neuroscience Review, 58(3), 401–428.' },
  { id: 'c5', title: 'Photonic quantum computing: a decade in review', authors: 'Fernandez, D., Li, W., & Brown, C.', year: '2026', source: 'Quantum Reports, 5(2), 55–90.' },
];

function searchCitations(query = '') {
  const q = query.trim().toLowerCase();
  return new Promise((resolve) => {
    setTimeout(() => {
      if (!q) { resolve(MOCK_CITATIONS.slice(0, 3)); return; }
      const matches = MOCK_CITATIONS.filter((c) => `${c.title} ${c.authors} ${c.source}`.toLowerCase().includes(q));
      resolve(matches.length ? matches : MOCK_CITATIONS.slice(0, 2));
    }, 150);
  });
}

// ---- Authoring/shell helpers (inlined) ----
function svgIcon(href) {
  return `<svg><use xlink:href="${href}"></use></svg>`;
}

function placeholderText(root, iconClass) {
  const icon = root.querySelector(`.${iconClass}`) || root.querySelector(`[class*="${iconClass}"]`);
  if (!icon) return '';
  return (icon.closest('li')?.innerText || '').replace(/\s+/g, ' ').trim();
}

function labelForField(root, iconClass, fallback) {
  return placeholderText(root, iconClass) || fallback;
}

function extractLegalFootFromAuthoring(root) {
  const marker = root.querySelector('[class*="icon-legal-terms"]');
  if (!marker) return null;
  const li = marker.closest('li');
  const foot = createTag('div', { class: 'pu-legal-foot' });
  if (li?.parentElement) {
    while (li.firstChild) foot.append(li.firstChild);
    li.remove();
    return foot;
  }
  foot.append(marker.cloneNode(true));
  marker.remove();
  return foot;
}

// ---- Dropdown/combobox (inlined) ----
function setComboboxTriggerAriaLabel(triggerBtn, nameContainer) {
  const v = (nameContainer.textContent || '').trim();
  const prefix = triggerBtn.dataset.comboboxLabel || '';
  triggerBtn.setAttribute('aria-label', v ? `${prefix}, ${v}` : prefix);
}

function closeDropdown(container, triggerBtn, list) {
  container.classList.remove('show-menu');
  list.setAttribute('style', 'display: none;');
  triggerBtn.setAttribute('aria-expanded', 'false');
}

function syncDropdownSelection(list, activeLink) {
  list.querySelectorAll('li').forEach((li) => {
    const a = li.querySelector('a');
    const isActive = a === activeLink;
    li.classList.toggle('selected', isActive);
    a?.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

function buildDropdownShell({ label, menuId, extraClass = '' }) {
  const container = createTag('div', { class: `models-container${extraClass ? ` ${extraClass}` : ''}`, role: 'group', 'aria-label': label });
  const nameContainer = createTag('span', { class: 'model-name' });
  const menuIcon = createTag('span', { class: 'menu-icon' }, svgIcon('#unity-chevron-icon'));
  const triggerBtn = createTag('button', { type: 'button', class: 'selected-model', 'aria-expanded': 'false', 'aria-controls': menuId, 'aria-haspopup': 'listbox', role: 'combobox' });
  triggerBtn.dataset.comboboxLabel = label;
  triggerBtn.append(nameContainer, menuIcon);
  const list = createTag('ul', { class: 'verb-list', id: menuId, role: 'listbox' });
  list.setAttribute('style', 'display: none;');
  container.append(triggerBtn, list);
  return { container, triggerBtn, nameContainer, list };
}

function attachDropdownBehavior(container, triggerBtn, list) {
  const getOptions = () => [...list.querySelectorAll('a.model-link')];
  const focusSelectedOrFirst = () => {
    const options = getOptions();
    if (!options.length) return;
    const selected = options.find((option) => option.getAttribute('aria-selected') === 'true');
    (selected || options[0])?.focus();
  };
  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = container.classList.toggle('show-menu');
    if (isOpen) list.removeAttribute('style');
    else list.setAttribute('style', 'display: none;');
    triggerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
  triggerBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeDropdown(container, triggerBtn, list); triggerBtn.focus(); return; }
    if (!['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    if (!container.classList.contains('show-menu')) {
      container.classList.add('show-menu');
      list.removeAttribute('style');
      triggerBtn.setAttribute('aria-expanded', 'true');
    }
    focusSelectedOrFirst();
  });
  list.addEventListener('keydown', (e) => {
    const options = getOptions();
    if (!options.length) return;
    const idx = options.findIndex((option) => option === document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); closeDropdown(container, triggerBtn, list); triggerBtn.focus(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); options[idx < 0 ? 0 : (idx + 1) % options.length]?.focus(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); options[idx < 0 ? options.length - 1 : (idx - 1 + options.length) % options.length]?.focus(); return; }
    if (e.key === 'Home') { e.preventDefault(); options[0]?.focus(); return; }
    if (e.key === 'End') { e.preventDefault(); options[options.length - 1]?.focus(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (idx >= 0 ? options[idx] : options[0])?.click(); }
  });
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target)) closeDropdown(container, triggerBtn, list);
  });
}

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

  /* Reads an authored boolean row (e.g. icon-show-dropzone -> "true"); falls back to cfg. */
  authoredFlag(iconClass, fallback) {
    const raw = placeholderText(this.el, iconClass);
    if (raw === '') return fallback;
    return raw.trim().toLowerCase() === 'true';
  }

  setSelectedOption(value) {
    this.selectedOption = value;
    this.widgetWrap?.setAttribute('data-selected-option-value', value);
  }

  /* Persistent citation-style dropdown (e.g. APA editions) from icon-show-citationdropdown-values. */
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

  // ---- Dropzone (inlined) ----
  buildDropzone() {
    const allowedFileTypes = this.cfg.limits?.allowedFileTypes || [];
    const fileInput = createTag('input', { type: 'file', id: 'file-upload', accept: allowedFileTypes.join(','), multiple: '', hidden: '', 'aria-hidden': 'true' });
    const dropContent = createTag('div', { class: 'shared-drop-content' }, createTag('img', { loading: 'lazy', src: `${getUnityLibs()}/img/icons/upload.svg`, alt: '' }));
    const dropZone = createTag('div', { class: 'drop-zone', role: 'button', tabindex: '0', 'aria-label': 'Upload source files' });
    dropZone.append(fileInput, dropContent);
    dropZone.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      fileInput.click();
    });
    const previewImg = createTag('img', { class: 'shared-preview-img', alt: 'Selected file preview' });
    const deleteBtn = createTag('button', { type: 'button', class: 'shared-delete-btn', 'aria-label': 'Remove file' });
    deleteBtn.innerHTML = svgIcon('#unity-trash-icon');
    const preview = createTag('div', { class: 'shared-preview hidden', 'aria-hidden': 'true' });
    preview.append(previewImg, deleteBtn);
    const wrap = createTag('div', { class: 'shared-drop-zone-wrap' });
    wrap.append(dropZone, preview);
    return { wrap, dropZone, preview, previewImg, deleteBtn };
  }

  wirePreview({ dropZone, preview, previewImg, deleteBtn }) {
    const showPreview = (file) => {
      if (!file || !file.type?.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      previewImg.src = url;
      previewImg.onload = () => URL.revokeObjectURL(url);
      dropZone.classList.add('hidden');
      preview.classList.remove('hidden');
      preview.removeAttribute('aria-hidden');
    };
    const showDropZone = () => {
      dropZone.classList.remove('hidden');
      preview.classList.add('hidden');
      preview.setAttribute('aria-hidden', 'true');
      previewImg.src = '';
    };
    this.widgetWrap?.addEventListener('pbu-image-selected', (e) => showPreview(e.detail?.file));
    deleteBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      showDropZone();
      this.widgetWrap?.dispatchEvent(new CustomEvent('pbu-delete-image'));
    });
  }

  buildLeftSection() {
    const uploadLabel = createTag('div', { class: 'unity-slf-copy-label pu-upload-heading' }, placeholderText(this.el, 'icon-dropzone-title') || 'Upload source files');
    const hint = placeholderText(this.el, 'icon-dropzone-hint');
    const refs = this.buildDropzone();
    const leftSection = createTag('div', { class: 'pu-left-section' });
    leftSection.append(uploadLabel, refs.wrap);
    if (hint) leftSection.append(createTag('div', { class: 'pu-dropzone-hint' }, hint));
    return { leftSection, dropZoneRefs: refs };
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

    const input = createTag('textarea', { id: 'pbuPromptInput', class: 'inp-field', rows: '1', 'aria-label': promptHeading, placeholder: promptHeading, 'aria-autocomplete': 'list' });
    input.addEventListener('input', () => this.setSearchEnabled(!!input.value.trim()));
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      // Own Enter so the binder's default (.gen-btn generate) doesn't pre-empt search.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!this.searchCta.classList.contains('disabled')) this.onSearch();
    });

    const searchLabel = labelForField(this.el, 'icon-cta-text', 'Generate');
    this.searchCta = createTag('a', { href: '#', class: 'unity-act-btn search-cta disabled', 'aria-disabled': 'true', 'aria-label': searchLabel, role: 'button' }, createTag('div', { class: 'btn-txt' }, searchLabel));
    this.searchCta.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.searchCta.classList.contains('disabled')) return;
      this.onSearch();
    });

    // Hidden binder-driven CTA used to hand a selected citation off to the redirect flow.
    this.genBtn = createTag('a', { href: '#', class: 'unity-act-btn gen-btn hidden', 'aria-hidden': 'true', tabindex: '-1' }, 'Generate');
    this.resultsEl = createTag('div', { class: 'pu-results' });

    const styleDropdown = this.buildCitationStyleDropdown();
    const actWrap = createTag('div', { class: 'act-wrap' });
    actWrap.append(this.searchCta, this.genBtn);
    const searchRow = createTag('div', { class: 'pu-search-row' });
    searchRow.append(input);
    if (styleDropdown) searchRow.append(styleDropdown);
    searchRow.append(actWrap);
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
      const citations = await searchCitations(query);
      this.resultsEl.innerHTML = '';
      const { container, triggerBtn, nameContainer, list } = buildDropdownShell({ label: 'Matching citations', menuId: 'pu-citation-menu', extraClass: 'pu-citation-dropdown' });
      nameContainer.textContent = `${citations.length} result${citations.length === 1 ? '' : 's'} for “${query}”`;
      citations.forEach((c, idx) => {
        const link = createTag('a', { href: '#', class: 'verb-link model-link', role: 'option', 'aria-selected': idx === 0 ? 'true' : 'false', 'data-citation-id': c.id });
        const text = createTag('span', { class: 'model-name pu-citation-text' });
        text.append(createTag('span', { class: 'pu-citation-title' }, c.title), createTag('span', { class: 'pu-citation-meta' }, `${c.authors} (${c.year}). ${c.source}`));
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
      triggerBtn.click();
    } catch (err) {
      window.lana?.log(`Message: citation search failed, Error: ${err}`, this.lanaOptions);
    }
  }

  onCitationSelected(citation) {
    if (!citation) return;
    const input = this.widgetWrap?.querySelector('#pbuPromptInput');
    if (input) input.value = citation.title;
    this.genBtn?.click();
  }

  mount(main) {
    // Light by default (matches the Citation Generator design); authors opt into dark
    // by adding a `dark` class to the unity block.
    const skin = this.el.classList.contains('dark') ? 'dark' : 'light';
    const interactiveShell = createTag('div', { class: `interactive-area ${skin}` });
    interactiveShell.append(main);
    const root = createTag('div', { class: 'unity-prompt-upload unity-enabled' });
    root.append(interactiveShell);
    const holder = createTag('div', { class: 'unity-shared-config-holder unity-slf-sr-only' });
    holder.setAttribute('aria-hidden', 'true');
    const legalFoot = extractLegalFootFromAuthoring(this.el);
    while (this.el.firstChild) holder.append(this.el.firstChild);
    this.el.append(holder);
    this.el.classList.add('unity-prompt-upload-host');
    const unitySprite = createTag('div', { class: 'unity-sprite-container' });
    unitySprite.innerHTML = this.spriteCon || '';
    this.widgetWrap = createTag('div', { class: 'ex-unity-wrap verb-options pu-widget' });
    this.widgetWrap.append(unitySprite, root);
    if (legalFoot) this.widgetWrap.append(legalFoot);
    // Resolve the anchor within the whole interactive area so `target: ".copy"` +
    // `insert: "after"` places the widget as a sibling right after the copy column.
    const interactArea = this.target?.querySelector('.copy') || this.target;
    const { target: anchorSelector, insert } = this.cfg;
    const anchor = anchorSelector ? this.target?.querySelector(anchorSelector) : null;
    if (anchor && insert === 'before') anchor.before(this.widgetWrap);
    else if (anchor) anchor.after(this.widgetWrap);
    else interactArea?.appendChild(this.widgetWrap);
  }

  async initWidget() {
    const showUpload = this.authoredFlag('icon-show-dropzone', this.cfg.showUpload !== false);
    const showPrompt = this.authoredFlag('icon-show-search', this.cfg.showPrompt !== false);
    const main = createTag('div', { class: 'pu-main' });
    let dropZoneRefs = null;
    if (showUpload) {
      const left = this.buildLeftSection();
      dropZoneRefs = left.dropZoneRefs;
      main.append(left.leftSection);
    }
    if (showPrompt) main.append(this.buildRightSection());
    this.mount(main);
    if (this.selectedOption) this.setSelectedOption(this.selectedOption);
    if (dropZoneRefs) this.wirePreview(dropZoneRefs);
    return this.cfg.actionMap;
  }
}
