import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './pdf-word.spec.cjs';
import PdfToWord from './pdf-word.page.cjs';

const pdfFilePath = path.resolve(__dirname, '../../assets/1-PDF-pdf-word.pdf');

let pdfToWord;

const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity PDF to Word test suite', () => {
  test.beforeEach(async ({ page }) => {
    pdfToWord = new PdfToWord(page);
  });

  // Test 0 : PDF to word
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to PDF to Word page numbers test page', async () => {
      await page.goto(`${baseURL}${features[0].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify PDF to word content/specs', async () => {
      await expect(await pdfToWord.widget).toBeVisible();
      await expect(await pdfToWord.dropZone).toBeVisible();
      await expect(await pdfToWord.verbImage).toBeVisible();
      await expect(await pdfToWord.acrobatIcon).toBeVisible();
      const actualText = await pdfToWord.verbHeader.textContent();
      expect(actualText.trim()).toBe(data.verbHeading);
      await expect(await pdfToWord.verbTitle).toContainText(data.verbTitle);
      await expect(await pdfToWord.verbCopy).toContainText(data.verbCopy);
    });

    await test.step('step-3: Upload a sample PDF file', async () => {
      // Wait for file input to be ready and upload file
      const fileInput = page.locator('input[type="file"]#file-upload');
      await fileInput.waitFor({ state: 'attached' });
      await fileInput.setInputFiles(pdfFilePath);      // Wait for navigation to complete after file upload
      try {
        await page.waitForURL((url) => url.searchParams.has('x_api_client_id'), { timeout: 15000 });
      } catch (error) {
        // Fallback: wait for any URL change or timeout
        await page.waitForURL((url) => url !== page.url(), { timeout: 20000 });
      }

      // Verify the URL parameters
      const currentUrl = page.url();
      console.log(`[Post-upload URL]: ${currentUrl}`);
      const urlObj = new URL(currentUrl);
      expect(urlObj.searchParams.get('x_api_client_id')).toBe('unity');
      expect(urlObj.searchParams.get('x_api_client_location')).toBe('pdf-to-word');
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
