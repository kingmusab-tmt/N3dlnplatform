import { expect, test } from '@playwright/test';
import { PLAZA } from './helpers';

// Starts ~1.5 km north-west of the E2E Plaza, like the app's simulated rider.
const START = { longitude: 7.4757, latitude: 9.0768 };

test.use({ geolocation: { ...START, accuracy: 8 }, permissions: ['geolocation'] });

test('Start delivery follows GPS turn by turn, re-routes, and detects arrival', async ({ page, context, request }) => {
  const health = await (await request.get('/api/v1/health')).json();
  test.skip(health.routing !== 'mapbox', 'Routing needs a Mapbox token (MAPBOX_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN).');

  await page.goto(`/rider?code=${PLAZA.code}`);
  await expect(page.getByRole('button', { name: 'Start delivery' })).toBeVisible();
  await page.getByRole('button', { name: 'Start delivery' }).click();
  await expect(page.getByText('Delivering · live GPS')).toBeVisible();

  // Drive along the route the app itself uses.
  const route = await (
    await request.get(`/api/v1/navigate/${PLAZA.code}/route?from=${START.longitude},${START.latitude}&profile=driving`, {
      headers: { 'sec-fetch-site': 'same-origin' },
    })
  ).json();
  const coords: [number, number][] = route.route.geometry.coordinates;
  const at = (f: number) => coords[Math.floor(f * (coords.length - 1))];

  for (const f of [0.1, 0.2, 0.3]) {
    const [longitude, latitude] = at(f);
    await context.setGeolocation({ longitude, latitude, accuracy: 8 });
    await page.waitForTimeout(1200);
  }
  await expect(page.getByText(/ left$/)).toBeVisible(); // "x km left"
  await expect(page.getByRole('button', { name: 'End run' })).toBeVisible();

  // Wander well off the route: the app re-routes (after 3 off-route fixes, at
  // most every 15 s, so keep moving until it does).
  const routeRequests = () => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.name.includes('/route?from=')).length);
  const before = await routeRequests();
  const [olng, olat] = at(0.4);
  let rerouted = false;
  for (let i = 0; i < 25 && !rerouted; i++) {
    // A slightly different position each time, so the browser reports a new fix.
    await context.setGeolocation({ longitude: olng + 0.0012 + i * 0.00001, latitude: olat + 0.0012, accuracy: 8 });
    await page.waitForTimeout(1000);
    rerouted = (await routeRequests()) > before;
  }
  expect(rerouted).toBe(true);

  // Arrive at the building.
  const [dlng, dlat] = route.destination.point;
  await context.setGeolocation({ longitude: dlng, latitude: dlat, accuracy: 8 });
  // Arrival opens proof of delivery for the stop.
  await expect(page.getByText('You’ve arrived at stop 1')).toBeVisible();
});

test('Simulate ride animates without GPS', async ({ page, request }) => {
  const health = await (await request.get('/api/v1/health')).json();
  test.skip(health.routing !== 'mapbox', 'Routing needs a Mapbox token.');

  await page.goto(`/rider?code=${PLAZA.code}`);
  await page.getByRole('radio', { name: 'Walk' }).click();
  await page.getByRole('button', { name: 'Simulate ride' }).click();
  await expect(page.getByText(/ to go$/)).toBeVisible();
  await expect(page.getByLabel('Rider on foot')).toBeVisible();
});
