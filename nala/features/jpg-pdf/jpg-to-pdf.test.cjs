import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './jpg-to-pdf.spec.cjs';
import JpgToPdf from './jpg-to-pdf.page.cjs';

const jpgFilePath = path.resolve(__dirname, '../../assets/1-JPG-jpg-pdf.jpg');

let jpgToPdf;

const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity JPG to PDF test suite', () => {
  test.beforeEach(async ({ page }) => {
    jpgToPdf = new JpgToPdf(page);
  });

  // Test 0 : JPG to PDF
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to JPG to PDF test page', async () => {
      await page.goto(`${baseURL}${features[0].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify JPG to PDF content/specs', async () => {
      await expect(await jpgToPdf.widget).toBeVisible();
      await expect(await jpgToPdf.dropZone).toBeVisible();
      await expect(await jpgToPdf.verbImage).toBeVisible();
      await expect(await jpgToPdf.acrobatIcon).toBeVisible();
      const actualText = await jpgToPdf.verbHeader.textContent();
      expect(actualText.trim()).toBe(data.verbHeading);
      await expect(await jpgToPdf.verbTitle).toContainText(data.verbTitle);
      await expect(await jpgToPdf.verbCopy).toContainText(data.verbCopy);
    });

    await test.step('step-3: Upload a sample PDF file', async () => {      // Wait for file input to be ready and upload file
      const fileInput = page.locator('input[type="file"]#file-upload');
      await fileInput.waitFor({ state: 'attached' });
      await fileInput.setInputFiles(jpgFilePath);

      // Wait for navigation to complete after file upload
      await page.waitForURL((url) => url.searchParams.has('x_api_client_id'), { timeout: 15000 });

      // Verify the URL parameters
      const currentUrl = page.url();
      console.log(`[Post-upload URL]: ${currentUrl}`);
      const urlObj = new URL(currentUrl);
      expect(urlObj.searchParams.get('x_api_client_id')).toBe('unity');
      expect(urlObj.searchParams.get('x_api_client_location')).toBe('jpg-to-pdf');
      expect(urlObj.searchParams.get('user')).toBe('frictionless_new_user');
      expect(urlObj.searchParams.get('attempts')).toBe('1st');
      console.log({
        x_api_client_id: urlObj.searchParams.get('x_api_client_id'),
        x_api_client_location: urlObj.searchParams.get('x_api_client_location'),
        user: urlObj.searchParams.get('user'),
        attempts: urlObj.searchParams.get('attempts'),
      });
    });
  });
});
