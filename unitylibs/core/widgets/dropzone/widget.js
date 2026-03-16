import { createTag } from '../../../scripts/utils.js';

const VIEWPORTS = ['mobile-up', 'tablet-up', 'desktop-up'];
let dropzoneCounter = 0;

function nextDropzoneId() {
  dropzoneCounter += 1;
  return dropzoneCounter;
}

function extractColumnParts(col) {
  const paragraphs = [...col.querySelectorAll('p')];

  // The upload icon is the first <img> or <a> pointing to an SVG
  const iconPara = paragraphs.find((p) => p.querySelector('img[src$=".svg"], a[href$=".svg"]'));
  const iconSrc = iconPara?.querySelector('img[src$=".svg"]')?.src
    || iconPara?.querySelector('a[href$=".svg"]')?.href
    || null;

  // The CTA is the paragraph whose text matches "Upload" or contains an icon-upload span
  const ctaPara = paragraphs.find((p) => p.querySelector('span[class*="icon-upload"]') || (p !== iconPara && /upload/i.test(p.textContent)));

  // Terms: last paragraph (contains legal links)
  const termsPara = paragraphs[paragraphs.length - 1];

  // Remaining paragraphs (drag text, file type text)
  const bodyParas = paragraphs.filter((p) => p !== iconPara && p !== ctaPara && p !== termsPara);

  return { iconSrc, ctaPara, bodyParas, termsPara };
}

function buildFileInput(ctaText, columnId) {
  const filePickerLabel = ctaText ? `${ctaText} file picker` : 'File picker';
  return createTag('input', {
    type: 'file',
    name: 'file-upload',
    id: `file-upload-${columnId}`,
    class: 'file-upload hide',
    accept: 'image/*',
    'aria-label': filePickerLabel,
  });
}

function buildUploadButton(ctaPara, columnId) {
  const button = createTag('span', {
    class: 'con-button blue action-button button-xl no-track',
    'aria-hidden': 'true',
    'daa-ll': 'Upload asset CTA|UnityWidget',
  });
  if (ctaPara) {
    button.innerHTML = ctaPara.innerHTML;
    // Make any decorative images inside the button non-focusable
    button.querySelectorAll('picture, picture img').forEach((el) => {
      el.setAttribute('tabindex', '-1');
      el.setAttribute('role', 'presentation');
    });
  }
  const fileInput = buildFileInput(ctaPara?.textContent?.trim(), columnId);
  if (ctaPara) {
    ctaPara.classList.add('upload-action-container');
    ctaPara.textContent = '';
    ctaPara.append(button, fileInput);
  }
  return { button, fileInput };
}

function buildDropzoneIcon(iconSrc) {
  if (!iconSrc) return null;
  const wrapper = createTag('p', { class: 'drop-zone-default-icon', 'aria-hidden': 'true' });
  wrapper.append(createTag('img', { src: iconSrc, alt: '' }));
  return wrapper;
}

function wireDropzoneA11y(dropZone, fileInput, ariaLabel) {
  dropZone.setAttribute('role', 'button');
  dropZone.setAttribute('tabindex', '0');
  dropZone.setAttribute('aria-label', ariaLabel);
  if (fileInput?.id) dropZone.setAttribute('aria-controls', fileInput.id);

  dropZone.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput?.click();
  });

  dropZone.addEventListener('keydown', (e) => {
    if (e.target !== dropZone) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  });
}

function buildDropzone(col, viewportClasses) {
  const columnId = nextDropzoneId();
  const { iconSrc, ctaPara, bodyParas, termsPara } = extractColumnParts(col);
  const { fileInput } = buildUploadButton(ctaPara, columnId);

  const dropZone = createTag('div', { class: `drop-zone ${viewportClasses.join(' ')}` });
  const icon = buildDropzoneIcon(iconSrc);
  if (icon) dropZone.append(icon);
  if (ctaPara) dropZone.append(ctaPara);
  bodyParas.forEach((p) => dropZone.append(p));

  const ariaLabel = ctaPara?.textContent?.trim() || 'Upload your file. Or drag and drop here.';
  wireDropzoneA11y(dropZone, fileInput, ariaLabel);

  const dropZoneContainer = createTag('div', { class: `drop-zone-container ${viewportClasses.join(' ')}` });
  dropZoneContainer.append(dropZone);
  if (termsPara && termsPara !== ctaPara) dropZoneContainer.append(termsPara);

  return { dropZoneContainer, fileInput };
}

