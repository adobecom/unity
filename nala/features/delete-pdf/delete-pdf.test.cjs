import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './delete-pdf.spec.cjs';
import DeletePdf from './delete-pdf.page.cjs';

const pdfFilePath = path.resolve(__dirname, '../../assets/1-PDF-delete-pdf.pdf');

let deletePdf;

const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity Delete PDF test suite', () => {
  test.beforeEach(async ({ page }) => {
    deletePdf = new DeletePdf(page);
  });

  // Test 0 : Delete PDF Pages
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to Delete Pdf page test page', async () => {
      await page.goto(`${baseURL}${features[0].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify Delete Pdf content/specs', async () => {
      await expect(await deletePdf.deletePdf).toBeVisible();
      await expect(await deletePdf.dropZone).toBeVisible();
      await expect(await deletePdf.verbImage).toBeVisible();
      await expect(await deletePdf.acrobatIcon).toBeVisible();
      const actualText = await deletePdf.verbHeader.textContent();
      expect(actualText.trim()).toBe(data.verbHeading);
      await expect(await deletePdf.verbTitle).toContainText(data.verbTitle);
      await expect(await deletePdf.verbCopy).toContainText(data.verbCopy);
    });

    await test.step('step-3: Upload a sample PDF file', async () => {
      // upload and wait for some page change indicator (like a new element or URL change)
      const fileInput = page.locator('input[type="file"]#file-upload');
      await page.waitForTimeout(10000);
      await fileInput.setInputFiles(pdfFilePath);
      await page.waitForTimeout(10000);

      // Verify the URL parameters
      const currentUrl = page.url();
      console.log(`[Post-upload URL]: ${currentUrl}`);
      const urlObj = new URL(currentUrl);
      expect(urlObj.searchParams.get('x_api_client_id')).toBe('unity');
      expect(urlObj.searchParams.get('x_api_client_location')).toBe('delete-pages');
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
