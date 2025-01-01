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
        class: cls,
        ...(idx === 0 ? { type: 'text' } : { href: '#' }),
      });
      con.append(el);
    });

    this.widget.append(con);
    this.target.append(this.widget);

    return this.actionMap;
  }
}
