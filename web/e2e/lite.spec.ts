import { expect, test } from '@playwright/test';
import { PLAZA } from './helpers';

test('switch to the lite map and back; the choice is remembered', async ({ page }) => {
  await page.goto(`/map?code=${PLAZA.code}`);
  await expect(page.getByText(PLAZA.name)).toBeVisible();
  const detail = page.getByRole('radiogroup', { name: 'Map detail' });
  await expect(detail.getByRole('radio', { name: /^3D/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Lighting' })).toBeVisible();

  // Lite reloads the same building, without the lighting choices.
  await detail.getByRole('radio', { name: /^Lite/ }).click();
  await expect(page).toHaveURL(new RegExp(`\\?code=${PLAZA.code}`));
  await expect(page.getByText(PLAZA.name)).toBeVisible();
  await expect(detail.getByRole('radio', { name: 'Lite' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radiogroup', { name: 'Lighting' })).toHaveCount(0);

  // Remembered across pages.
  await page.goto(`/rider?code=${PLAZA.code}`);
  await expect(page.getByRole('radiogroup', { name: 'Map detail' }).getByRole('radio', { name: 'Lite' })).toHaveAttribute('aria-checked', 'true');

  // And back to 3D.
  await page.goto(`/map?code=${PLAZA.code}`);
  await page.getByRole('radiogroup', { name: 'Map detail' }).getByRole('radio', { name: '3D' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Lighting' })).toBeVisible();
});

test.describe('on a data-saver phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '3g' } });
    });
  });

  test('uses the lite map automatically', async ({ page }) => {
    await page.goto('/map');
    await expect(page.getByRole('radiogroup', { name: 'Map detail' }).getByRole('radio', { name: 'Lite · auto' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
