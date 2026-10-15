import path from 'path';
import { expect, test } from '@playwright/test';
import { features } from './face-swap.spec.cjs';
import FaceSwapPage from './face-swap.page.cjs';

const jpgFile = path.resolve(__dirname, '../../assets/1-JPG-jpg-pdf.jpg');
const pngFile = path.resolve(__dirname, '../../assets/1-PNG-png-pdf.png');
const unityLibs = process.env.UNITY_LIBS || '';
const REDIRECT_HASH = '#nala-face-swap-redirect';

let faceSwap;

const testUrlFor = (baseURL, feature) => {
  const url = `${baseURL}${feature.path}${unityLibs.replace('?', '&')}`;
  return url.replace('--dc--', '--da-cc--');
};

test.describe('Unity Face Swap test suite', () => {
  test.beforeEach(async ({ page }) => {
    faceSwap = new FaceSwapPage(page);
  });

  // Test 0 : Face Swap UI
  test(`${features[0].tcid} ${features[0].name},${features[0].tags}`, async ({ baseURL }) => {
    const testUrl = testUrlFor(baseURL, features[0]);
    console.info(`[Test Page]: ${testUrl}`);
    const { data } = features[0];

    await test.step('step-1: Go to Face Swap test page', async () => {
      await faceSwap.open(testUrl);
    });

    await test.step('step-2: Verify widget content', async () => {
      await expect(faceSwap.title).toHaveText(data.title);
      await expect(faceSwap.resetButton).toBeVisible();
      await expect(faceSwap.resetButton).toBeEnabled();
      await expect(faceSwap.slotTitle('original')).toHaveText(data.originalTitle);
      await expect(faceSwap.slotTitle('face')).toHaveText(data.faceTitle);
      await expect(faceSwap.originalSlot).toHaveAttribute('data-state', 'empty');
      await expect(faceSwap.faceSlot).toHaveAttribute('data-state', 'empty');
      await expect(faceSwap.generateLabel).toHaveText(data.ctaLabel);
      await expect(faceSwap.generateButton).toBeEnabled();
    });

    await test.step('step-3: Verify static model display and gallery', async () => {
      await expect(faceSwap.model).toBeVisible();
      expect(await faceSwap.model.locator('button, [tabindex]').count()).toBe(0);
      await expect(faceSwap.galleryLabel).toHaveText(data.galleryLabel);
      expect(await faceSwap.galleryItems.count()).toBeGreaterThan(0);
      await expect(faceSwap.galleryItems.first()).toHaveAttribute('tabindex', '0');
      await expect(faceSwap.galleryItems.first()).toHaveAttribute('aria-selected', 'false');
      await expect(faceSwap.preview).toBeVisible();
    });
  });

  // Test 1 : Upload preview and delete
  test(`${features[1].tcid} ${features[1].name},${features[1].tags}`, async ({ baseURL }) => {
    const testUrl = testUrlFor(baseURL, features[1]);
    console.info(`[Test Page]: ${testUrl}`);

    await test.step('step-1: Go to Face Swap test page', async () => {
      await faceSwap.open(testUrl);
    });

    await test.step('step-2: Upload images into both slots', async () => {
      await faceSwap.uploadToSlot('original', jpgFile);
      await faceSwap.uploadToSlot('face', pngFile);
      await expect(faceSwap.originalSlot).toHaveAttribute('data-state', 'ready');
      await expect(faceSwap.faceSlot).toHaveAttribute('data-state', 'ready');
      await expect(faceSwap.slotImage('original')).toBeVisible();
      await expect(faceSwap.slotImage('face')).toBeVisible();
    });

    await test.step('step-3: Delete the original image', async () => {
      await faceSwap.originalSlot.hover();
      await faceSwap.slotDelete('original').click();
      await expect(faceSwap.originalSlot).toHaveAttribute('data-state', 'empty');
      await expect(faceSwap.slotImage('original')).toBeHidden();
      await expect(faceSwap.slotInput('original')).toBeFocused();
      await expect(faceSwap.faceSlot).toHaveAttribute('data-state', 'ready');
    });
  });

  // Test 2 : Reset
  test(`${features[2].tcid} ${features[2].name},${features[2].tags}`, async ({ baseURL }) => {
    const testUrl = testUrlFor(baseURL, features[2]);
    console.info(`[Test Page]: ${testUrl}`);

    await test.step('step-1: Go to Face Swap test page', async () => {
      await faceSwap.open(testUrl);
    });

    await test.step('step-2: Fill both slots', async () => {
      await faceSwap.galleryItems.first().click();
      await faceSwap.uploadToSlot('face', pngFile);
      await expect(faceSwap.originalSlot).toHaveAttribute('data-state', 'ready');
      await expect(faceSwap.faceSlot).toHaveAttribute('data-state', 'ready');
    });

    await test.step('step-3: Reset clears both slots and the gallery selection', async () => {
      await faceSwap.resetButton.click();
      await expect(faceSwap.originalSlot).toHaveAttribute('data-state', 'empty');
      await expect(faceSwap.faceSlot).toHaveAttribute('data-state', 'empty');
      await expect(faceSwap.galleryList.locator('[aria-selected="true"]')).toHaveCount(0);
      await expect(faceSwap.slotInput('original')).toBeFocused();
    });
  });

  // Test 3 : Gallery selection
  test(`${features[3].tcid} ${features[3].name},${features[3].tags}`, async ({ page, baseURL }) => {
    const testUrl = testUrlFor(baseURL, features[3]);
    console.info(`[Test Page]: ${testUrl}`);

    await test.step('step-1: Go to Face Swap test page', async () => {
      await faceSwap.open(testUrl);
    });

    await test.step('step-2: Select a gallery image', async () => {
      await faceSwap.galleryItems.first().click();
      await expect(faceSwap.galleryItems.first()).toHaveAttribute('aria-selected', 'true');
      await expect(faceSwap.originalSlot).toHaveAttribute('data-state', 'ready');
      await expect(faceSwap.slotImage('original')).toBeVisible();
      await expect(faceSwap.faceSlot).toHaveAttribute('data-state', 'empty');
    });

    await test.step('step-3: Arrow keys move the gallery focus', async () => {
      if (await faceSwap.galleryItems.count() < 2) return;
      await faceSwap.galleryItems.first().focus();
      await page.keyboard.press('ArrowRight');
      await expect(faceSwap.galleryItems.nth(1)).toBeFocused();
      await expect(faceSwap.galleryItems.nth(1)).toHaveAttribute('tabindex', '0');
      await expect(faceSwap.galleryItems.first()).toHaveAttribute('tabindex', '-1');
    });
  });

  // Test 4 : Unsupported file type shows the error toast
  test(`${features[4].tcid} ${features[4].name},${features[4].tags}`, async ({ page, baseURL }) => {
    const testUrl = testUrlFor(baseURL, features[4]);
    console.info(`[Test Page]: ${testUrl}`);
    const { data } = features[4];

    await test.step('step-1: Go to Face Swap test page', async () => {
      await faceSwap.open(testUrl);
    });

    await test.step('step-2: Upload an unsupported file', async () => {
      await faceSwap.uploadToSlot('face', {
        name: 'not-an-image.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('not an image'),
      });
      await expect(faceSwap.errorToast).toBeVisible();
      await expect(faceSwap.errorText).toContainText(data.errorText);
      await expect(faceSwap.faceSlot).toHaveAttribute('data-state', 'empty');
    });

    await test.step('step-3: Escape dismisses the toast', async () => {
      await page.keyboard.press('Escape');
      await expect(faceSwap.errorToast).toBeHidden();
    });
  });

  // Test 5 : Mobile CTA keeps its label
  test(`${features[5].tcid} ${features[5].name},${features[5].tags}`, async ({ page, baseURL }) => {
    const testUrl = testUrlFor(baseURL, features[5]);
    console.info(`[Test Page]: ${testUrl}`);
    const { data } = features[5];

    await test.step('step-1: Go to Face Swap test page at mobile width', async () => {
      await page.setViewportSize(data.viewport);
      await faceSwap.open(testUrl);
    });

    await test.step('step-2: CTA label is visible below 600px', async () => {
      await expect(faceSwap.generateButton).toBeVisible();
      await expect(faceSwap.generateLabel).toBeVisible();
      await expect(faceSwap.generateLabel).toHaveText(data.ctaLabel);
    });
  });

  // Test 6 : No images redirects without the transition screen
  test(`${features[6].tcid} ${features[6].name},${features[6].tags}`, async ({ page, baseURL }) => {
    const testUrl = testUrlFor(baseURL, features[6]);
    console.info(`[Test Page]: ${testUrl}`);
    let requests;

    await test.step('step-1: Go to Face Swap test page', async () => {
      requests = await faceSwap.mockConnector(`${testUrl}${REDIRECT_HASH}`);
      await faceSwap.open(testUrl);
    });

    await test.step('step-2: Click the CTA with no images', async () => {
      await faceSwap.generateButton.click();
      await expect(page).toHaveURL(new RegExp(`${REDIRECT_HASH}$`), { timeout: 30000 });
      expect(requests).toHaveLength(1);
      expect(requests[0].assets).toBeUndefined();
      await expect(faceSwap.splash).toBeHidden();
    });
  });

  // Test 7 : Gallery pick redirects with a reachable gallery asset
  test(`${features[7].tcid} ${features[7].name},${features[7].tags}`, async ({ page, baseURL }) => {
    const testUrl = testUrlFor(baseURL, features[7]);
    console.info(`[Test Page]: ${testUrl}`);
    const { data } = features[7];
    let requests;

    await test.step('step-1: Go to Face Swap test page', async () => {
      requests = await faceSwap.mockConnector(`${testUrl}${REDIRECT_HASH}`);
      await faceSwap.open(testUrl);
    });

    await test.step('step-2: Pick a gallery image and click the CTA', async () => {
      await faceSwap.galleryItems.first().click();
      await faceSwap.generateButton.click();
      await expect(page).toHaveURL(new RegExp(`${REDIRECT_HASH}$`), { timeout: 30000 });
      expect(requests).toHaveLength(1);
      const [asset] = requests[0].assets;
      expect(asset.metadata.referenceImage).toBe('baseImage');
      expect(asset.href).toMatch(/^https:\/\//);
      await expect(faceSwap.splash).toBeHidden();
    });

    await test.step('step-3: Every gallery asset is reachable and an allowed type', async () => {
      const count = await faceSwap.galleryItems.count();
      const generateFrom = (i) => async () => {
        await faceSwap.galleryItems.nth(i).click();
        await faceSwap.generateButton.click();
        await expect.poll(() => requests.length).toBe(i + 1);
      };
      await Array.from({ length: count - 1 }, (_, k) => generateFrom(k + 1))
        .reduce((chain, step) => chain.then(step), Promise.resolve());
      const hrefs = requests.map((body) => body.assets[0].href);
      expect(new Set(hrefs).size).toBe(count);
      const responses = await Promise.all(hrefs.map((href) => page.request.get(href)));
      responses.forEach((response, i) => {
        expect(response.ok(), hrefs[i]).toBeTruthy();
        expect(data.allowedTypes, hrefs[i]).toContain(response.headers()['content-type'].split(';')[0].trim());
      });
    });
  });
});
