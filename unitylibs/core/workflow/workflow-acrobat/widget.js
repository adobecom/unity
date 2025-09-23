/* eslint-disable class-methods-use-this */

import { createTag } from '../../../scripts/utils.js';

export default class UnityWidget {
  constructor(target, el, workflowCfg, spriteCon) {
    this.el = el;
    this.target = target;
    this.workflowCfg = workflowCfg;
    this.widget = null;
    this.actionMap = {};
    this.spriteCon = spriteCon;
  }

  async initWidget() {
    // Create the widget container
    const widgetWrap = createTag('div', { class: 'acrobat-unity-wrap' });
    this.widget = createTag('div', { class: 'acrobat-unity-widget' });

    // Create the input area
    const inputArea = this.createInputArea();
    this.widget.append(inputArea);

    // Add sprite content if available
    if (this.spriteCon) {
      const unitySprite = createTag('div', { class: 'unity-sprite-container' });
      unitySprite.innerHTML = this.spriteCon;
      widgetWrap.append(unitySprite);
    }

    widgetWrap.append(this.widget);

    // Insert the widget below the target element
    this.insertWidget(widgetWrap);

    return this.workflowCfg.targetCfg.actionMap;
  }

  createInputArea() {
    const inputContainer = createTag('div', { class: 'input-container' });

    // Create input field
    const inputField = createTag('input', {
      type: 'text',
      class: 'acrobat-input-field',
      placeholder: 'Enter your text here...',
      'aria-label': 'Input field for Acrobat workflow',
    });

    // Create submit button
    const submitButton = createTag('button', {
      type: 'button',
      class: 'acrobat-submit-btn',
      'aria-label': 'Submit input',
    }, 'Submit');

    inputContainer.append(inputField);
    inputContainer.append(submitButton);

    return inputContainer;
  }

  insertWidget(widgetWrap) {
    // Insert the widget below the target element
    if (this.target && this.target.parentNode) {
      this.target.parentNode.insertBefore(widgetWrap, this.target.nextSibling);
    } else {
      // Fallback: append to the end of the target element
      this.target.appendChild(widgetWrap);
    }
  }
}
