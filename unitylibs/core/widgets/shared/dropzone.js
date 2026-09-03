import { createTag, getUnityLibs } from '../../../scripts/utils.js';
import { svgIcon } from './widget-base.js';

// Three dropzone styles:
//  - compact: inline icon/link ("Add sources" / "Select files") + optional drag text
//  - panel:   full-width box with a "Select file" button + drag-and-drop text
//  - box:     compact dashed box with an upload icon (default)
export default function buildDropzone({
  allowedFileTypes = [], multiple = false, uploadLabel = 'Upload files',
  style = 'box', selectFileText = 'Select file', dragText = '', showIcon = true,
}) {
  const fileInputAttrs = {
    type: 'file',
    id: 'file-upload',
    accept: allowedFileTypes.join(','),
    hidden: '',
    'aria-hidden': 'true',
  };
  if (multiple) fileInputAttrs.multiple = '';
  const fileInput = createTag('input', fileInputAttrs);

  // Click anywhere in the zone opens the picker. The `e.target === fileInput` guard stops the
  // input's own bubbled click from re-triggering (infinite-open loop).
  const wireOpen = (zone) => {
    zone.addEventListener('click', (e) => { if (e.target === fileInput) return; fileInput.click(); });
    zone.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      fileInput.click();
    });
  };

  if (style === 'compact') {
    const zone = createTag('div', { class: 'drop-zone pu-add-sources', role: 'button', tabindex: '0', 'aria-label': uploadLabel });
    zone.append(fileInput);
    if (showIcon) {
      const ico = createTag('span', { class: 'pu-add-sources-icon', 'aria-hidden': 'true' });
      ico.innerHTML = svgIcon('#unity-add-sources-icon');
      zone.append(ico);
    }
    zone.append(createTag('span', { class: 'pu-add-sources-label' }, selectFileText));
    if (dragText) zone.append(createTag('span', { class: 'pu-dz-drag' }, dragText));
    wireOpen(zone);
    const wrap = createTag('div', { class: 'shared-drop-zone-wrap pu-add-sources-wrap' });
    wrap.append(zone);
    return { wrap, dropZone: zone, fileInput };
  }

  if (style === 'panel') {
    const selectBtn = createTag('button', { type: 'button', class: 'unity-act-btn pu-select-file-btn' });
    const ico = createTag('span', { class: 'btn-ico', 'aria-hidden': 'true' });
    ico.innerHTML = svgIcon('#unity-upload-icon');
    selectBtn.append(ico, createTag('div', { class: 'btn-txt' }, selectFileText));
    selectBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

    const panelContent = createTag('div', { class: 'shared-drop-content pu-dz-panel-content' });
    panelContent.append(selectBtn);
    if (dragText) panelContent.append(createTag('div', { class: 'pu-dz-drag-text' }, dragText));

    const panelZone = createTag('div', { class: 'drop-zone pu-dz-panel', 'aria-label': uploadLabel });
    panelZone.append(fileInput, panelContent);

    const panelWrap = createTag('div', { class: 'shared-drop-zone-wrap' });
    panelWrap.append(panelZone);
    return { wrap: panelWrap, dropZone: panelZone, fileInput, selectBtn };
  }

  const dropContent = createTag('div', { class: 'shared-drop-content' });
  dropContent.append(createTag('img', {
    loading: 'lazy',
    src: `${getUnityLibs()}/img/icons/upload.svg`,
    alt: '',
  }));

  const dropZone = createTag('div', { class: 'drop-zone', role: 'button', tabindex: '0', 'aria-label': uploadLabel });
  dropZone.append(fileInput, dropContent);
  wireOpen(dropZone);

  const wrap = createTag('div', { class: 'shared-drop-zone-wrap' });
  wrap.append(dropZone);
  return { wrap, dropZone, fileInput };
}
