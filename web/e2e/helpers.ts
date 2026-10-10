import { expect, type Page } from '@playwright/test';

/** Test building loaded by fixtures.sql. */
export const PLAZA = { code: 'FC02E2EAA01', formatted: 'FC 02 E2E AA 01', name: 'E2E Plaza' };

/** Local Supabase signs this number in with a fixed code and sends no SMS (supabase/config.toml). */
export const TEST_PHONE = { typed: '0800 000 0001', e164: '+2348000000001', code: '123456' };

const MAILPIT = 'http://127.0.0.1:54324';

/** Signs in on /login with the local test phone number; ends wherever `next` points. */
export async function signInWithPhone(page: Page) {
  await page.getByRole('radio', { name: 'Phone' }).click();
  await page.getByLabel('Phone number').fill(TEST_PHONE.typed);
  // Supabase allows one code per number every few seconds; back-to-back tests can hit that.
  const sent = page.getByText(`sent to ${TEST_PHONE.e164}`);
  const tooSoon = page.getByRole('alert').filter({ hasText: 'Too many attempts' });
  for (let attempt = 1; ; attempt++) {
    await page.getByRole('button', { name: 'Text me a code' }).click();
    await expect(sent.or(tooSoon)).toBeVisible();
    if (await sent.isVisible()) break;
    if (attempt === 3) throw new Error('Still rate-limited requesting a sign-in code.');
    await page.waitForTimeout(6_000);
  }
  await page.getByLabel('Code').fill(TEST_PHONE.code);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/** The latest 6-digit sign-in code emailed to `email`, from local Supabase's test mailbox. */
export async function emailedCode(email: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(async () => {
      const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
      const body = await res.json();
      code = body.messages?.[0]?.Snippet?.match(/\b(\d{6})\b/)?.[1];
      return code;
    })
    .toBeTruthy();
  return code!;
}
