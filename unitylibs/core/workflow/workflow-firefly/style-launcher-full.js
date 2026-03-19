/**
 * Parses Unity block authoring for the full style launcher (hero-marquee + unity-style-launcher).
 * First top-level div: ul > li (thumbnail picture + label + default prompt after <br>).
 * Next div rows: each row has 3 column divs (mobile / tablet / desktop preview pictures).
 */

import {
  createTag,
  defineDeviceByScreenSize,
  getUnityLibs,
  loadStyle,
} from '../../../scripts/utils.js';

const VIEWPORT_COL = { MOBILE: 0, TABLET: 1, DESKTOP: 2 };

/**
 * @param {HTMLElement} li
 * @returns {{ picture: HTMLPictureElement, label: string, prompt: string } | null}
 */
export function parseStyleLi(li) {
  const picture = li.querySelector('picture');
  if (!picture) return null;
  const clone = li.cloneNode(true);
  clone.querySelector('picture')?.remove();
  const parts = clone.innerHTML
    .split(/<br\s*\/?>/i)
    .map((p) => {
      const t = document.createElement('span');
      t.innerHTML = p;
      return t.textContent.trim();
    })
    .filter(Boolean);
  return {
    picture: /** @type {HTMLPictureElement} */ (picture.cloneNode(true)),
    label: parts[0] || '',
    prompt: parts.slice(1).join(' ').trim(),
  };
}

/**
 * @param {HTMLElement} root — Unity block root (Franklin often wraps rows in a div)
 * @returns {{ styles: Array<{ picture: HTMLPictureElement, label: string, prompt: string }>, previewRows: Array<Array<HTMLPictureElement | null>> }}
 */
export function parseStyleLauncherAuthoring(root) {
  /* Prefer direct child divs (styles wrapper + preview rows as siblings). Fallback to single wrapper. */
  let topDivs = [...root.children].filter((n) => n.nodeName === 'DIV');
  if (topDivs.length === 1) {
    const inner = topDivs[0];
    topDivs = [...inner.children].filter((n) => n.nodeName === 'DIV');
  }
  if (!topDivs.length) return { styles: [], previewRows: [] };

  const stylesWrap = topDivs[0];
  const ul = stylesWrap.querySelector('ul');
  const styles = [];
  if (ul) {
    [...ul.querySelectorAll(':scope > li')].forEach((li) => {
      const result = parseStyleLi(li);
      if (result) {
        styles.push(result);
      } else if (styles.length && !styles[styles.length - 1].prompt) {
        styles[styles.length - 1].prompt = li.textContent.trim();
      }
    });
  }

  const previewRows = topDivs.slice(1).map((row) => {
    const cols = [...row.querySelectorAll(':scope > div')];
    return cols.map((col) => col.querySelector('picture'));
  });

  return { styles, previewRows };
}

function previewForViewport(previewRow, colIndex) {
  if (!previewRow || !previewRow.length) return null;
  const pic = previewRow[colIndex] || previewRow[0];
  return pic ? /** @type {HTMLPictureElement} */ (pic.cloneNode(true)) : null;
}

function currentPreviewColumn() {
  const v = defineDeviceByScreenSize();
  return VIEWPORT_COL[v] ?? 2;
}

/**
 * @param {*} widgetInstance — UnityWidget instance (workflow-firefly/widget.js)
 * @param {{ styles: Array<{ picture: HTMLPictureElement, label: string, prompt: string }>, previewRows: Array<Array<HTMLPictureElement | null>> }} parsed
 */
