import { createTag } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
  }

  async initWidget() {
    this.widget = createTag('div', { class: 'unity-widget' });
    const con = createTag('div', {
      class: 'autocomplete',
      role: 'combobox',
      ariaExpanded: 'false',
      ariaOwns: 'dropdown',
      ariaHaspopup: 'listbox',
    });

    Object.keys(this.workflowCfg.targetCfg.actionMap).forEach((cls, idx) => {
      const el = createTag(idx === 0 ? 'input' : 'a', {
        class: cls.replace('.', ''),
        ...(idx === 0 ? { type: 'text' } : { href: '#' }),
        ...(idx !== 0 ? this.workflowCfg.supportedTexts[cls.replace('.', '').split('-')[0]]?.innerText : '')
      });
      con.append(el);
    });
    const dropCon = createTag('ul', {
      class: 'dropdown hidden',
      role: 'listbox',
      ariaLabelledby: 'promptInput',
    });
    con.append(dropCon);
    this.widget.append(con);
    const interactiveArea = this.target.querySelector(
      'div[data-valign="middle"].text'
    );
    const Paragraphs = interactiveArea.querySelectorAll('p.body-m');
    interactiveArea.insertBefore(this.widget, Paragraphs[1]);
    return this.actionMap;
  }
}
