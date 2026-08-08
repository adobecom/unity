/*
 * Shared dropzone primitive (drop-zone + hidden file input + preview/delete).
 * Critical-path: renders on initial load, safe to preload.
 * Emits/consumes the binder DOM contract: `.drop-zone`, `#file-upload`,
 * `pbu-image-selected` (in), `pbu-delete-image` (out).
 */
import { createTag, getUnityLibs } from '../../../scripts/utils.js';
import { svgIcon } from './widget-base.js';

/*
 * @param {object} opts
 * @param {string[]} opts.allowedFileTypes - MIME types for the `accept` attribute.
 * @param {boolean} [opts.multiple] - allow selecting multiple files.
 * @param {string} [opts.uploadLabel] - a11y label for the dropzone.
 * @returns refs { wrap, dropZone, fileInput, preview, previewImg, deleteBtn }
 */
export function buildDropzone({ allowedFileTypes = [], multiple = false, uploadLabel = 'Upload files' }) {
  const fileInputAttrs = {
    type: 'file',
    id: 'file-upload',
    accept: allowedFileTypes.join(','),
    hidden: '',
    'aria-hidden': 'true',
  };
  if (multiple) fileInputAttrs.multiple = '';
  const fileInput = createTag('input', fileInputAttrs);

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
  dropZone.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    fileInput.click();
  });

  const previewImg = createTag('img', { class: 'shared-preview-img', alt: 'Selected file preview' });
  const deleteBtn = createTag('button', { type: 'button', class: 'shared-delete-btn', 'aria-label': 'Remove file' });
  deleteBtn.innerHTML = svgIcon('#unity-trash-icon');
  const uploadSpinner = createTag('div', { class: 'shared-spinner hidden', 'aria-label': 'Uploading', role: 'status' });
  const preview = createTag('div', { class: 'shared-preview hidden', 'aria-hidden': 'true' });
  preview.append(previewImg, deleteBtn, uploadSpinner);

  const wrap = createTag('div', { class: 'shared-drop-zone-wrap' });
  wrap.append(dropZone, preview);
  return { wrap, dropZone, fileInput, preview, previewImg, deleteBtn };
}

/*
 * Wires the preview swap for the `select-file` flow (single-file preview).
 * No-op visually for the immediate `upload` flow, where the transition screen takes over.
 */
export function wirePreview(widgetWrap, { dropZone, preview, previewImg, deleteBtn }) {
  const showPreview = (file) => {
    if (!file || !file.type?.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    previewImg.onload = () => URL.revokeObjectURL(url);
    dropZone.classList.add('hidden');
    dropZone.setAttribute('aria-hidden', 'true');
    preview.classList.remove('hidden');
    preview.removeAttribute('aria-hidden');
  };
  const showDropZone = () => {
    dropZone.classList.remove('hidden');
    dropZone.removeAttribute('aria-hidden');
    preview.classList.add('hidden');
    preview.setAttribute('aria-hidden', 'true');
    previewImg.src = '';
  };
  widgetWrap?.addEventListener('pbu-image-selected', (e) => showPreview(e.detail?.file));
  deleteBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    showDropZone();
    widgetWrap?.dispatchEvent(new CustomEvent('pbu-delete-image'));
  });
}