export async function mountStyleLauncherFullUI(widgetInstance, parsed) {
  const { styles, previewRows } = parsed;
  if (!styles.length) return;

  const unityLibs = getUnityLibs();
  await new Promise((resolve) => {
    loadStyle(`${unityLibs}/core/workflow/workflow-firefly/style-launcher-full.css`, resolve);
  });

  const el = widgetInstance.el;
  const [widgetWrap, widget, unitySprite] = ['ex-unity-wrap', 'ex-unity-widget', 'unity-sprite-container']
    .map((c) => createTag('div', { class: c }));
  widgetInstance.widgetWrap = widgetWrap;
  widgetInstance.widget = widget;
  unitySprite.innerHTML = widgetInstance.spriteCon;
  unitySprite.classList.add('unity-slf-sprite');
  widgetWrap.append(unitySprite);

  widgetInstance.selectedVerbType = 'image';
  widgetInstance.selectedVerbText = 'Image';
  widgetWrap.setAttribute('data-selected-verb', 'image');

  const phStub = createTag('div', { hidden: true, 'aria-hidden': 'true' });
  phStub.innerHTML = '<ul><li><span class="icon-placeholder-input"></span> </li></ul>';
  el.append(phStub);

  widgetInstance.hasModelOptions = true;
  await widgetInstance.getModel();

  const inpWrap = createTag('div', { class: 'inp-wrap' });
  const promptLabel = createTag('label', { for: 'promptInput', class: 'inp-field-label unity-slf-prompt-label' }, 'Prompt');
  const inpField = createTag('textarea', {
    id: 'promptInput',
    class: 'inp-field',
    'aria-autocomplete': 'list',
    'aria-haspopup': 'listbox',
    rows: '4',
  });
  inpField.value = styles[0].prompt;

  const actionContainer = createTag('div', { class: 'action-container' });
  const modelParts = widgetInstance.modelDropdown();
  if (modelParts.length > 1) {
    const modelBtn = createTag('div', { class: 'models-container', 'aria-label': 'Model options' });
    modelBtn.append(...modelParts);
    actionContainer.append(modelBtn);
  } else {
    widgetWrap.setAttribute('data-selected-model-id', 'adobe-firefly');
    widgetWrap.setAttribute('data-selected-model-version', 'image3');
  }

  const actWrap = createTag('div', { class: 'act-wrap' });
  const genBtn = createTag('a', {
    href: '#',
    class: 'unity-act-btn gen-btn unity-slf-gen-btn',
    'daa-ll': 'Generate--image',
    'aria-label': 'Generate',
  });
  genBtn.append(createTag('div', { class: 'btn-txt' }, 'Generate'));
  widgetInstance.genBtn = genBtn;
  actWrap.append(genBtn);
  inpWrap.append(promptLabel, inpField, actionContainer, actWrap);

  const comboboxContainer = createTag('div', { class: 'autocomplete' });
  comboboxContainer.append(inpWrap);
  widget.append(comboboxContainer);
  widgetWrap.append(widget);

  const stylesHeading = createTag('h4', { class: 'unity-slf-styles-heading' }, 'Choose a style');
  const styleList = createTag('ul', { class: 'unity-slf-style-list', role: 'listbox', 'aria-label': 'Style variants' });
  let currentStyleIdx = 0;
  let userEdited = false;

  const styleItems = styles.map((style, i) => {
    const li = createTag('li', {
      class: `unity-slf-style-item${i === 0 ? ' selected' : ''}`,
      role: 'option',
      tabindex: '0',
      'aria-selected': i === 0 ? 'true' : 'false',
    });
    li.append(style.picture.cloneNode(true));
    li.append(createTag('span', { class: 'unity-slf-style-label' }, style.label));
    return li;
  });
  styleItems.forEach((item) => styleList.append(item));

  const previewArea = createTag('div', { class: 'unity-slf-preview' });
  const col = currentPreviewColumn();
  const firstPreview = previewForViewport(previewRows[0], col);
  if (firstPreview) previewArea.append(firstPreview);

  function selectStyle(idx) {
    currentStyleIdx = idx;
    styleItems.forEach((item, i) => {
      item.classList.toggle('selected', i === idx);
      item.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    if (!userEdited) inpField.value = styles[idx].prompt;
    previewArea.textContent = '';
    const pic = previewForViewport(previewRows[idx], currentPreviewColumn());
    if (pic) previewArea.append(pic);
  }

  styleItems.forEach((item, i) => {
    item.addEventListener('click', () => selectStyle(i));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectStyle(i);
      }
    });
  });

  inpField.addEventListener('input', () => {
    userEdited = true;
  });

  const onResize = () => {
    previewArea.textContent = '';
    const pic = previewForViewport(previewRows[currentStyleIdx], currentPreviewColumn());
    if (pic) previewArea.append(pic);
  };
  window.addEventListener('resize', onResize);

  const left = createTag('div', { class: 'unity-slf-left' });
  left.append(widgetWrap, stylesHeading, styleList);

  const right = createTag('div', { class: 'unity-slf-right' });
  right.append(previewArea);

  const main = createTag('div', { class: 'unity-slf-main' });
  main.append(left, right);

  const root = createTag('div', { class: 'unity-style-launcher-full' });
  root.append(main);

  el.textContent = '';
  el.append(root);
}
