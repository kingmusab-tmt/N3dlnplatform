import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { emailedCode } from './helpers';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function sql(text: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

test('visits are counted with their duration, and an admin sees them on the dashboard', async ({ page, browser }) => {
  test.setTimeout(150_000);

  // A visitor spends ~20 s on two pages.
  const visitor = await browser.newContext();
  const v = await visitor.newPage();
  await v.goto('/');
  await v.waitForTimeout(3_000);
  await v.goto('/map');
  await v.waitForTimeout(17_000); // one 15-second heartbeat
  await visitor.close(); // pagehide sends the rest

  // Sign in by email; not an admin yet, so /admin doesn't exist for them.
  const email = `admin-e2e-${Date.now()}@example.com`;
  await page.goto('/login?next=/admin');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel('Code').fill(await emailedCode(email));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'This page could not be found.' })).toBeVisible();

  // Grant admin (what `npm run admin -- add` does), then the dashboard opens.
  await sql(`INSERT INTO admin_users (user_id) SELECT id FROM auth.users WHERE email = $1 ON CONFLICT DO NOTHING`, [email]);
  await page.goto('/admin?range=24h');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

  const tile = (label: string) => page.locator('div', { has: page.getByText(label, { exact: true }) }).last();
  await expect(tile('Visitors').getByText(/^[1-9]/).first()).toBeVisible();
  await expect(tile('Average visit')).toContainText(/\d+ s|\d+ min/);
  await expect(page.getByRole('img', { name: /Visitors per hour/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: '/map' }).first()).toBeVisible();

  // The visitor's 2-page visit, with time recorded.
  const { rows } = await sql(
    `SELECT pageviews, active_seconds FROM analytics_sessions WHERE entry_path = '/' ORDER BY started_at DESC LIMIT 1`,
  );
  expect(rows[0].pageviews).toBeGreaterThanOrEqual(2);
  expect(rows[0].active_seconds).toBeGreaterThanOrEqual(15);

  // API keys: create (shown once), then revoke.
  await page.getByRole('link', { name: 'API keys' }).click();
  const partner = `E2E Partner ${Date.now()}`;
  await page.getByLabel('Partner name').fill(partner);
  await page.getByRole('button', { name: 'Create key' }).click();
  await expect(page.getByRole('status').getByText(/^n3d_live_/)).toBeVisible();
  const row = page.getByRole('row', { name: new RegExp(partner) });
  await expect(row.getByText('Active')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: `Revoke key for ${partner}` }).click();
  await expect(row.getByText('Revoked')).toBeVisible();

  // Users list shows this account as an admin; the admin pages aren't counted as visits.
  await page.getByRole('link', { name: 'Users' }).click();
  await page.getByLabel('Search').fill(email);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('row', { name: new RegExp(email) }).getByText('Admin', { exact: true })).toBeVisible();
  const adminViews = await sql(`SELECT count(*)::int AS n FROM analytics_pageviews WHERE path LIKE '/admin%'`);
  expect(adminViews.rows[0].n).toBe(0);

  // Reports: the summary report and the raw visits download as CSV.
  await page.goto('/admin?range=24h');
  const [report] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: '↓ Visitor report' }).click()]);
  expect(report.suggestedFilename()).toMatch(/^visitor-report-24h-.*\.csv$/);
  const reportText = readFileSync((await report.path())!, 'utf8');
  expect(reportText).toContain('TMTechEasy Gate visitor report');
  expect(reportText).toMatch(/Average visit \(seconds\),\d+/);
  const [raw] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: '↓ Raw visits' }).click()]);
  expect(readFileSync((await raw.path())!, 'utf8')).toContain('Duration (seconds)');

  // Manual clean-up: a year-old visit is deleted, recent ones stay.
  const old = await sql(
    `INSERT INTO analytics_sessions (id, visitor_id, started_at, last_seen_at, entry_path, device)
     VALUES (gen_random_uuid(), gen_random_uuid(), now() - interval '400 days', now() - interval '400 days', '/old', 'desktop') RETURNING id`,
  );
  await page.reload();
  await page.getByLabel('Visit data to delete').selectOption({ label: 'Older than 1 year' });
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText(/^Deleted 1 visit \(/)).toBeVisible();
  expect((await sql('SELECT 1 FROM analytics_sessions WHERE id = $1', [old.rows[0].id])).rowCount).toBe(0);
  expect((await sql(`SELECT count(*)::int AS n FROM analytics_sessions WHERE started_at > now() - interval '1 day'`)).rows[0].n).toBeGreaterThan(0);

  await sql(`DELETE FROM admin_users WHERE user_id = (SELECT id FROM auth.users WHERE email = $1)`, [email]);
});
