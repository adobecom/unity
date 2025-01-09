import { createTag, createIntersectionObserver } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
  }

  async initWidget() {
    this.widget = createTag('div', { class: 'express-unity-widget' });
    const con = createTag('div', {
      class: 'autocomplete',
      role: 'combobox',
      'aria-expanded': 'false',
      'aria-owns': 'dropdown',
      'aria-haspopup': 'listbox',
    });
    const inputCon = createTag('div', { class: 'input-wrapper' });
    const actionCon = createTag('div', { class: 'action-wrapper' });
    const inpText = createTag('input', {
      id: 'promptInput',
      class: 'input-class',
      type: 'text',
      placeholder: 'Describe your image...',
      'aria-autocomplete': 'list',
      'aria-controls': 'dropdown',
    });
    const surBtn = this.createActionBtn(
      this.el.querySelector('.icon-surpriseMe')?.closest('li'),
      'surprise-btn-class'
    );
    const genBtn = this.createActionBtn(
      this.el.querySelector('.icon-generate')?.closest('li'),
      'generate-btn-class'
    );
    const placeholder = Object.fromEntries(
      [...this.el.querySelectorAll('[class*="placeholder"]')].map((element) => [
        element.classList[1] || '',
        element.closest('li')?.innerText || '',
      ]).filter(([key]) => key),
    );
    this.workflowCfg.placeholder = placeholder;
    const dropCon = this.createDropdown();
    actionCon.append(surBtn, genBtn);
    inputCon.append(inpText, actionCon);
    con.append(inputCon, dropCon);
    this.widget.append(con);
    const interactiveArea = this.target.querySelector('div[data-valign="middle"].text');
    const Paragraphs = interactiveArea.querySelectorAll('p.body-m');
    interactiveArea.insertBefore(this.widget, Paragraphs[1]);
    this.initIntersectionObserver();
    return this.workflowCfg.targetCfg.actionMap;
  }

  initIntersectionObserver() {
    this.workflowCfg.stickyBehavior = true;
    const obEl = this.target.querySelector('#free-ai-image-generator');
    createIntersectionObserver({
      el: obEl,
      callback: (cfg) => this.addStickyBehaviour(cfg),
      cfg: this.workflowCfg,
    });
  }

  addStickyBehaviour(cfg) {
    const dropdown = this.widget.querySelector('.dropdown');
    if (cfg.isIntersecting) {
      this.widget.classList.remove('sticky');
      dropdown.classList.remove('open-upward');
    } else {
      this.widget.classList.add('sticky');
      dropdown.classList.add('open-upward');
    }
  }

  createDropdown() {
    const dropCon = createTag('ul', {
      class: 'dropdown hidden',
      role: 'listbox',
      'aria-label': 'promptInput',
    });
    const promptTitle = createTag('li', { class: 'dropdown-title', role: 'presentation' }, 'Prompt Suggestions');
    dropCon.append(promptTitle);
    const prompts = this.el.querySelectorAll('.icon-prompt');
    prompts.forEach((el, i) => {
      const prompt = createTag('li', { id: `item-${i}`, class: 'dropdown-item', role: 'option', 'daa-ll': `prompt ${el.closest('li').innerText}` }, el.closest('li').innerText);
      dropCon.append(prompt);
    });
    const separator = createTag('li', { class: 'dropdown-separator', role: 'separator' });
    dropCon.append(separator);

    const footer = createTag('li', { class: 'dropdown-footer' });
    const tipEl = this.el.querySelector('.icon-tip').closest('li');
    const tipCon = createTag('div', { class: 'tip-con' }, tipEl.innerText);
    const tipText = createTag('span', { class: 'tip-text' }, 'Tip: ');
    const legalEl = this.el.querySelector('.icon-legal').closest('li');
    const legalCon = createTag('div', { class: 'legal-con' });
    const legalText = createTag('a', { href: legalEl.querySelector('a').href, class: 'legal-text' }, legalEl.querySelector('a').innerText);
    tipCon.prepend(tipText);
    footer.append(tipCon);
    legalCon.append(legalText);
    footer.append(legalCon);
    dropCon.append(footer);
    return dropCon;
  }

  createActionBtn(btnCfg, btnClass) {
    if (!btnCfg) return null;
    const txt = btnCfg.innerText?.trim();
    const img = btnCfg.querySelector('img[src*=".svg"]');
    const actionBtn = createTag('a', { href: '#', class: `unity-action-btn ${btnClass}` });
    let swapOrder = false;
    if (img) {
      actionBtn.append(createTag('div', { class: 'btn-icon' }, img));
      if (img.nextSibling?.nodeName === '#text') swapOrder = true;
    }
    if (txt) {
      const btnTxt = createTag('div', { class: 'btn-text' }, txt.split('\n')[0]);
      swapOrder ? actionBtn.prepend(btnTxt) : actionBtn.append(btnTxt);
    }
    return actionBtn;
  }
}
