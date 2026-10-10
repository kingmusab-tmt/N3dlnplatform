import { expect, test, type Page } from '@playwright/test';
import { PLAZA } from './helpers';

const START = { longitude: 7.4757, latitude: 9.0768 };
const HOUSE = 'FC 02 E2E AA 02';
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test.use({ geolocation: { ...START, accuracy: 8 }, permissions: ['geolocation'] });

const runFrom = (page: Page) => {
  const url = new URL(page.url());
  return { id: url.searchParams.get('run')!, token: new URLSearchParams(url.hash.slice(1)).get('token')! };
};

test('losing signal mid-run: proof is saved on the phone, navigation continues, and it uploads when back online', async ({
  page,
  context,
  request,
}) => {
  const health = await (await request.get('/api/v1/health')).json();
  test.skip(health.routing !== 'mapbox', 'Needs a Mapbox token for routing.');

  // A two-stop run, started with a connection.
  await page.goto(`/rider?code=${PLAZA.code}`);
  await page.getByLabel('Add a stop').fill(HOUSE);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Start delivery · 2 stops' }).click();
  await expect(page).toHaveURL(/\/rider\?run=/);
  const run = runFrom(page);
  const stops = (await (await request.get(`/api/v1/runs/${run.id}`, { headers: { 'X-Rider-Token': run.token } })).json()).stops;

  // Signal drops.
  await context.setOffline(true);
  await expect(page.getByText(/^Offline\. Navigation continues/)).toBeVisible();

  // Arrive at stop 1 and confirm with a photo: saved on the phone instead.
  const [lng, lat] = stops[0].destination.point;
  await context.setGeolocation({ longitude: lng - 0.0004, latitude: lat, accuracy: 8 });
  await page.waitForTimeout(1200);
  await context.setGeolocation({ longitude: lng, latitude: lat, accuracy: 8 });
  await expect(page.getByText('You’ve arrived at stop 1')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'door.png', mimeType: 'image/png', buffer: PHOTO });
  await page.getByRole('button', { name: 'Confirm delivery' }).click();
  await expect(page.getByText(/delivery saved on this phone/)).toBeVisible();
  await expect(page.getByText('1 delivery proof waiting to upload.')).toBeVisible();

  // Still offline, the app moves on to stop 2 with straight-line guidance.
  await context.setGeolocation({ longitude: lng + 0.0003, latitude: lat + 0.0003, accuracy: 8 });
  await expect(page.getByText('Offline: head towards the destination')).toBeVisible();

  // The server hasn't heard yet...
  const before = await (await request.get(new URL(stops[0].tracking_url).pathname.replace('/t/', '/api/v1/track/'))).json();
  expect(before.delivery.status).not.toBe('delivered');

  // ...until the signal returns: the saved proof uploads by itself.
  await context.setOffline(false);
  await expect(page.getByText('Back online: sent 1 saved delivery proof.')).toBeVisible();
  const after = await (await request.get(new URL(stops[0].tracking_url).pathname.replace('/t/', '/api/v1/track/'))).json();
  expect(after.delivery).toMatchObject({ status: 'delivered', pod_method: 'photo', has_photo: true });
});