function setupDragAndDrop(slot) {
  let activeDropZone = null;

  const getVisibleDropZone = () => {
    const zones = [...slot.querySelectorAll('.drop-zone')];
    return zones.find((z) => z.offsetParent !== null) || zones[0];
  };

  const setActive = () => {
    const next = getVisibleDropZone();
    if (activeDropZone && activeDropZone !== next) activeDropZone.classList.remove('active');
    activeDropZone = next;
    activeDropZone?.classList.add('active');
  };

  const clearActive = () => {
    activeDropZone?.classList.remove('active');
    activeDropZone = null;
  };

  slot.addEventListener('dragenter', (e) => { e.preventDefault(); setActive(); });
  slot.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setActive(); });
  slot.addEventListener('dragleave', (e) => { e.preventDefault(); clearActive(); });

  slot.addEventListener('drop', (e) => {
    e.preventDefault();
    setActive();
    const fileInput = activeDropZone?.querySelector('.file-upload');
    const files = e.dataTransfer?.files;
    if (files?.length && fileInput) {
      try { fileInput.files = files; } catch { /* some browsers restrict FileList assignment */ }
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    clearActive();
  });

  document.addEventListener('dragend', clearActive);
  window.addEventListener('drop', clearActive);
  window.addEventListener('dragend', clearActive);
}

export default class UnityWidget {
  constructor(slot, el, workflowCfg) {
    this.slot = slot;
    this.el = el;
    this.workflowCfg = workflowCfg;
    this.actionMap = {
      '.drop-zone': 'upload',
      '.file-upload': 'upload',
    };
  }

  getWidgetContent() {
    const rows = [...this.el.querySelectorAll(':scope > div')];
    if (rows.length < 2) return null;
    const lastRow = rows[rows.length - 1];
    const firstCell = lastRow?.querySelector(':scope > div');
    if (!firstCell) return null;
    if (firstCell.querySelector('ul > li > span[class*="icon-"]')) return null;
    return lastRow;
  }

  async initWidget() {
    const widgetContent = this.getWidgetContent();

    if (!widgetContent) {
      this.buildFallbackDropzone();
      setupDragAndDrop(this.slot);
      return this.actionMap;
    }

    const contentRow = widgetContent.querySelector(':scope > div');
    if (!contentRow) return this.actionMap;

    const columns = [...contentRow.children];
    columns.forEach((col, index) => {
      const viewportClasses = [];
      if (columns.length === 1) {
        viewportClasses.push(...VIEWPORTS);
      } else if (columns.length === 2) {
        viewportClasses.push(index === 0 ? VIEWPORTS[0] : `${VIEWPORTS[1]} ${VIEWPORTS[2]}`);
      } else {
        viewportClasses.push(VIEWPORTS[index] || VIEWPORTS[VIEWPORTS.length - 1]);
      }

      const { dropZoneContainer } = buildDropzone(col, viewportClasses.join(' ').trim().split(' '));
      this.slot.append(dropZoneContainer);
    });

    setupDragAndDrop(this.slot);
    return this.actionMap;
  }

  buildFallbackDropzone() {
    const columnId = nextDropzoneId();
    const fileInput = buildFileInput('Upload your file', columnId);
    const button = createTag('span', {
      class: 'con-button blue action-button button-xl no-track',
      'aria-hidden': 'true',
    }, 'Upload your file');

    const ctaContainer = createTag('p', { class: 'upload-action-container' });
    ctaContainer.append(button, fileInput);

    const dropZone = createTag('div', { class: 'drop-zone mobile-up tablet-up desktop-up' });
    dropZone.append(ctaContainer);

    wireDropzoneA11y(dropZone, fileInput, 'Upload your file. Or drag and drop here.');

    const container = createTag('div', { class: 'drop-zone-container mobile-up tablet-up desktop-up' });
    container.append(dropZone);
    this.slot.append(container);
  }
}
