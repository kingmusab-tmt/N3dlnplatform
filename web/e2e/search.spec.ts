import { expect, test } from '@playwright/test';
import { PLAZA } from './helpers';

test('finds a building by postcode, in any spelling', async ({ page }) => {
  await page.goto('/map');
  await page.getByLabel('NIPOST postcode').fill('fc-02-e2e-aa-01');
  await page.getByRole('button', { name: 'Locate' }).click();
  await expect(page.getByText(PLAZA.formatted, { exact: true })).toBeVisible();
  await expect(page.getByText(PLAZA.name)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Rider view: route a delivery here' })).toBeVisible();
});

test('opens a building straight from a ?code= link', async ({ page }) => {
  await page.goto(`/map?code=${PLAZA.code}`);
  await expect(page.getByText(PLAZA.name)).toBeVisible();
});

test('explains malformed and unknown postcodes', async ({ page }) => {
  await page.goto('/map');
  await page.getByLabel('NIPOST postcode').fill('not a code');
  await page.getByRole('button', { name: 'Locate' }).click();
  // (Next.js also renders an empty role="alert" route announcer, so match by text.)
  await expect(page.getByRole('alert').filter({ hasText: '11-character NIPOST code' })).toBeVisible();

  await page.getByLabel('NIPOST postcode').fill('FC 02 E2E ZZ 99');
  await page.getByRole('button', { name: 'Locate' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'FC 02 E2E ZZ 99' })).toBeVisible();
});

test('serves the API docs', async ({ page }) => {
  await page.goto('/api/v1/docs');
  await expect(page.getByText('TMTechEASY Delivery API').first()).toBeVisible();
});
