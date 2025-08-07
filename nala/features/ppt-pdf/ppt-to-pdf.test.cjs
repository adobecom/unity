import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './ppt-to-pdf.spec.cjs';
import PptToPdf from './ppt-to-pdf.page.cjs';

const pptFilePath = path.resolve(__dirname, '../../assets/1-PPT-ppt-pdf.pptx');

let pptToPdf;

const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity PPT to PDF test suite', () => {
  test.beforeEach(async ({ page }) => {
    pptToPdf = new PptToPdf(page);
  });

  // Test 0 : PPT to PDF
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to PPT to PDF test page', async () => {
      await page.goto(`${baseURL}${features[0].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify PPT to PDF content/specs', async () => {
      await expect(await pptToPdf.widget).toBeVisible();
      await expect(await pptToPdf.dropZone).toBeVisible();
      await expect(await pptToPdf.verbImage).toBeVisible();
      await expect(await pptToPdf.acrobatIcon).toBeVisible();
      const actualText = await pptToPdf.verbHeader.textContent();
      expect(actualText.trim()).toBe(data.verbHeading);
      await expect(await pptToPdf.verbTitle).toContainText(data.verbTitle);
      await expect(await pptToPdf.verbCopy).toContainText(data.verbCopy);
    });

    await test.step('step-3: Upload a sample PDF file', async () => {      // Wait for file input to be ready and upload file
      const fileInput = page.locator('input[type="file"]#file-upload');
      await fileInput.waitFor({ state: 'attached' });
      await fileInput.setInputFiles(pptFilePath);

      // Wait for navigation to complete after file upload
      await page.waitForURL((url) => url.searchParams.has('x_api_client_id'), { timeout: 15000 });

      // Verify the URL parameters
      const currentUrl = page.url();
      console.log(`[Post-upload URL]: ${currentUrl}`);
      const urlObj = new URL(currentUrl);
      expect(urlObj.searchParams.get('x_api_client_id')).toBe('unity');
      expect(urlObj.searchParams.get('x_api_client_location')).toBe('ppt-to-pdf');
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
