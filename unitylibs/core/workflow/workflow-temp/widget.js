/* eslint-disable class-methods-use-this */

import { createTag } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
    this.spriteCon = spriteCon;
    this.genBtn = null;
    this.uploadedFile = null;
    this.lanaOptions = { sampleRate: 100, tags: 'Unity-FF' };
  }

  async initWidget() {
    const [widgetWrap, widget, unitySprite] = ['ex-unity-wrap', 'ex-unity-widget', 'unity-sprite-container']
      .map((c) => createTag('div', { class: c }));
    this.widgetWrap = widgetWrap;
    this.widget = widget;
    unitySprite.innerHTML = this.spriteCon;
    this.widgetWrap.append(unitySprite);
    this.workflowCfg.placeholder = this.popPlaceholders();
    const inputWrapper = this.createInpWrap(this.workflowCfg.placeholder);
    const comboboxContainer = createTag('div', { class: 'autocomplete' });
    comboboxContainer.append(inputWrapper);
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

  createInpWrap(ph) {
    const inpWrap = createTag('div', { class: 'inp-wrap' });

    // Create hidden file input
    const fileInput = createTag('input', {
      type: 'file',
      class: 'file-input',
      accept: 'image/*,.pdf',
      'aria-hidden': 'true',
      style: 'display: none;',
    });

    // Create plus icon button for file upload
    const uploadBtn = createTag('button', {
      class: 'upload-btn',
      'aria-label': 'Upload file',
      type: 'button',
    });

    // Create SVG element properly using SVG namespace
    const svgNS = 'http://www.w3.org/2000/svg';
    const plusIcon = document.createElementNS(svgNS, 'svg');
    plusIcon.setAttribute('class', 'plus-icon');
    plusIcon.setAttribute('width', '24');
    plusIcon.setAttribute('height', '24');
    plusIcon.setAttribute('viewBox', '0 0 24 24');
    plusIcon.setAttribute('fill', 'none');
    plusIcon.setAttribute('stroke', 'currentColor');
    plusIcon.setAttribute('stroke-width', '2');
    plusIcon.setAttribute('stroke-linecap', 'round');

    // Create the plus sign paths
    const verticalLine = document.createElementNS(svgNS, 'line');
    verticalLine.setAttribute('x1', '12');
    verticalLine.setAttribute('y1', '5');
    verticalLine.setAttribute('x2', '12');
    verticalLine.setAttribute('y2', '19');

    const horizontalLine = document.createElementNS(svgNS, 'line');
    horizontalLine.setAttribute('x1', '5');
    horizontalLine.setAttribute('y1', '12');
    horizontalLine.setAttribute('x2', '19');
    horizontalLine.setAttribute('y2', '12');

    plusIcon.appendChild(verticalLine);
    plusIcon.appendChild(horizontalLine);
    uploadBtn.append(plusIcon);

    // Add click handler to open file picker
    uploadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileInput.click();
    });

    // Add file selection handler
    fileInput.addEventListener('change', (e) => {
      const { files } = e.target;
      if (files && files.length > 0) {
        this.handleFileUpload(files[0]);
      }
    });

    // Create input field
    const inpField = createTag('input', {
      id: 'promptInput',
      class: 'inp-field',
      type: 'text',
      placeholder: ph['placeholder-input'] || 'Message',
      'aria-label': 'Prompt input',
    });

    // Create generate button
    const actWrap = createTag('div', { class: 'act-wrap' });
    const genBtn = this.createActBtn(this.el.querySelector('.icon-generate')?.closest('li'), 'gen-btn');
    actWrap.append(genBtn);

    inpWrap.append(fileInput, uploadBtn, inpField, actWrap);
    return inpWrap;
  }

  handleFileUpload(file) {
    // Store the file for later use
    this.uploadedFile = file;

    // You can add visual feedback here, e.g., showing the file name
    const inpField = this.widget.querySelector('.inp-field');
    if (inpField) {
      inpField.placeholder = `File selected: ${file.name}`;
    }

    // Dispatch custom event for action-binder to handle
    this.widgetWrap.dispatchEvent(new CustomEvent('file-uploaded', { detail: { file } }));
  }

  getUploadedFile() {
    return this.uploadedFile;
  }

  clearUploadedFile() {
    this.uploadedFile = null;
    const inpField = this.widget.querySelector('.inp-field');
    if (inpField) {
      inpField.placeholder = this.workflowCfg.placeholder['placeholder-input'] || 'Message';
    }
  }

  createActBtn(cfg, cls) {
    if (!cfg) return null;
    const txt = cfg.innerText?.trim();
    const img = cfg.querySelector('img[src*=".svg"]');
    const btn = createTag('a', {
      href: '#',
      class: `unity-act-btn ${cls}`,
      'daa-ll': 'Generate',
      'aria-label': txt?.split('\n')[0] || 'Generate',
    });
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
}
