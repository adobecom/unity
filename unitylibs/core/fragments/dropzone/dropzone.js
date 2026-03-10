import { createTag, getUnityLibs, priorityLoad } from '../../../scripts/utils.js';

const DEFAULT_DROPZONE_ICON = '/cc-shared/assets/svg/s2-icon-upload-20-n.svg';
const VIEWPORTS = ['mobile-up', 'tablet-up', 'desktop-up'];
const ANALYTICS_KEY = 'Upload asset CTA|UnityWidget';

let columnCounter = 0;

function nextColumnId() {
  columnCounter += 1;
  return columnCounter;
}

function buildScopedId(prefix, id) {
  return `${prefix}-${id}`;
}

function applyViewportClasses(row) {
  if (row.childElementCount === 2 || row.childElementCount === 3) {
    [...row.children].forEach((child, index) => {
      child.classList.add(VIEWPORTS[index]);
      if (row.childElementCount === 2 && index === 1) {
        child.classList.add('tablet-up', 'desktop-up');
      }
    });
  } else if (row.childElementCount === 1) {
    row.firstElementChild?.classList.add(...VIEWPORTS);
  }
}

function extractContentParts(column) {
  const media = column.querySelector('picture, .video-container.video-holder');
  const terms = column.querySelector('p:last-child');
  const mediaPara = media?.closest('p');

  const hasUploadMarker = (para) => para.querySelector(
    'span[class*=icon-share], span[class*=icon-upload], img[src$=".svg"]:not(.video-container img)',
  );

  const candidateParagraphs = [
    ...column.querySelectorAll('p:not(:last-child)'),
  ].filter(
    (para) => para.textContent.trim() !== '' || para.querySelector('img, svg'),
  );

  const uploadPara = candidateParagraphs.find((para) => hasUploadMarker(para));

  const contentParagraphs = candidateParagraphs.filter((para) => {
    const isMediaOnlyPara = para === mediaPara
      && !hasUploadMarker(para)
      && para.textContent.trim() === '';
    return !isMediaOnlyPara;
  });

  const textParas = contentParagraphs.filter((para) => para !== uploadPara);

  return {
    terms,
    contentParagraphs,
    uploadPara,
    headingPara: textParas[0],
    bodyPara: textParas[1],
  };
}

function buildDropZoneIcon() {
  const iconPara = createTag('p', { class: 'drop-zone-default-icon' });
  const image = createTag('img', { src: DEFAULT_DROPZONE_ICON, alt: '' });
  iconPara.setAttribute('aria-hidden', 'true');
  iconPara.append(image);
  return iconPara;
}

function assignTextIds(headingPara, bodyPara, columnId) {
  const describedByIds = [];
  if (headingPara) {
    headingPara.classList.add('drop-zone-heading');
    headingPara.id = buildScopedId('drop-zone-heading', columnId);
    describedByIds.push(headingPara.id);
  }
  if (bodyPara) {
    bodyPara.classList.add('drop-zone-body');
    bodyPara.id = buildScopedId('drop-zone-body', columnId);
    describedByIds.push(bodyPara.id);
  }
  return describedByIds;
}

function makeDecorativeMediaNonFocusable(container) {
  container.querySelectorAll('picture, picture img').forEach((el) => {
    el.setAttribute('tabindex', '-1');
    el.setAttribute('role', 'presentation');
  });
}

function buildUploadButton(para) {
  const buttonLabel = para.textContent.trim().split('|')[0].trim() || 'Upload your image';
  const button = createTag(
    'span',
    {
      class: 'con-button blue action-button button-xl no-track',
      'daa-ll': ANALYTICS_KEY,
      'aria-hidden': 'true',
    },
    para.innerHTML,
  );
  makeDecorativeMediaNonFocusable(button);
  const input = createTag('input', {
    type: 'file',
    name: 'file-upload',
    id: 'file-upload',
    class: 'file-upload hide',
    accept: 'image/*',
    'aria-label': `${buttonLabel} file picker`,
  });

  para.classList.add('upload-action-container');
  para.textContent = '';
  para.append(button, input);
  return input;
}

