/* eslint-disable class-methods-use-this */

/**
 * Parses Unity block authoring for prompt + style selection (Unity block with .widget-prompt-with-style).
 * Row 0 is config (verbs, placeholders, etc.). The style strip is the first following row that contains a `<ul>`.
 * Each `<li>` in that list is a style variant. The next N top-level rows (N = number of `<li>`) are preview rows:
 * each row has three column `<div>`s (mobile / tablet / desktop) with a `<picture>` each.
 */

import UnityWidget from '../../workflow/workflow-firefly/widget.js';
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
 * @param {HTMLElement} root — Unity block root (Franklin often wraps rows in a div)
 * @returns {{ styles: Array<{ picture: HTMLPictureElement, label: string, prompt: string }>, previewRows: Array<Array<HTMLPictureElement | null>> }}
 */
export function parsePromptWithStyleSelectAuthoring(root) {
  let topDivs = [...root.children].filter((n) => n.nodeName === 'DIV');
  if (topDivs.length === 1) {
    const inner = topDivs[0];
    topDivs = [...inner.children].filter((n) => n.nodeName === 'DIV');
  }
  if (topDivs.length < 2) return { styles: [], previewRows: [] };

  /* 1. Skip row 0 (config). First later row that contains a <ul> is the style strip. */
  let styleStripRowIndex = -1;
  let ul = /** @type {HTMLUListElement | null} */ (null);
  for (let i = 1; i < topDivs.length; i += 1) {
    const found = topDivs[i].querySelector('ul');
    if (found) {
      ul = /** @type {HTMLUListElement} */ (found);
      styleStripRowIndex = i;
      break;
    }
  }
  if (!ul || styleStripRowIndex < 0) return { styles: [], previewRows: [] };

  /* 2. Each top-level <li> in that <ul> → one style entry. */
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

  if (!styles.length) return { styles: [], previewRows: [] };

  /* 3. Next N top-level rows (N = styles.length): each is one preview row (3 column divs × picture). */
  const afterStyleStrip = topDivs.slice(styleStripRowIndex + 1);
  const previewRows = [];
  for (let k = 0; k < styles.length; k += 1) {
    const row = afterStyleStrip[k];
    if (!row) {
      previewRows.push([]);
    } else {
      const cols = [...row.querySelectorAll(':scope > div')];
      const pics = cols.map((col) => col.querySelector('picture'));
      const valid = pics.length === 3 && pics.every(Boolean);
      previewRows.push(valid ? pics : []);
    }
  }

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

  /* modelDropdown() / verbDropdown() require .icon-placeholder-input on el (reads parentElement.textContent). */
  const phStub = createTag('div', { hidden: true, 'aria-hidden': 'true' });
  phStub.innerHTML = '<ul><li><span class="icon icon-placeholder-input"></span> </li></ul>';
  el.append(phStub);

  widgetInstance.hasModelOptions = !!el.querySelector('[class*="icon-model"]');
  if (widgetInstance.hasModelOptions) await widgetInstance.getModel();

  const verbParts = widgetInstance.verbDropdown();
  const modelParts = widgetInstance.modelDropdown();

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
  inpField.addEventListener('focus', () => widgetInstance.hidePromptDropdown());

  const actionContainer = createTag('div', { class: 'action-container' });
  if (verbParts.length > 1) {
    const verbBtn = createTag('div', { class: 'verbs-container', 'aria-label': 'Media options' });
    verbBtn.append(...verbParts);
    actionContainer.append(verbBtn);
  }
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
    const verbTag = widgetInstance.selectedVerbType || 'image';
    genBtn = createTag('a', {
      href: '#',
      class: 'unity-act-btn gen-btn unity-slf-gen-btn',
      'daa-ll': `Generate--${verbTag}`,
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

  /* action-container: verb + model pickers only; act-wrap (Generate) is a sibling — parallel row in CSS grid */
  inpWrap.append(promptLabel, inpField, actionContainer, actWrap);

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
 * Firefly Unity block + `promptWithStyleSelect`: parse authoring and mount prompt-with-style-select UI
 * (symmetric to {@link PromptWidget} for the hero marquee).
 */
export class PromptWithStyleSelectWidget extends UnityWidget {
  constructor(...args) {
    super(...args);
    /** @type {HTMLElement | null} Set when UI mounts as a sibling of the Unity block */
    this.promptWithStyleSelectRoot = null;
  }

  /**
   * @returns {Promise<object>} `targetCfg.actionMap` for ActionBinder
   */
  async initWidget() {
    const parsed = parsePromptWithStyleSelectAuthoring(this.el);
    if (!parsed.styles.length) return this.workflowCfg.targetCfg.actionMap;
    await mountPromptWithStyleSelectUI(this, parsed);
    return this.workflowCfg.targetCfg.actionMap;
  }
}
