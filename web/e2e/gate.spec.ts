import { expect, test } from '@playwright/test';
import { PLAZA, signInWithPhone } from './helpers';

test('mark and change a gate from My places', async ({ page, request }) => {
  // Tapping the map needs it rendered, which needs a Mapbox token.
  const health = await (await request.get('/api/v1/health')).json();
  test.skip(health.routing !== 'mapbox', 'Needs a Mapbox token to render the map.');

  // Sign in and claim the test building without a gate.
  await page.goto(`/login?next=${encodeURIComponent(`/?code=${PLAZA.code}`)}`);
  await signInWithPhone(page);
  await page.getByRole('button', { name: `This is my place: claim ${PLAZA.formatted}` }).click();
  await page.getByLabel('Name for this place').fill('E2E Gate test');
  await page.getByRole('button', { name: 'Claim', exact: true }).click();
  await expect(page.getByText('Claimed as “E2E Gate test”')).toBeVisible();

  // My places → Mark gate opens the map in gate mode.
  await page.goto('/account');
  const card = page.getByRole('listitem').first();
  await expect(card).toContainText('No gate marked');
  await card.getByRole('link', { name: 'Mark gate' }).click();
  await expect(page.getByText('Gate for “E2E Gate test”')).toBeVisible();
  await expect(page.getByText('Tap the map where riders should enter.')).toBeVisible();

  // The camera centres the building; tap just in front of it.
  await page.waitForTimeout(4000);
  const box = (await page.locator('.mapboxgl-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 40);
  await expect(page.getByText('Drag the G marker to adjust, then save.')).toBeVisible();
  await page.getByRole('button', { name: 'Save gate' }).click();

  // Back in My places, with the gate set and a Change gate button.
  await expect(page).toHaveURL(/\/account$/);
  await expect(card).toContainText('Gate marked');
  await expect(card.getByRole('link', { name: 'Change gate' })).toBeVisible();

  // Clean up.
  page.once('dialog', (d) => d.accept());
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('E2E Gate test')).toHaveCount(0);
});
