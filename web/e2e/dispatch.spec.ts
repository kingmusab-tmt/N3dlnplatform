import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { PLAZA } from './helpers';

const START = { longitude: 7.4757, latitude: 9.0768 };
const HOUSE = { code: 'FC02E2EAA02', formatted: 'FC 02 E2E AA 02' };
// A 1×1 PNG: stands in for the rider's camera photo.
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test.use({ geolocation: { ...START, accuracy: 8 }, permissions: ['geolocation'] });

/** The run id and rider token from the Rider View's URL (?run=…#token=…). */
function runFrom(page: Page) {
  const url = new URL(page.url());
  return { id: url.searchParams.get('run')!, token: new URLSearchParams(url.hash.slice(1)).get('token')! };
}

async function driveTo(context: BrowserContext, page: Page, point: [number, number]) {
  // Two fixes near the stop, then on it: the app needs a moving position to report.
  await context.setGeolocation({ longitude: point[0] - 0.0004, latitude: point[1], accuracy: 8 });
  await page.waitForTimeout(1200);
  await context.setGeolocation({ longitude: point[0], latitude: point[1], accuracy: 8 });
}

test('a two-stop run: tracking links, live position, photo proof of delivery, next stop', async ({ page, context, request }) => {
  const health = await (await request.get('/api/v1/health')).json();
  test.skip(health.routing !== 'mapbox', 'Needs a Mapbox token for routing.');

  // Plan: the plaza, plus a second stop, in the best order.
  await page.goto(`/rider?code=${PLAZA.code}`);
  await expect(page.getByRole('button', { name: 'Start delivery' })).toBeVisible();
  await page.getByLabel('Add a stop').fill(HOUSE.formatted);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(HOUSE.formatted)).toBeVisible();
  await page.getByLabel(/Best order/).check();
  await page.getByRole('button', { name: 'Start delivery · 2 stops' }).click();

  // The run exists: the URL resumes it, and each customer has a tracking link.
  await expect(page).toHaveURL(/\/rider\?run=[0-9a-f-]{36}#token=/);
  await expect(page.getByText('Customer tracking links · 0/2 delivered')).toBeVisible();
  const run = runFrom(page);
  const stops = (await (await request.get(`/api/v1/runs/${run.id}`, { headers: { 'X-Rider-Token': run.token } })).json()).stops;
  expect(stops).toHaveLength(2);

  // The first customer sees the rider coming; the second waits their turn.
  await context.setGeolocation({ longitude: START.longitude + 0.001, latitude: START.latitude - 0.001, accuracy: 8 });
  const first = await context.newPage();
  await first.goto(new URL(stops[0].tracking_url).pathname);
  await expect(first.getByRole('heading', { name: 'Your rider is on the way' })).toBeVisible();
  const second = await context.newPage();
  await second.goto(new URL(stops[1].tracking_url).pathname);
  await expect(second.getByText('The rider has 1 delivery before yours')).toBeVisible();

  // Arrive at stop 1: proof of delivery by photo.
  await driveTo(context, page, stops[0].destination.point);
  await expect(page.getByText('You’ve arrived at stop 1')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: PHOTO });
  await page.getByLabel('Received by (optional)').fill('Mr Ade');
  await page.getByRole('button', { name: 'Confirm delivery' }).click();

  // On to stop 2 automatically.
  await expect(page.getByText('Customer tracking links · 1/2 delivered')).toBeVisible();
  await expect(page.getByText('Delivering · live GPS')).toBeVisible();
  await first.reload();
  await expect(first.getByRole('heading', { name: 'Delivered' })).toBeVisible();
  await expect(first.getByText('received by Mr Ade')).toBeVisible();
  await expect(first.getByAltText('Photo taken by the rider at delivery')).toBeVisible();

  await driveTo(context, page, stops[1].destination.point);
  await expect(page.getByText('You’ve arrived at stop 2')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: PHOTO });
  await page.getByRole('button', { name: 'Confirm delivery' }).click();
  await expect(page.getByText('All deliveries done ✓')).toBeVisible();
  await expect(page.getByText('2 of 2 stops delivered.')).toBeVisible();
});

test('a tracking link that does not exist shows not found', async ({ page }) => {
  const res = await page.goto('/t/00000000-0000-0000-0000-000000000000');
  expect(res?.status()).toBe(404);
});
