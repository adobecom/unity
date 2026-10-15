export default class FaceSwapPage {
  constructor(page) {
    this.page = page;
    this.root = this.page.locator('.unity-face-swap');
    this.widget = this.root.locator('.ex-unity-wrap');
    this.title = this.widget.locator('.fs-title');
    this.resetButton = this.widget.locator('button.fs-reset');
    this.originalSlot = this.widget.locator('.fs-slot[data-slot="original"]');
    this.faceSlot = this.widget.locator('.fs-slot[data-slot="face"]');
    this.model = this.widget.locator('.fs-model');
    this.generateButton = this.widget.locator('button.gen-btn');
    this.generateLabel = this.generateButton.locator('.btn-txt');
    this.galleryLabel = this.widget.locator('.fs-gallery-label');
    this.galleryList = this.widget.locator('.fs-gallery-list[role="listbox"]');
    this.galleryItems = this.galleryList.locator('.fs-gallery-item[role="option"]');
    this.preview = this.root.locator('.fs-preview');
    this.errorToast = this.page.locator('.alert-holder.show');
    this.errorText = this.errorToast.locator('.alert-text');
    this.splash = this.page.locator('.splash-loader');
  }

  slot(slotId) {
    return slotId === 'face' ? this.faceSlot : this.originalSlot;
  }

  slotInput(slotId) {
    return this.slot(slotId).locator('input.fs-input');
  }

  slotImage(slotId) {
    return this.slot(slotId).locator('img.fs-slot-img');
  }

  slotDelete(slotId) {
    return this.slot(slotId).locator('button.fs-delete');
  }

  slotTitle(slotId) {
    return this.slot(slotId).locator('.fs-slot-title');
  }

  async revealDelete(slotId) {
    const touch = await this.page.evaluate(() => window.matchMedia('(hover: none)').matches);
    if (touch) await this.slot(slotId).locator('label.fs-drop').click();
    else await this.slot(slotId).hover();
  }

  async open(url) {
    await this.page.goto(url, { waitUntil: 'load' });
    await this.page.waitForLoadState('domcontentloaded');
    await this.widget.waitFor({ state: 'visible', timeout: 30000 });
  }

  async uploadToSlot(slotId, files) {
    await this.slotInput(slotId).setInputFiles(files);
  }

  async mockConnector(redirectUrl) {
    const requests = [];
    await this.page.route('**/api/v1/asset/connector', async (route) => {
      const request = route.request();
      const origin = request.headers().origin || '*';
      const cors = {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
      };
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      requests.push(request.postDataJSON());
      await route.fulfill({
        status: 200,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ url: redirectUrl }),
      });
    });
    return requests;
  }
}
