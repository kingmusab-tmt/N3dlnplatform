import { expect, test } from '@playwright/test';
import { PLAZA, emailedCode, signInWithPhone } from './helpers';

test('sign in by phone, claim a building, share it, and manage it in My places', async ({ page, request }) => {
  // Signed out: claiming needs an account.
  await page.goto(`/?code=${PLAZA.code}`);
  await page.getByRole('link', { name: `Sign in to claim ${PLAZA.formatted}` }).click();

  // Phone sign-in returns to the same building.
  await expect(page).toHaveURL(/\/login/);
  await signInWithPhone(page);
  await expect(page).toHaveURL(new RegExp(`\\?code=${PLAZA.code}`));
  await expect(page.getByRole('link', { name: 'My places' })).toBeVisible();

  // Claim it.
  await page.getByRole('button', { name: `This is my place: claim ${PLAZA.formatted}` }).click();
  await page.getByLabel('Name for this place').fill('E2E Office');
  await page.getByLabel(/Delivery notes/).fill('Blue gate');
  await page.getByRole('button', { name: 'Claim', exact: true }).click();
  await expect(page.getByText('Claimed as “E2E Office”')).toBeVisible();
  const firstLink = (await page.locator('a[href*="/h/"]').first().getAttribute('href'))!;

  // The share page works, and Directions opens our own navigation for that claim.
  await page.goto(firstLink);
  await expect(page.getByRole('heading', { name: 'E2E Office' })).toBeVisible();
  const directions = await page.getByRole('link', { name: 'Directions' }).getAttribute('href');
  expect(directions).toMatch(new RegExp(`^/rider\\?code=${PLAZA.code}&claim=[0-9a-f-]{36}$`));
  await expect(page.getByRole('link', { name: 'Open in Google Maps instead' })).toBeVisible();

  // My places: edit, replace the link (the old one dies), delete.
  await page.goto('/account');
  // Newest first; pinned by position because edit mode moves the name into an input.
  const card = page.getByRole('listitem').first();
  await expect(card).toContainText('E2E Office');

  await card.getByRole('button', { name: 'Edit' }).click();
  await card.getByLabel('Delivery notes').fill('Blue gate, ring twice');
  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByText('Blue gate, ring twice')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await card.getByRole('button', { name: 'New link' }).click();
  await expect(card.getByText('New link created')).toBeVisible();
  const newLink = (await card.getByRole('link', { name: 'Open link' }).getAttribute('href'))!;
  expect(newLink).not.toBe(new URL(firstLink, page.url()).pathname);
  expect((await request.get(firstLink)).status()).toBe(404);
  expect((await request.get(newLink)).status()).toBe(200);

  page.once('dialog', (d) => d.accept());
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('E2E Office')).toHaveCount(0);

  // Signing out goes back to the map, signed out.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('sign in by email with a 6-digit code', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto('/login?next=/account');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByText(`sent to ${email}`)).toBeVisible();

  await page.getByLabel('Code').fill(await emailedCode(email));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
});

test('rejects a wrong code', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('radio', { name: 'Phone' }).click();
  await page.getByLabel('Phone number').fill('0800 000 0001');
  await page.getByRole('button', { name: 'Text me a code' }).click();
  await page.getByLabel('Code').fill('000000');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'wrong or has expired' })).toBeVisible();
});
