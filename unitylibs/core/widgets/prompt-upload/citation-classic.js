import { createTag } from '../../../scripts/utils.js';
import { placeholderText } from '../shared/widget-base.js';
import buildDropzone from '../shared/dropzone.js';

// Big left dropzone column (box / panel), with the heading above or inside the box.
export function buildLeftSection(w) {
  const style = placeholderText(w.el, 'icon-dropzone-style') || 'box';
  const heading = placeholderText(w.el, 'icon-dropzone-label') || 'Upload source files';
  const subtext = placeholderText(w.el, 'icon-dropzone-subtext');
  const refs = buildDropzone({
    allowedFileTypes: w.verbLimits.allowedFileTypes || [],
    multiple: true,
    uploadLabel: heading,
    style,
    selectFileText: placeholderText(w.el, 'icon-select-file-text') || 'Select file',
    dragText: placeholderText(w.el, 'icon-drag-text'),
  });
  const subtextEl = subtext ? createTag('div', { class: 'pu-dropzone-subtext' }, subtext) : null;
  const leftSection = createTag('div', { class: 'pu-left-section' });

  if (style === 'panel') {
    leftSection.classList.add('pu-left-panel');
    if (subtextEl) refs.dropZone.append(subtextEl);
    leftSection.append(refs.wrap);
    return leftSection;
  }
  const titleInside = placeholderText(w.el, 'icon-dropzone-label-position') === 'inside';
  const titleEl = createTag('div', { class: 'unity-slf-copy-label pu-upload-heading' }, heading);
  if (titleInside) {
    leftSection.classList.add('pu-dz-title-inside');
    refs.dropZone.append(titleEl);
    if (subtextEl) refs.dropZone.append(subtextEl);
  } else {
    leftSection.append(titleEl);
    if (subtextEl) leftSection.append(subtextEl);
  }
  leftSection.append(refs.wrap);
  return leftSection;
}

// Classic two-column layout: big left dropzone + right prompt with footer dropdown + CTA.
// Preserved for future widgets; loaded only when `layout: classic` is authored (dynamic import).
export default function buildClassicMain(w, { hasUpload, hasPrompt, dropdown }) {
  const compact = placeholderText(w.el, 'icon-dropzone-style') === 'compact';
  const main = createTag('div', { class: 'pu-main pu-classic' });
  if (hasUpload && !compact) main.append(buildLeftSection(w));
  if (hasPrompt) {
    const right = createTag('div', { class: 'pu-right-section' });
    const container = createTag('div', { class: 'pu-prompt-bar-container' });
    const searchRow = createTag('div', { class: 'pu-search-row' });
    searchRow.append(w.buildSearchField());
    container.append(searchRow);
    // dropdown + CTA both live in the footer for the classic layout
    const footer = w.buildFooter(hasUpload && compact, dropdown, true, true);
    if (footer) container.append(footer);
    right.append(container);
    main.append(right);
  }
  return main;
}
