import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './combine-pdf.spec.cjs';
import CombinePdf from './combine-pdf.page.cjs';

const pdfFilePath1 = path.resolve(__dirname, '../../assets/1-PDF-compress-pdf.pdf');
const pdfFilePath2 = path.resolve(__dirname, '../../assets/1-PDF-delete-pdf.pdf');

let combinePdf;

const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity Combine PDF test suite', () => {
  test.beforeEach(async ({ page }) => {
    combinePdf = new CombinePdf(page);
  });

  // Test 0 : Combine PDF (Merge PDF)
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to Combine Pdf test page', async () => {
      await page.goto(`${baseURL}${features[0].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify Combine PDF verb basic content', async () => {
      await expect(await combinePdf.combinePdf).toBeVisible();
      await expect(await combinePdf.dropZone).toBeVisible();
      await expect(await combinePdf.verbImage).toBeVisible();
      await expect(await combinePdf.acrobatIcon).toBeVisible();
      await expect(await combinePdf.verbTitle).toContainText(data.verbTitle);
    });

    await test.step('step-3: Upload two sample PDF files', async () => {
      const fileInput = page.locator('input[type="file"]#file-upload');
      await page.waitForTimeout(10000);
      await fileInput.setInputFiles([pdfFilePath1, pdfFilePath2]);
      await page.waitForTimeout(10000);

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

