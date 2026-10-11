import { expect, test } from '@playwright/test';
import pg from 'pg';
import { emailedCode } from './helpers';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function userExists(email: string) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query('SELECT 1 FROM auth.users WHERE email = $1', [email])).rowCount === 1;
  } finally {
    await client.end();
  }
}

test('the privacy notice is linked from the site and the sign-in page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Privacy notice' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
  for (const section of ['What we collect and why', 'Cookies and storage on your device', 'Your location', 'Your rights']) {
    await expect(page.getByRole('heading', { name: section })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: /Nigeria Data Protection Commission/ })).toBeVisible();

  await page.goto('/login');
  await expect(page.getByRole('link', { name: 'privacy notice' })).toHaveAttribute('href', '/privacy');
  // CAPTCHA is on locally (Cloudflare's always-pass test key): the widget shows,
  // and sending a code is only possible once it has passed.
  await expect(page.getByLabel('Security check')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeEnabled();
});

test('a user can delete their own account', async ({ page }) => {
  const email = `delete-me-${Date.now()}@example.com`;
  await page.goto('/login?next=/account');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel('Code').fill(await emailedCode(email));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My places' })).toBeVisible();
  expect(await userExists(email)).toBe(true);

  await page.getByRole('button', { name: 'Delete my account…' }).click();
  const confirm = page.getByRole('button', { name: 'Delete account' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await confirm.click();

  await expect(page).toHaveURL(/\/\?account=deleted$/);
  expect(await userExists(email)).toBe(false);
});
