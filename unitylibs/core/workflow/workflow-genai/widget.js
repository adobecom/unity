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
    const [iWidget, unityaa, unityoa] = [
      'unity-widget',
      'unity-action-area',
      'unity-option-area',
    ].map((c) => createTag('div', { class: c }));
    iWidget.append(unityoa, unityaa);
    this.widget = iWidget;
    const con = createTag('div', {
      class: 'autocomplete',
      role: 'combobox',
      ariaExpanded: 'false',
      ariaOwns: 'dropdown',
      ariaHaspopup: 'listbox',
    });
    this.widget.append(con);
    this.target.append(iWidget);
    return this.actionMap;
  }
}
