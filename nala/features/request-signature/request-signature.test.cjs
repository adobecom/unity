import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './request-signature.spec.cjs';
import RequestSignature from './request-signature.page.cjs';

const pdfFilePath = path.resolve(__dirname, '../../assets/1-PDF-request-signature-pdf.pdf');

let requestSignature;

const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity Request Signature Verb test suite', () => {
  test.beforeEach(async ({ page }) => {
    requestSignature = new RequestSignature(page);
  });

  // Test 0 : Request Signature PDF verb
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to Request Signature test page', async () => {
      await page.goto(`${baseURL}${features[0].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify Request Signature PDF verb content/specs', async () => {
      await expect(await requestSignature.requestSignature).toBeVisible();
      await expect(await requestSignature.dropZone).toBeVisible();
      await expect(await requestSignature.verbImage).toBeVisible();
      await expect(await requestSignature.acrobatIcon).toBeVisible();
      const actualText = await requestSignature.verbHeader.textContent();
      expect(actualText.trim()).toBe(data.verbHeading);
      await expect(await requestSignature.verbTitle).toContainText(data.verbTitle);
      await expect(await requestSignature.verbCopy).toContainText(data.verbCopy);
    });

    await test.step('step-3: Upload a sample PDF file', async () => {      // Wait for file input to be ready and upload file
      const fileInput = page.locator('input[type="file"]#file-upload');
      await fileInput.waitFor({ state: 'attached' });
      await fileInput.setInputFiles(pdfFilePath);

      // Wait for navigation to complete after file upload
      await page.waitForURL((url) => url.searchParams.has('x_api_client_id'), { timeout: 15000 });

      // Verify the URL parameters
      const currentUrl = page.url();
      console.log(`[Post-upload URL]: ${currentUrl}`);
      const urlObj = new URL(currentUrl);
      expect(urlObj.searchParams.get('x_api_client_id')).toBe('unity');
      expect(urlObj.searchParams.get('x_api_client_location')).toBe('sendforsignature');
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
