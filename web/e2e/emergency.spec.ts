import { expect, test } from '@playwright/test';
import { PLAZA } from './helpers';

const START = { longitude: 7.4757, latitude: 9.0768 };

test.use({ geolocation: { ...START, accuracy: 8 }, permissions: ['geolocation'] });

test('the map offers responder directions, and ambulance mode navigates to the gate without a delivery run', async ({
  page,
  context,
  request,
}) => {
  const health = await (await request.get('/api/v1/health')).json();
  test.skip(health.routing !== 'mapbox', 'Needs a Mapbox token for routing.');

  // From a building on the map, pick Ambulance.
  await page.goto(`/map?code=${PLAZA.code}`);
  await expect(page.getByText('Directions for responders')).toBeVisible();
  await page.getByRole('link', { name: /Ambulance/ }).click();
  await expect(page).toHaveURL(new RegExp(`/rider\\?code=${PLAZA.code}&for=ambulance`));

  // Emergency mode: road only, no stops or tracking links, and a reminder to call 112.
  await expect(page.getByRole('radio', { name: /Ambulance/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/Directions only: this does not call an ambulance/)).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Travel mode' })).toHaveCount(0);
  await expect(page.getByLabel('Add a stop')).toHaveCount(0);

  const runsCreated: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/v1/runs')) runsCreated.push(r.url());
  });

  await page.getByRole('button', { name: /Start emergency navigation/ }).click();
  await expect(page.getByText('Ambulance crew · responding · live GPS')).toBeVisible();
  await expect(page.getByRole('button', { name: 'End', exact: true })).toBeVisible();

  const route = await (
    await request.get(`/api/v1/navigate/${PLAZA.code}/route?from=${START.longitude},${START.latitude}&profile=driving`, {
      headers: { 'sec-fetch-site': 'same-origin' },
    })
  ).json();
  const [dlng, dlat] = route.destination.point;
  await context.setGeolocation({ longitude: dlng - 0.0004, latitude: dlat, accuracy: 8 });
  await page.waitForTimeout(1200);
  await context.setGeolocation({ longitude: dlng, latitude: dlat, accuracy: 8 });

  // Arrival: no proof of delivery, and no run was created.
  await expect(page.getByText(/Arrived at the (gate|building)/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm delivery' })).toHaveCount(0);
  expect(runsCreated).toEqual([]);
  await page.getByRole('button', { name: 'Done' }).click();
});

test('switching back to Delivery restores stops and travel modes', async ({ page }) => {
  await page.goto(`/rider?code=${PLAZA.code}&for=fire`);
  await expect(page.getByText(/Fire service · navigator/)).toBeVisible();
  await page.getByRole('radio', { name: /Delivery/ }).click();
  await expect(page).not.toHaveURL(/for=/);
  await expect(page.getByRole('radiogroup', { name: 'Travel mode' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start delivery' })).toBeVisible();
});
