export default class FireflyPage {
  constructor(page) {
    this.page = page;
    // Firefly locators
    this.unityWrapper = this.page.locator('.ex-unity-wrap');
    this.imageVerbButton = this.unityWrapper.locator('button.selected-verb[data-selected-verb="image"]');
    this.imageVerbLink = this.unityWrapper.locator('a.verb-link[data-verb-type="image"]');
    this.generateImageButton = this.unityWrapper.locator('a.gen-btn[aria-label="Generate image"]');
    this.generateVectorButton = this.unityWrapper.locator('a.gen-btn[aria-label="Generate vector"]');
    this.videoVerbButton = this.unityWrapper.locator('button.selected-verb[data-selected-verb="video"]');
    this.vectorVerbLink = this.unityWrapper.locator('a.verb-link[data-verb-type="vector"]');
    this.videoVerbLink = this.unityWrapper.locator('a.verb-link[data-verb-type="video"]');
    this.generateVideoButton = this.unityWrapper.locator('a.gen-btn[aria-label="Generate video"]');
    this.promptInput = this.unityWrapper.locator('input#promptInput');
    this.promptDropdown = this.unityWrapper.locator('ul#prompt-dropdown');
    this.promptSuggestions = this.unityWrapper.locator('ul#prompt-dropdown li.drop-item').first();
    this.tipLabel = this.unityWrapper.locator('span#tip-text');
    this.tipDescription = this.unityWrapper.locator('span#tip-desc');
    this.legalLink = this.unityWrapper.locator('a.legal-text[href*="adobe-gen-ai-user-guidelines.html"]');
  }

  async fillPromptAndWaitForSuggestions(text) {
    await this.promptInput.clear();
    await this.promptInput.fill(text);
    await this.page.waitForTimeout(500);
    await this.waitForPromptSuggestions();
  }

  async fillPromptForGeneration(text) {
    await this.promptInput.clear();
    await this.promptInput.fill(text);
    await this.page.waitForTimeout(200);
  }

  async waitForPromptSuggestions(timeout = 10000) {
    try {
      await this.promptDropdown.waitFor({ state: 'visible', timeout: timeout / 2 });
      await this.promptSuggestions.waitFor({ state: 'visible', timeout: timeout / 2 });
    } catch (error) {
      await this.promptInput.click();
      await this.page.waitForTimeout(500);
      await this.promptSuggestions.waitFor({ state: 'visible', timeout: 2000 });
    }
  }
}
