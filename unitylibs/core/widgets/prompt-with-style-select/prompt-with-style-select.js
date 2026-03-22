/**
 * Parses Unity block authoring for prompt + style selection (Unity block with .widget-prompt-with-style).
 * The style table is the first ul whose lis contain a thumbnail <picture> (verb/config ul comes first and is skipped).
 * Following sibling div rows: each has 3 column divs (mobile / tablet / desktop preview pictures).
 * Rows like cgen (no 3 pictures) are skipped.
 */

import {
  createTag,
  defineDeviceByScreenSize,
  getUnityLibs,
  loadStyle,
} from '../../../scripts/utils.js';

const VIEWPORT_COL = { MOBILE: 0, TABLET: 1, DESKTOP: 2 };

/**
 * Text from the li that contains the given icon class (e.g. icon-placeholder-prompt, icon-placeholder-style).
 * Rendered as-authored; only normalizes whitespace.
 *
 * @param {HTMLElement} root
 * @param {string} iconClass
 * @returns {string}
 */
function placeholderRowText(root, iconClass) {
  const icon = root.querySelector(`.${iconClass}`)
    || root.querySelector(`[class*="${iconClass}"]`);
  if (!icon) return '';
  return (icon.closest('li')?.innerText || '').replace(/\s+/g, ' ').trim();
}

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
 * True when `li` belongs to `ul` without crossing a nested list (Franklin may wrap `li` in div/p).
 *
 * @param {HTMLUListElement} ul
 * @param {HTMLLIElement} li
 * @returns {boolean}
 */
function isDirectLiOfUl(ul, li) {
  let p = li.parentElement;
  while (p) {
    if (p === ul) return true;
    if (p.tagName === 'UL' || p.tagName === 'OL') return false;
    p = p.parentElement;
  }
  return false;
}

/**
 * All `li` nodes authored under this list (not inside a nested ul).
 *
 * @param {HTMLUListElement} ul
 * @returns {HTMLLIElement[]}
 */
function topLevelLisInUl(ul) {
  return [...ul.querySelectorAll('li')].filter((li) => isDirectLiOfUl(ul, li));
}

/**
 * Picks the `ul` with the most thumbnail rows — avoids matching a stray 1-item list before the real style grid.
 *
 * @param {HTMLElement} div
 * @returns {HTMLUListElement | null}
 */
function findStyleVariantUl(div) {
  const uls = [...div.querySelectorAll('ul')];
  let best = null;
  let bestScore = 0;
  uls.forEach((u) => {
    const lis = topLevelLisInUl(u);
    const score = lis.filter((li) => li.querySelector('picture')).length;
    if (score > bestScore) {
      bestScore = score;
      best = u;
    }
  });
  return bestScore > 0 ? best : null;
}

/**
 * @param {HTMLElement} root — Unity block root (Franklin often wraps rows in a div)
 * @returns {{ styles: Array<{ picture: HTMLPictureElement, label: string, prompt: string }>, previewRows: Array<Array<HTMLPictureElement | null>> }}
 */
