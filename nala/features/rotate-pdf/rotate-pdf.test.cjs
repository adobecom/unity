import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './rotate-pdf.spec.cjs';
import RotatePdf from './rotate-pdf.page.cjs';

const pdfFilePath = path.resolve(__dirname, '../../assets/1-PDF-rotate-pdf.pdf');

let rotatePdf;

const unityLibs = process.env.UNITY_LIBS || '';

test.describe('Unity Rotate PDF test suite', () => {
  test.beforeEach(async ({ page }) => {
    rotatePdf = new RotatePdf(page);
  });

  // Test 0 : Rotate PDF
  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    console.info(`[Test Page]: ${baseURL}${features[0].path}${unityLibs}`);
    const { data } = features[0];

    await test.step('step-1: Go to Rotate Pdf test page', async () => {
      await page.goto(`${baseURL}${features[0].path}${unityLibs}`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(`${baseURL}${features[0].path}${unityLibs}`);
    });

    await test.step('step-2: Verify Rotate PDF content/specs', async () => {
      await expect(await rotatePdf.widget).toBeVisible();
      await expect(await rotatePdf.dropZone).toBeVisible();
      await expect(await rotatePdf.verbImage).toBeVisible();
      await expect(await rotatePdf.acrobatIcon).toBeVisible();
      const actualText = await rotatePdf.verbHeader.textContent();
      expect(actualText.trim()).toBe(data.verbHeading);
      await expect(await rotatePdf.verbTitle).toContainText(data.verbTitle);
    });

    // Handle different copy text for mobile vs desktop
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

    if (isMobile) {
      await expect(await rotatePdf.verbCopy).toContainText(data.verbCopyMobile);
    } else {
      await expect(await rotatePdf.verbCopy).toContainText(data.verbCopy);
    }

    await test.step('step-3: Upload a sample PDF file', async () => {
      // upload and wait for some page change indicator (like a new element or URL change)
      const fileInput = page.locator('input[type="file"]#file-upload');
      await page.waitForTimeout(10000);
      await fileInput.setInputFiles(pdfFilePath);
      await page.waitForTimeout(10000);
    });

    // Verify the URL parameters
    await test.step('step-4: Verify the URL parameters', async () => {
      const currentUrl = page.url();
      console.log(`[Post-upload URL]: ${currentUrl}`);
      const urlObj = new URL(currentUrl);
      expect(urlObj.searchParams.get('x_api_client_id')).toBe('unity');
      expect(urlObj.searchParams.get('x_api_client_location')).toBe('rotate-pages');
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
