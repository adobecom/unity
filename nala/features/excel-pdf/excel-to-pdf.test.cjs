import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './excel-to-pdf.spec.cjs';
import ExcelToPdf from './excel-to-pdf.page.cjs';

const excelFilePath = path.resolve(__dirname, '../../assets/1-Excel-excel-pdf.xlsx');

let excelToPdf;

const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity EXCEL to PDF test suite', () => {
  test.beforeEach(async ({ page }) => {
    excelToPdf = new ExcelToPdf(page);
  });

  // Test 0 : EXCEL to PDF
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to EXCEL to PDF test page', async () => {
      await page.goto(`${baseURL}${features[0].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify EXCEL to PDF content/specs', async () => {
      await expect(await excelToPdf.widget).toBeVisible();
      await expect(await excelToPdf.dropZone).toBeVisible();
      await expect(await excelToPdf.verbImage).toBeVisible();
      await expect(await excelToPdf.acrobatIcon).toBeVisible();
      const actualText = await excelToPdf.verbHeader.textContent();
      expect(actualText.trim()).toBe(data.verbHeading);
      await expect(await excelToPdf.verbTitle).toContainText(data.verbTitle);
      await expect(await excelToPdf.verbCopy).toContainText(data.verbCopy);
    });

    await test.step('step-3: Upload a sample PDF file', async () => {
      // upload and wait for some page change indicator (like a new element or URL change)
      const fileInput = page.locator('input[type="file"]#file-upload');
      await page.waitForTimeout(10000);
      await fileInput.setInputFiles(excelFilePath);
      await page.waitForTimeout(10000);

      // Verify the URL parameters
      const currentUrl = page.url();
      console.log(`[Post-upload URL]: ${currentUrl}`);
      const urlObj = new URL(currentUrl);
      expect(urlObj.searchParams.get('x_api_client_id')).toBe('unity');
      expect(urlObj.searchParams.get('x_api_client_location')).toBe('excel-to-pdf');
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