export function parsePromptWithStyleSelectAuthoring(root) {
  /* Prefer direct child divs (config rows + style table + preview rows). Fallback to single wrapper. */
  let topDivs = [...root.children].filter((n) => n.nodeName === 'DIV');
  if (topDivs.length === 1) {
    const inner = topDivs[0];
    topDivs = [...inner.children].filter((n) => n.nodeName === 'DIV');
  }
  if (!topDivs.length) return { styles: [], previewRows: [] };

  /* Prefer the div whose list has the most thumbnail rows (not the first div that merely contains *some* list). */
  let stylesWrap = null;
  let ul = /** @type {HTMLUListElement | null} */ (null);
  let bestListScore = 0;
  topDivs.forEach((div) => {
    const candidateUl = findStyleVariantUl(div);
    if (!candidateUl) return;
    const score = topLevelLisInUl(candidateUl).filter((li) => li.querySelector('picture')).length;
    if (score > bestListScore) {
      bestListScore = score;
      ul = candidateUl;
      stylesWrap = div;
    }
  });
  if (!ul || !stylesWrap) return { styles: [], previewRows: [] };

  const styles = [];
  const listItems = topLevelLisInUl(ul);
  listItems.forEach((li) => {
    const result = parseStyleLi(li);
    if (result) {
      styles.push(result);
    } else if (styles.length && !styles[styles.length - 1].prompt) {
      styles[styles.length - 1].prompt = li.textContent.trim();
    }
  });

  const startIdx = topDivs.indexOf(stylesWrap);
  const previewRows = topDivs.slice(startIdx + 1)
    .map((row) => {
      const cols = [...row.querySelectorAll(':scope > div')];
      return cols.map((col) => col.querySelector('picture'));
    })
    .filter((pics) => pics.length === 3 && pics.every(Boolean));

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
export async function mountPromptWithStyleSelectUI(widgetInstance, parsed) {
  const { styles, previewRows } = parsed;
  if (!styles.length) return;

  const unityLibs = getUnityLibs();
  /* Prompt + style-select sheet (card + `.unity-prompt-with-style-select` overrides). Shared primitives come from workflow priorityLoad of `workflow-firefly/widget.css`. */
  await new Promise((resolve) => {
    loadStyle(`${unityLibs}/core/widgets/prompt-with-style-select/prompt-with-style-select.css`, resolve);
  });

  const { el } = widgetInstance;
  /* verb-options: widget.css only gives models-container / action-container flex layout with this class */
  const widgetWrap = createTag('div', { class: 'ex-unity-wrap verb-options' });
  const [widget, unitySprite] = ['ex-unity-widget', 'unity-sprite-container']
    .map((c) => createTag('div', { class: c }));
  widgetInstance.widgetWrap = widgetWrap;
  widgetInstance.widget = widget;
  unitySprite.innerHTML = widgetInstance.spriteCon;
  unitySprite.classList.add('unity-slf-sprite');
  widgetWrap.append(unitySprite);

  widgetInstance.selectedVerbType = 'image';
  widgetInstance.selectedVerbText = 'Image';
  widgetWrap.setAttribute('data-selected-verb', 'image');

  /* modelDropdown() in widget.js requires .icon-placeholder-input in el (reads parentElement.textContent). */
  const phStub = createTag('div', { hidden: true, 'aria-hidden': 'true' });
  phStub.innerHTML = '<ul><li><span class="icon icon-placeholder-input"></span> </li></ul>';
  el.append(phStub);

  widgetInstance.hasModelOptions = true;
  await widgetInstance.getModel();

  const promptLabelText = placeholderRowText(el, 'icon-placeholder-prompt');
  const styleSectionHeadingText = placeholderRowText(el, 'icon-placeholder-style');

  const inpWrap = createTag('div', { class: 'inp-wrap' });
  const labelText = promptLabelText || 'Prompt';
  const promptLabel = createTag('label', { for: 'promptInput', class: 'inp-field-label unity-slf-prompt-label' }, labelText);
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
  const generateLi = el.querySelector('.icon-generate')?.closest('li');
  let genBtn = widgetInstance.createActBtn(generateLi, 'gen-btn unity-slf-gen-btn');
  if (!genBtn) {
    genBtn = createTag('a', {
      href: '#',
      class: 'unity-act-btn gen-btn unity-slf-gen-btn',
      'daa-ll': 'Generate--image',
      'aria-label': 'Generate',
    });
    genBtn.append(createTag('div', { class: 'btn-txt' }, 'Generate'));
    widgetInstance.genBtn = genBtn;
  } else if (!genBtn.querySelector('.btn-ico') && generateLi) {
    const svgLink = generateLi.querySelector('a[href$=".svg"]');
    if (svgLink?.href) {
      const img = createTag('img', { src: svgLink.href, alt: 'Generate' });
      genBtn.prepend(createTag('div', { class: 'btn-ico' }, img));
    }
  }
  actWrap.append(genBtn);
  actionContainer.append(actWrap);

  inpWrap.append(promptLabel, inpField, actionContainer);

  const comboboxContainer = createTag('div', { class: 'autocomplete' });
  comboboxContainer.append(inpWrap);
  widget.append(comboboxContainer);
  widgetWrap.append(widget);

  /* Style container: wraps heading + list */
  const styleContainer = createTag('div', { class: 'unity-slf-style-container' });
  const stylesHeading = createTag(
    'h4',
    { class: 'unity-slf-styles-heading' },
    styleSectionHeadingText || 'Choose a style',
  );
  const styleList = createTag('ul', { class: 'unity-slf-style-list', role: 'listbox', 'aria-label': 'Style variants' });
  let currentStyleIdx = 0;

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

  function setPreviewPicture(pic) {
    if (pic) previewArea.replaceChildren(pic);
  }

  setPreviewPicture(previewForViewport(previewRows[0], currentPreviewColumn()));

  const EMPTY_PROMPT_RESTORE_MS = 5000;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let emptyPromptRestoreTimerId = null;

  function isPromptVisuallyEmpty() {
    return inpField.value.trim() === '';
  }

  function clearEmptyPromptRestoreTimer() {
    if (emptyPromptRestoreTimerId != null) {
      clearTimeout(emptyPromptRestoreTimerId);
      emptyPromptRestoreTimerId = null;
    }
  }

  /** After 5s with an empty field, restore the default prompt for the currently selected style. */
  function scheduleEmptyPromptRestoreIfStillEmpty() {
    clearEmptyPromptRestoreTimer();
    emptyPromptRestoreTimerId = setTimeout(() => {
      emptyPromptRestoreTimerId = null;
      if (!isPromptVisuallyEmpty()) return;
      inpField.value = styles[currentStyleIdx]?.prompt ?? '';
    }, EMPTY_PROMPT_RESTORE_MS);
  }

  /**
   * When the prompt still matches the previously selected style’s default, a new style applies its default prompt.
   * If the user changed the text away from that default, switching style leaves the prompt unchanged.
   */
  function selectStyle(idx) {
    clearEmptyPromptRestoreTimer();
    const prevIdx = currentStyleIdx;
    const prevDefault = styles[prevIdx]?.prompt ?? '';
    const stillSyncedWithPreviousStyle = inpField.value === prevDefault;
    currentStyleIdx = idx;
    styleItems.forEach((item, i) => {
      item.classList.toggle('selected', i === idx);
      item.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    if (stillSyncedWithPreviousStyle) {
      inpField.value = styles[idx].prompt;
    }
    setPreviewPicture(previewForViewport(previewRows[idx], currentPreviewColumn()));
    if (isPromptVisuallyEmpty()) {
      scheduleEmptyPromptRestoreIfStillEmpty();
    }
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
    clearEmptyPromptRestoreTimer();
    if (isPromptVisuallyEmpty()) {
      scheduleEmptyPromptRestoreIfStillEmpty();
    }
  });

  let lastPreviewCol = currentPreviewColumn();
  const onResize = () => {
    const col = currentPreviewColumn();
    if (col === lastPreviewCol) return;
    lastPreviewCol = col;
    setPreviewPicture(previewForViewport(previewRows[currentStyleIdx], col));
  };
  window.addEventListener('resize', onResize);

  /* Parent container for prompt bar + style section */
  const controlsContainer = createTag('div', { class: 'unity-slf-controls' });
  styleContainer.append(stylesHeading, styleList);
  controlsContainer.append(widgetWrap, styleContainer);

  const left = createTag('div', { class: 'unity-slf-left' });
  left.append(controlsContainer);

  const right = createTag('div', { class: 'unity-slf-right' });
  right.append(previewArea);

  const main = createTag('div', { class: 'unity-slf-main' });
  main.append(left, right);

  /*
   * Firefly widget.css only applies under `.unity-enabled .interactive-area .ex-unity-wrap …`.
   * This root is a sibling of the hero, so we recreate that wrapper chain for widget.css selectors.
   */
  const skin = el.classList.contains('light') ? 'light' : 'dark';
  const interactiveShell = createTag('div', { class: `interactive-area ${skin}` });
  const root = createTag('div', { class: 'unity-prompt-with-style-select unity-enabled' });
  interactiveShell.append(main);
  root.append(interactiveShell);

  /* Keep authored Unity markup (cgen, error icons, model hints) inside the Unity block for query APIs; hide visually. */
  const holder = createTag('div', { class: 'unity-slf-config-holder unity-slf-sr-only' });
  holder.setAttribute('aria-hidden', 'true');
  while (el.firstChild) {
    holder.append(el.firstChild);
  }
  el.append(holder);
  el.classList.add('unity-prompt-with-style-host');

  /* Render between hero-marquee and the Unity block (sibling order: … hero, prompt-with-style-select, unity …). */
  if (el.parentNode) {
    el.parentNode.insertBefore(root, el);
  } else {
    el.append(root);
  }

  widgetInstance.promptWithStyleSelectRoot = root;
}

/**
 * Entry point for UnityWidget.initWidget when `targetCfg.mountInUnityBlock` is true.
 * Parses the Unity block and mounts the prompt-with-style-select UI beside the block.
 *
 * @param {*} widgetInstance — UnityWidget (workflow-firefly/widget.js)
 * @returns {Promise<object>} `targetCfg.actionMap` for ActionBinder
 */
export async function initPromptWithStyleSelectWidget(widgetInstance) {
  const parsed = parsePromptWithStyleSelectAuthoring(widgetInstance.el);
  if (!parsed.styles.length) return widgetInstance.workflowCfg.targetCfg.actionMap;
  await mountPromptWithStyleSelectUI(widgetInstance, parsed);
  return widgetInstance.workflowCfg.targetCfg.actionMap;
}
