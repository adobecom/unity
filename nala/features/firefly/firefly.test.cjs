import { test, expect } from '@playwright/test';
import { features } from './firefly.spec.cjs';
import FireflyPage from './firefly.page.cjs';

const unityLibs = process.env.UNITY_LIBS || '';
let fireflyPage;

test.describe('Firefly test suite', () => {
  test.beforeEach(async ({ page }) => {
    fireflyPage = new FireflyPage(page);
  });

  // Test 0 : Firefly Image UI
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to Firefly test page', async () => {
      await page.goto(`${baseURL}${features[0].path}${unityLibs}`, { waitUntil: 'load' });
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify Firefly Image verb content/specs', async () => {
      await expect(fireflyPage.unityWrapper).toBeVisible();
      await expect(fireflyPage.imageVerbButton).toBeVisible();
      await expect(fireflyPage.promptInput).toBeVisible();
      await expect(fireflyPage.generateImageButton).toBeVisible();

      const actualText = await fireflyPage.promptInput.getAttribute('placeholder');
      expect(actualText.trim()).toBe(data.inputPlaceholder);
    });

    await test.step('step-3: Verify prompt suggestions', async () => {
      await fireflyPage.promptInput.fill(data.inputPrompt);
      await expect(fireflyPage.promptSuggestions).toBeVisible();
    });

    await test.step('step-4: Verify tip description', async () => {
      const tipDesc = await fireflyPage.tipDescription.textContent();
      expect(tipDesc.trim()).toBe(data.tipDescription);
    });

    await test.step('step-5: Verify legal link text', async () => {
      const legalLinkText = await fireflyPage.legalLink.textContent();
      expect(legalLinkText.trim()).toBe(data.legalLinkText);
    });
  });

  // Test 1 : Firefly Video UI
  test(`${features[1].name},${features[1].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[1].path}${unityLibs}`);
    const { data } = features[1];

    await test.step('step-1: Go to Firefly test page', async () => {
      await page.goto(`${baseURL}${features[1].path}${unityLibs}`, { waitUntil: 'load' });
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[1].path}${unityLibs}`);
    });

    await test.step('step-2: Verify Firefly Video verb content/specs', async () => {
      await expect(fireflyPage.unityWrapper).toBeVisible();
      await fireflyPage.imageVerbButton.click({ noWaitAfter: true });
      await page.waitForTimeout(1000);
      await fireflyPage.videoVerbLink.click({ noWaitAfter: true });
      await page.waitForTimeout(1000);
      await expect(fireflyPage.unityWrapper).toBeVisible();
      await expect(fireflyPage.videoVerbButton).toBeVisible();
      await expect(fireflyPage.promptInput).toBeVisible();
      await expect(fireflyPage.generateVideoButton).toBeVisible();

      const actualText = await fireflyPage.promptInput.getAttribute('placeholder');
      expect(actualText.trim()).toBe(data.inputPlaceholder);
    });

    await test.step('step-3: Verify prompt suggestions', async () => {
      await fireflyPage.promptInput.click({ noWaitAfter: true });
      await expect(fireflyPage.promptSuggestions).toBeVisible();
    });

    await test.step('step-4: Verify tip description', async () => {
      const tipDesc = await fireflyPage.tipDescription.textContent();
      expect(tipDesc.trim()).toBe(data.tipDescription);
    });

    await test.step('step-5: Verify legal link text', async () => {
      const legalLinkText = await fireflyPage.legalLink.textContent();
      expect(legalLinkText.trim()).toBe(data.legalLinkText);
    });
  });

  // Test 2 : Firefly Video Generation
  test(`${features[2].name},${features[2].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[2].path}${unityLibs}`);
    const { data } = features[2];

    await test.step('step-1: Go to Firefly test page', async () => {
      await page.goto(`${baseURL}${features[2].path}${unityLibs}`, { waitUntil: 'load' });
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[2].path}${unityLibs}`);
    });

    await test.step('step-2: Verify Firefly Video Generation verb content/specs', async () => {
      await expect(fireflyPage.unityWrapper).toBeVisible();
      await fireflyPage.imageVerbButton.click({ noWaitAfter: true });
      await page.waitForTimeout(1000);
      await fireflyPage.videoVerbLink.click({ noWaitAfter: true });
    });

    await test.step('step-3 Generate video', async () => {
      await fireflyPage.promptInput.fill(data.inputPrompt);
      await fireflyPage.generateVideoButton.click({ noWaitAfter: true });
      await page.waitForTimeout(3000);

      // Wait until the final URL is reached
      await page.waitForURL(
        (url) => url.hostname.includes('firefly')
        && url.pathname.includes('/generate/video')
        && url.searchParams.get('ff_campaign') === 'embed_generate_acom',
        { waitUntil: 'load', timeout: 30000 },
      );

      // Verify the URL parameters
      const currentUrl = page.url();
      console.log(`[Post-upload URL]: ${currentUrl}`);
      const urlObj = new URL(currentUrl);
      expect(urlObj.hostname).toContain('firefly');
      expect(urlObj.pathname).toContain('/generate/video');
      expect(urlObj.searchParams.get('ff_campaign')).toBe('embed_generate_acom');
    });
  });

  // Test 3 : Firefly Image Generation
  test(`${features[3].name},${features[3].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[3].path}${unityLibs}`);
    const { data } = features[3];
    await test.step('step-1: Go to Firefly test page', async () => {
      await page.goto(`${baseURL}${features[3].path}${unityLibs}`, { waitUntil: 'load' });
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[3].path}${unityLibs}`);
    });
    await test.step('step-2: Verify Firefly Image Generation verb content/specs', async () => {
      await expect(fireflyPage.unityWrapper).toBeVisible();
      await expect(fireflyPage.imageVerbButton).toBeVisible();
    });
    await test.step('step-3 Generate image', async () => {
      await fireflyPage.promptInput.fill(data.inputPrompt);
      await fireflyPage.generateImageButton.click({ noWaitAfter: true });
      await page.waitForTimeout(3000);

      // Wait until the final URL is reached
      await page.waitForURL(
        (url) => url.hostname.includes('firefly')
        && url.pathname.includes('/generate/image')
        && url.searchParams.get('ff_campaign') === 'embed_generate_acom',
        { waitUntil: 'load', timeout: 30000 },
      );

      // Verify the URL parameters
      const currentUrl = page.url();
      console.log(`[Post-upload URL]: ${currentUrl}`);
      const urlObj = new URL(currentUrl);
      expect(urlObj.hostname).toContain('firefly');
      expect(urlObj.pathname).toContain('/generate/image');
      expect(urlObj.searchParams.get('ff_campaign')).toBe('embed_generate_acom');
    });
  });
});
