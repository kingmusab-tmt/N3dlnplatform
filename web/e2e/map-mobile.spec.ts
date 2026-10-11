import { expect, test } from '@playwright/test';
import { PLAZA } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('on a phone, the result card collapses and taps on the map keep the result', async ({ page }) => {
  await page.goto('/map');
  await page.getByLabel('NIPOST postcode').fill(PLAZA.formatted);
  await page.getByRole('button', { name: 'Locate' }).click();

  const details = page.locator('#result-details');
  await expect(details.getByText(PLAZA.name)).toBeVisible();

  // Hide and show by hand.
  await page.getByRole('button', { name: 'Hide ▴' }).click();
  await expect(details).toBeHidden();
  await page.getByRole('button', { name: 'Details ▾' }).click();
  await expect(details).toBeVisible();

  // Wait for the fly-in, then drag the map: the card tucks itself away.
  await page.waitForTimeout(4000);
  const box = (await page.locator('canvas.mapboxgl-canvas').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.75;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 80, y - 40, { steps: 8 });
  await page.mouse.up();
  await expect(details).toBeHidden();
  await expect(page.getByText(PLAZA.formatted, { exact: true })).toBeVisible();

  // Taps around the map never replace the result with an error.
  for (const [fx, fy] of [
    [0.1, 0.6],
    [0.9, 0.55],
    [0.5, 0.9],
    [0.2, 0.95],
  ]) {
    await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(600);
  }
  await expect(page.getByText(/No mapped building/)).toHaveCount(0);
  await expect(page.locator('#result-details').or(page.getByRole('alert'))).not.toContainText('Lookup failed');
});
