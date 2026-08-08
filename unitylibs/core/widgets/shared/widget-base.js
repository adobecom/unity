/*
 * Shared widget shell + authoring helpers.
 * Critical-path: needed to render the initial widget DOM, so it is safe to preload.
 * Extracted from prompt-bar-upload to remove cross-widget duplication (Option A / shared primitives).
 */
import { createTag } from '../../../scripts/utils.js';

export function svgIcon(href) {
  return `<svg><use xlink:href="${href}"></use></svg>`;
}

export function placeholderText(root, iconClass) {
  const icon = root.querySelector(`.${iconClass}`) || root.querySelector(`[class*="${iconClass}"]`);
  if (!icon) return '';
  return (icon.closest('li')?.innerText || '').replace(/\s+/g, ' ').trim();
}

export function labelForField(root, iconClass, fallback) {
  return placeholderText(root, iconClass) || fallback;
}

export function extractLegalFootFromAuthoring(root) {
  const marker = root.querySelector('[class*="icon-legal-terms"]');
  if (!marker) return null;
  const li = marker.closest('li');
  const foot = createTag('div', { class: 'shared-legal-foot' });
  if (li?.parentElement) {
    while (li.firstChild) foot.append(li.firstChild);
    li.remove();
    return foot;
  }
  foot.append(marker.cloneNode(true));
  marker.remove();
  return foot;
}

/*
 * Builds the standard `.ex-unity-wrap` shell: skin wrapper, sprite container,
 * moves the original authored content into a hidden config holder, then inserts
 * the wrap relative to the authored anchor (targetCfg.target / insert).
 * Returns the widgetWrap element.
 */
export function mountWidget({
  el, target, workflowCfg, spriteCon, main, rootClass, wrapClass,
}) {
  const skin = el.classList.contains('light') ? 'light' : 'dark';
  const interactiveShell = createTag('div', { class: `interactive-area ${skin}` });
  interactiveShell.append(main);

  const root = createTag('div', { class: `${rootClass} unity-enabled` });
  root.append(interactiveShell);

  const holder = createTag('div', { class: 'unity-shared-config-holder unity-slf-sr-only' });
  holder.setAttribute('aria-hidden', 'true');
  const legalFoot = extractLegalFootFromAuthoring(el);
  while (el.firstChild) holder.append(el.firstChild);
  el.append(holder);
  el.classList.add(`${rootClass}-host`);

  const unitySprite = createTag('div', { class: 'unity-sprite-container' });
  unitySprite.innerHTML = spriteCon || '';

  const widgetWrap = createTag('div', { class: `ex-unity-wrap verb-options ${wrapClass}` });
  widgetWrap.append(unitySprite, root);
  if (legalFoot) widgetWrap.append(legalFoot);

  const interactArea = target?.querySelector('.copy') || target;
  const { target: anchorSelector, insert } = workflowCfg.targetCfg || {};
  const anchor = anchorSelector ? interactArea?.querySelector(anchorSelector) : null;
  if (anchor && insert === 'before') anchor.before(widgetWrap);
  else if (anchor) anchor.after(widgetWrap);
  else interactArea?.appendChild(widgetWrap);

  return widgetWrap;
}
