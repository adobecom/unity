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
    this.genBtn = null;
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

  // Options dropdown (e.g. APA editions). Each authored value is `Label|payloadValue`
  // (e.g. `APA 7th Edition|apa7`); the label shows in the UI, the payloadValue is what the
  // widget stores (data-selected-option-value) and the binder sends. Returns null when empty.
  buildDropdown() {
    const raw = placeholderText(this.el, 'icon-prompt-dropdown-values');
    const options = raw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const [label, value] = s.split('|').map((p) => p.trim());
      return { label, value: value || label };
    });
    if (!options.length) return null;
    this.selectedOption = options[0].value;
    const { container, triggerBtn, nameContainer, list } = buildDropdownShell({ label: 'Options', menuId: 'pu-prompt-dropdown-menu', extraClass: 'pu-style-dropdown' });
    nameContainer.textContent = options[0].label;
    setComboboxTriggerAriaLabel(triggerBtn, nameContainer);

    options.forEach((opt, idx) => {
      const link = createTag('a', { href: '#', class: 'verb-link model-link', role: 'option', 'aria-selected': idx === 0 ? 'true' : 'false', 'data-option-value': opt.value });
      link.append(
        createTag('span', { class: 'selected-icon' }, svgIcon('#unity-checkmark-icon')),
        createTag('span', { class: 'model-name' }, opt.label),
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
      nameContainer.textContent = link.querySelector('.model-name')?.textContent || '';
      setComboboxTriggerAriaLabel(triggerBtn, nameContainer);
      this.setSelectedOption(link.getAttribute('data-option-value') || '');
      syncDropdownSelection(list, link);
      closeDropdown(container, triggerBtn, list);
    });
    attachDropdownBehavior(container, triggerBtn, list);
    return container;
  }

  // The primary CTA. It carries the `gen-btn` class so the action-binder binds it to the
  // generate flow (query -> BE -> redirect); Enter in the prompt also triggers it via the binder.
  buildCta() {
    const label = labelForField(this.el, 'icon-cta-text', 'Generate');
    const cta = createTag('a', {
      href: '#',
      class: 'unity-act-btn gen-btn pu-cta',
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
      actWrap.append(this.genBtn);
      footer.append(actWrap);
    }
    const hasContent = left.children.length || secondaryText || ctaInFooter;
    return hasContent ? footer : null;
  }

  async initWidget() {
    // Components are inferred from authored content; `show-dropzone`/`show-prompt` force them on.
    const uploadContent = ['icon-dropzone-label', 'icon-dropzone-subtext', 'icon-dropzone-drag-text'];
    const promptContent = ['icon-placeholder-text', 'icon-prompt-helper', 'icon-prompt-dropdown-values'];
    const hasUpload = this.authoredFlag('icon-show-dropzone', false) || uploadContent.some((f) => this.hasFlag(f));
    const hasPrompt = this.authoredFlag('icon-show-prompt', false) || promptContent.some((f) => this.hasFlag(f));

    const title = placeholderText(this.el, 'icon-title');
    const dropdown = this.buildDropdown();
    const dropdownInHeader = placeholderText(this.el, 'icon-dropdown-placement') === 'header';
    const ctaInline = placeholderText(this.el, 'icon-cta-placement') === 'inline';
    this.genBtn = this.buildCta();

    const main = createTag('div', { class: 'pu-main' });

    const header = this.buildHeader(title, dropdown, dropdownInHeader);
    if (header) main.append(header);

    if (hasPrompt) {
      const searchRow = createTag('div', { class: 'pu-search-row' });
      const field = this.buildSearchField();
      if (ctaInline) {
        field.classList.add('pu-pill');
        field.append(this.genBtn);
      }
      searchRow.append(field);
      main.append(searchRow);
    }

    const footer = this.buildFooter(hasUpload, dropdown, !dropdownInHeader, !ctaInline);
    if (footer) main.append(footer);

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
    return this.cfg.actionMap;
  }
}
