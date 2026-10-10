import { expect, test } from '@playwright/test';
import { PLAZA } from './helpers';

test('landing page explains the product and opens the map on a postcode', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('down to the gate');
  for (const section of ['One address system, four kinds of trip', 'How it works', 'Everything between the postcode and the front gate', 'Who it’s for', 'An API for logistics, e-commerce and control rooms']) {
    await expect(page.getByRole('heading', { name: section })).toBeVisible();
  }
  await expect(page.getByText('not operated by or affiliated with NIPOST')).toBeVisible();
  await expect(page.getByText('it does not alert or dispatch emergency services')).toBeVisible();

  // The try-box rejects junk and opens the map on a real code.
  await page.getByLabel('NIPOST postcode').fill('hello');
  await page.getByRole('button', { name: 'Find it' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'isn’t a NIPOST postcode' })).toBeVisible();

  await page.getByLabel('NIPOST postcode').fill('fc 02 e2e aa 01');
  await page.getByRole('button', { name: 'Find it' }).click();
  await expect(page).toHaveURL(new RegExp(`/map\\?code=${PLAZA.code}`));
  await expect(page.getByText(PLAZA.name)).toBeVisible();
});

test('old map links (/?code=…) still work', async ({ page }) => {
  await page.goto(`/?code=${PLAZA.code}`);
  await expect(page).toHaveURL(new RegExp(`/map\\?code=${PLAZA.code}`));
  await expect(page.getByText(PLAZA.name)).toBeVisible();
});
