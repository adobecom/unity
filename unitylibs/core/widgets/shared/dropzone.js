import { createTag } from '../../../scripts/utils.js';
import { svgIcon } from './widget-base.js';

// Compact upload affordance: an inline icon/link ("Add sources" / "Select files") that opens
// the picker, plus optional trailing drag text. Also a drop target (wired by the action-binder).
export default function buildDropzone({
  allowedFileTypes = [], multiple = false, uploadLabel = 'Upload files',
  selectFileText = 'Select file', dragText = '', showIcon = true,
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

  const zone = createTag('div', {
    class: 'drop-zone pu-add-sources',
    role: 'button',
    tabindex: '0',
    'aria-label': uploadLabel,
  });
  zone.append(fileInput);
  if (showIcon) {
    const ico = createTag('span', { class: 'pu-add-sources-icon', 'aria-hidden': 'true' });
    ico.innerHTML = svgIcon('#unity-add-sources-icon');
    zone.append(ico);
  }
  zone.append(createTag('span', { class: 'pu-add-sources-label' }, selectFileText));
  if (dragText) zone.append(createTag('span', { class: 'pu-dz-drag' }, dragText));

  // Click anywhere in the zone opens the picker. The `e.target === fileInput` guard stops the
  // input's own bubbled click from re-triggering (infinite-open loop).
  zone.addEventListener('click', (e) => { if (e.target === fileInput) return; fileInput.click(); });
  zone.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    fileInput.click();
  });

  const wrap = createTag('div', { class: 'shared-drop-zone-wrap pu-add-sources-wrap' });
  wrap.append(zone);
  return { wrap, dropZone: zone, fileInput };
}
