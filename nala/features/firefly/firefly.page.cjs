export default class FireflyWidget {
  constructor(page, nth = 0) {
    this.page = page;
    this.section = page.locator('.section').nth(nth);
    this.widgetWrap = this.section.locator('.ex-unity-wrap').nth(0);
    this.widget = this.section.locator('.ex-unity-widget').nth(0);

    this.inputField = this.widget.locator('input.inp-field');
    this.generateButton = this.widget.locator('.gen-btn');
    this.dropdown = this.widget.locator('.prompt-suggestions-list');
    this.suggestionItems = this.widget.locator('.drop-item');
    this.selectedVerbButton = this.widget.locator('.verbs-container .selected-verb');
  }
}

