import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './remove-background.spec.cjs';
import RemoveBackground from './remove-background.page.cjs';

const imageFilePath = path.resolve(__dirname, '../../../assets/1-PS-remove-background.jpg');

let removeBackground;
let testUrl;
const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity Remove Background test suite', () => {
  test.beforeEach(async ({ page }) => {
    removeBackground = new RemoveBackground(page);
  });

  // Test 0 : Remove Background
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to WORD to PDF test page', async () => {
      testUrl = `${baseURL}${features[0].path}${unityLibs}`;
      if (testUrl.includes('--dc--')) {
        testUrl = testUrl.replace('--dc--', '--cc--');
      }
      console.info(`[Test URL ]: ${testUrl}`);

      await page.goto(testUrl);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(testUrl);
    });

    await test.step('step-2: Verify PS upload page content/specs', async () => {
      await expect(await removeBackground.widget).toBeVisible();
      await expect(await removeBackground.dropZone).toBeVisible();
      await expect(await removeBackground.dropZoneFileInfo).toContainText(data.dropZoneFileText);
    });

    await test.step('step-3: Upload a sample Image file', async () => {
      // upload and wait for some page change indicator (like a new element or URL change)
      const fileInput = page.locator('input[type="file"]#file-upload').nth(2);
      await page.waitForLoadState('networkidle');
      await fileInput.setInputFiles(imageFilePath);
    });
  });
});
