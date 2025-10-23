import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './merge-pdf.spec.cjs';
import MergePdf from './merge-pdf.page.cjs';

const pdfFilePath1 = path.resolve(__dirname, '../../assets/1-PDF-merge-pdf-1.pdf');
const pdfFilePath2 = path.resolve(__dirname, '../../assets/1-PDF-merge-pdf-2.pdf');

let mergePdf;

const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity Merge PDF test suite', () => {
  test.beforeEach(async ({ page }) => {
    mergePdf = new MergePdf(page);
  });

  // Test 0 : Merge PDF
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to Merge PDF test page', async () => {
      await page.goto(`${baseURL}${features[0].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify Merge PDF widget content/specs', async () => {
      await expect(await mergePdf.widget).toBeVisible();
      await expect(await mergePdf.dropZone).toBeVisible();
      await expect(await mergePdf.verbImage).toBeVisible();
      await expect(await mergePdf.acrobatIcon).toBeVisible();
      const actualText = await mergePdf.verbHeader.textContent();
      expect(actualText.trim()).toBe(data.verbHeading);
      await expect(await mergePdf.verbTitle).toContainText(data.verbTitle);
      await expect(await mergePdf.verbCopy).toContainText(data.verbCopy);
    });

    await test.step('step-3: Upload a sample PDF files to be merged', async () => {
      // upload and wait for some page change indicator (like a new element or URL change)
      const fileInput = page.locator('input[type="file"]#file-upload');
      await page.waitForTimeout(10000);
      await fileInput.setInputFiles([pdfFilePath1, pdfFilePath2]);
      await page.waitForTimeout(15000);

      // Verify the URL parameters
      const currentUrl = page.url();
      console.log(`[Post-upload URL]: ${currentUrl}`);
      const urlObj = new URL(currentUrl);
      expect(urlObj.searchParams.get('x_api_client_id')).toBe('unity');
      expect(urlObj.searchParams.get('x_api_client_location')).toBe('combine-pdf');
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
