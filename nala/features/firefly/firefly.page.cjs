export default class FireflyPage {
  constructor(page) {
    this.page = page;
    // Firefly locators
    this.unityWrapper = this.page.locator('.ex-unity-wrap');
    this.imageVerbButton = this.unityWrapper.locator('button.selected-verb[data-selected-verb="image"]');
    this.imageVerbLink = this.unityWrapper.locator('a.verb-link[data-verb-type="image"]');
    this.generateImageButton = this.unityWrapper.locator('a.gen-btn[aria-label="Generate image"]');
    this.videoVerbButton = this.unityWrapper.locator('button.selected-verb[data-selected-verb="video"]');
    this.videoVerbLink = this.unityWrapper.locator('a.verb-link[data-verb-type="video"]');
    this.generateVideoButton = this.unityWrapper.locator('a.gen-btn[aria-label="Generate video"]');
    this.promptInput = this.unityWrapper.locator('input#promptInput');
    this.promptDropdown = this.unityWrapper.locator('ul#prompt-dropdown');
    this.promptSuggestions = this.unityWrapper.locator('ul#prompt-dropdown li.drop-item').first();
    this.tipLabel = this.unityWrapper.locator('span#tip-text');
    this.tipDescription = this.unityWrapper.locator('span#tip-desc');
    this.legalLink = this.unityWrapper.locator('a.legal-text[href*="adobe-gen-ai-user-guidelines.html"]');
  }
}