function wireAccessibility(dropZone, fileInput, describedByIds) {
  const ariaLabel = 'Upload your asset. Or drag and drop here.';
  dropZone.setAttribute('role', 'button');
  dropZone.setAttribute('tabindex', '0');
  dropZone.setAttribute('aria-label', ariaLabel);

  if (fileInput?.id) {
    dropZone.setAttribute('aria-controls', fileInput.id);
  }
  if (describedByIds.length) {
    dropZone.setAttribute('aria-describedby', describedByIds.join(' '));
  }

  dropZone.addEventListener('click', (event) => {
    event.stopPropagation();
    fileInput?.click();
  });

  dropZone.addEventListener('keydown', (event) => {
    if (event.target !== dropZone) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput?.click();
    }
  });
}

function buildSingleDropZone(parts, columnId) {
  const dropZone = createTag('div', { class: 'drop-zone' });
  const fileInput = buildUploadButton(parts.uploadPara);
  const describedByIds = assignTextIds(parts.headingPara, parts.bodyPara, columnId);
  wireAccessibility(dropZone, fileInput, describedByIds);
  dropZone.append(buildDropZoneIcon(), ...parts.contentParagraphs);

  const container = createTag('div', { class: 'drop-zone-container' });
  container.append(dropZone);
  if (parts.terms) container.append(parts.terms);
  return container;
}

function setupDragAndDrop(layout, slot) {
  let activeDropZone;

  const setActiveDropZone = () => {
    const dropZones = [...slot.querySelectorAll('.drop-zone-container > .drop-zone')];
    const nextDropZone = dropZones.find((zone) => zone.offsetParent !== null) || dropZones[0];
    if (activeDropZone && activeDropZone !== nextDropZone) {
      activeDropZone.classList.remove('active');
    }
    activeDropZone = nextDropZone;
    activeDropZone?.classList.add('active');
  };

  const clearActiveDropZone = () => {
    activeDropZone?.classList.remove('active');
    activeDropZone = null;
  };

  layout.addEventListener('dragenter', (event) => {
    event.preventDefault();
    setActiveDropZone();
  });

  layout.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setActiveDropZone();
  });

  layout.addEventListener('dragleave', (event) => {
    event.preventDefault();
    clearActiveDropZone();
  });

  document.addEventListener('dragend', () => clearActiveDropZone());

  layout.addEventListener('drop', (event) => {
    event.preventDefault();
    setActiveDropZone();
    const fileInput = activeDropZone?.querySelector('.file-upload');
    const files = event.dataTransfer?.files;
    if (files?.length && fileInput) {
      try {
        fileInput.files = files;
      } catch { /* some browsers may not allow assigning FileList directly */ }
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    clearActiveDropZone();
  });

  slot.querySelectorAll('.drop-zone').forEach((zone) => {
    zone.addEventListener('drop', () => clearActiveDropZone());
  });

  window.addEventListener('drop', () => clearActiveDropZone());
  window.addEventListener('dragend', () => clearActiveDropZone());
}

export default class DropzoneFragment {
  constructor(slot, contentRow, workflowCfg) {
    this.slot = slot;
    this.contentRow = contentRow;
    this.workflowCfg = workflowCfg;
  }

  async render() {
    await priorityLoad([
      `${getUnityLibs()}/core/fragments/dropzone/dropzone.css`,
    ]);

    applyViewportClasses(this.contentRow);

    [...this.contentRow.children].forEach((column) => {
      const parts = extractContentParts(column);
      if (!parts.uploadPara) return;

      const columnId = nextColumnId();
      const viewportClasses = [...column.classList].filter(
        (cls) => VIEWPORTS.includes(cls),
      );
      const container = buildSingleDropZone(parts, columnId);
      container.classList.add(...viewportClasses);
      this.slot.append(container);
    });

    const layout = this.slot.closest('.upload-marquee-layout');
    if (layout) setupDragAndDrop(layout, this.slot);

    return {
      '.drop-zone': 'upload',
      '#file-upload': 'upload',
    };
  }
}
