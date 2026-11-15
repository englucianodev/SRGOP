import { expect, test } from '@playwright/test';
import { loginAs, openMenu } from './helpers.js';

test('officer registers an occurrence and receives a 5-digit number', async ({ page }) => {
  await loginAs(page, 'oficial');
  await openMenu(page, 'Ocorrências');
  await page.getByRole('button', { name: 'Nova ocorrência' }).click();

  const form = page.getByRole('dialog');
  await expect(form.getByText('00001-DDMMAAAA')).toBeVisible();
  await form.getByLabel('Município').selectOption({ index: 1 });
  const crime = form.getByRole('combobox', { name: /tipo de crime/i });
  await crime.fill('furt');
  await crime.press('Enter');
  await expect(crime).toHaveValue('Furto');
  const address = `Rua do Teste E2E, ${Date.now()}`;
  await form.getByLabel('Endereço / localização').fill(address);
  await form
    .getByLabel('Descrição detalhada')
    .fill('Ocorrência criada pelo teste automatizado E2E.');
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/occurrences') && r.request().method() === 'POST',
  );
  await form.getByRole('button', { name: 'Registrar' }).click();

  const response = await created;
  expect(response.status()).toBeLessThan(300);
  const occurrence = await response.json();
  expect(occurrence.protocol).toMatch(/^\d{5}-\d{8}$/);

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(occurrence.protocol).first()).toBeVisible();
});

test('rejects a crime type that is not in the list', async ({ page }) => {
  await loginAs(page, 'oficial');
  await openMenu(page, 'Ocorrências');
  await page.getByRole('button', { name: 'Nova ocorrência' }).click();

  const form = page.getByRole('dialog');
  await form.getByRole('combobox', { name: /tipo de crime/i }).fill('crime inventado xyz');
  await expect(form.getByText(/nenhum crime encontrado/i)).toBeVisible();
  const valid = await form
    .getByRole('combobox', { name: /tipo de crime/i })
    .evaluate((el) => el.checkValidity());
  expect(valid).toBe(false);
});
