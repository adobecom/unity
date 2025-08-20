import { expect, test } from '@playwright/test';
import { features } from './firefly.spec.cjs';
import FireflyWidget from './firefly.page.cjs';

let firefly;
const unityLibs = process.env.UNITY_LIBS || '';

const CONNECTOR_ENDPOINT_GLOB = '**/api/v1/asset/connector';

test.describe('Unity Firefly widget e2e', () => {
  test.beforeEach(async ({ page }) => {
    firefly = new FireflyWidget(page);
  });

  test(`${features[0].name},${features[0].tags}`, async ({ page, baseURL }) => {
    const targetUrl = `${baseURL}${features[0].path}${unityLibs}`;
    console.info(`[Test Page]: ${targetUrl}`);

    await test.step('Navigate to Firefly test page', async () => {
      await page.goto(targetUrl);
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(targetUrl);
    });

    await test.step('Verify core UI', async () => {
      await expect(await firefly.widget).toBeVisible();
      await expect(await firefly.inputField).toBeVisible();
      await expect(await firefly.generateButton).toBeVisible();
      // data-selected-verb set on wrap
      const selectedVerb = await firefly.widgetWrap.getAttribute('data-selected-verb');
      expect(selectedVerb).toBeTruthy();
    });

    await test.step('Generate flow with typed prompt (mocked)', async () => {
      await page.route(CONNECTOR_ENDPOINT_GLOB, async (route) => {
        const req = route.request();
        const body = req.postDataJSON();
        expect(body.payload?.workflow).toContain('text-to-');
        expect(['generate', 'prompt-suggestion']).toContain(body.payload?.action || body.action);
        // Return redirect URL
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://example.com/?ok=1' }) });
      });

      await firefly.inputField.fill('a beach at sunset, cinematic lighting');
      await firefly.generateButton.click();
      await page.waitForURL('**/example.com/**');
      await expect(page).toHaveURL(/example\.com/);
    });
  });
});

