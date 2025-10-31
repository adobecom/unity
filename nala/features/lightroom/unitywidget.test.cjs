import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './unitywidget.spec.cjs';
import UnityWidget from './unitywidget.page.cjs';

const imageFilePath = path.resolve(__dirname, '../../assets/lightroom.jpg');
console.log(__dirname);

let unityWidget;
const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity Widget Lr test suite', () => {
  test.beforeEach(async ({ page }) => {
    unityWidget = new UnityWidget(page);
    await page.setViewportSize({ width: 1250, height: 850 });
    await page.context().clearCookies();
  });

  // Test 0 : Unity Widget PS UI checks
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    const ccBaseURL = baseURL.replace('--dc--', '--cc--');
    console.info(`[Test Page]: ${ccBaseURL}${features[0].path}${unityLibs}`);

    await test.step('step-1: Go to Unity Widget Lr test page', async () => {
      await page.goto(`${ccBaseURL}${features[0].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${ccBaseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify Unity Widget Lr verb user interface', async () => {
      await page.waitForTimeout(3000);
      await expect(await unityWidget.unityWidgetContainer).toBeTruthy();
      await expect(await unityWidget.unityVideo).toBeTruthy();
      await expect(await unityWidget.dropZone).toBeTruthy();
      await expect(await unityWidget.dropZoneText).toBeTruthy();
    });
  });
  // Test 1 : Unity Widget File Upload & splash screen display
  test(`${features[1].name},${features[1].tags}`, async ({ page, baseURL }) => {
    const ccBaseURL = baseURL.replace('--dc--', '--cc--');
    console.info(`[Test Page]: ${ccBaseURL}${features[1].path}${unityLibs}`);

    await test.step('check lightroom file upload', async () => {
      await page.goto(`${ccBaseURL}${features[1].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${ccBaseURL}${features[1].path}${unityLibs}`);
    });
    await test.step('jpg image file upload and splash screen display', async () => {
      const fileInput = page.locator('//input[@type="file" and @id="file-upload"]').nth(0);
      console.log('fileinput', fileInput);
      await page.waitForTimeout(10000);
      await fileInput.setInputFiles(imageFilePath);
      await page.waitForTimeout(3000);
      await expect(unityWidget.splashScreen).toBeTruthy();
    });
  });
  // Test 2 : Unity Widget user navigation to Photoshop Product Page
  test(`${features[2].name},${features[2].tags}`, async ({ page, baseURL }) => {
    const ccBaseURL = baseURL.replace('--dc--', '--cc--');
    console.info(`[Test Page]: ${ccBaseURL}${features[2].path}${unityLibs}`);

    await test.step('check user landing on Lr product page post file upload', async () => {
      await page.goto(`${ccBaseURL}${features[2].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${ccBaseURL}${features[2].path}${unityLibs}`);
    });
    await test.step('jpg image file upload and user navigation to product page', async () => {
      const fileInput = page.locator('//input[@type="file" and @id="file-upload"]').nth(0);
      await page.waitForTimeout(10000);
      await fileInput.setInputFiles(imageFilePath);
      await page.waitForTimeout(10000);
      const productPageUrl = await page.url();
      expect(productPageUrl).toContain(features[2].url);
    });
  });
});
