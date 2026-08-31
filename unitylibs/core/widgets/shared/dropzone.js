import { createTag, getUnityLibs } from '../../../scripts/utils.js';
import { svgIcon } from './widget-base.js';

export default function buildDropzone({
  allowedFileTypes = [], multiple = false, uploadLabel = 'Upload files',
  style = 'box', selectFileText = 'Select file', dragText = '',
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

  const wireOpen = (zone) => {
    zone.addEventListener('click', (e) => { if (e.target === fileInput) return; fileInput.click(); });
    zone.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      fileInput.click();
    });
  };

  if (style === 'compact') {
    const compactZone = createTag('div', {
      class: 'drop-zone pu-add-sources',
      role: 'button',
      tabindex: '0',
      'aria-label': uploadLabel,
    });
    const ico = createTag('span', { class: 'pu-add-sources-icon', 'aria-hidden': 'true' });
    ico.innerHTML = svgIcon('#unity-add-sources-icon');
    compactZone.append(fileInput, ico, createTag('span', { class: 'pu-add-sources-label' }, selectFileText));
    wireOpen(compactZone);

    const compactWrap = createTag('div', { class: 'shared-drop-zone-wrap pu-add-sources-wrap' });
    compactWrap.append(compactZone);
    return { wrap: compactWrap, dropZone: compactZone, fileInput };
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
    return { wrap: panelWrap, dropZone: panelZone, fileInput, selectBtn, preview: null };
  }

  const dropContent = createTag('div', { class: 'shared-drop-content' });
  dropContent.append(createTag('img', {
    loading: 'lazy',
    src: `${getUnityLibs()}/img/icons/upload.svg`,
    alt: '',
  }));

  const dropZone = createTag('div', {
    class: 'drop-zone',
    role: 'button',
    tabindex: '0',
    'aria-label': uploadLabel,
  });
  dropZone.append(fileInput, dropContent);
  wireOpen(dropZone);

  const wrap = createTag('div', { class: 'shared-drop-zone-wrap' });
  wrap.append(dropZone);
  return { wrap, dropZone, fileInput };
}
