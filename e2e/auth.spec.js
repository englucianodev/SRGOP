import { expect, test } from '@playwright/test';
import { login, loginAs, openMenu } from './helpers.js';

test('redirects anonymous visitors to the login page', async ({ page }) => {
  await page.goto('/ocorrencias');
  await expect(page).toHaveURL(/\/login$/);
});

test('rejects a wrong password and stays on the login page', async ({ page }) => {
  await login(page, 'admin@srgop.local', 'senha-errada-123');
  await expect(page).toHaveURL(/\/login$/);
});

test('admin logs in, reaches the dashboard and logs out', async ({ page }) => {
  await loginAs(page, 'admin');
  await openMenu(page, 'Ocorrências');
  await expect(page).toHaveURL(/\/ocorrencias$/);

  const toggle = page.getByRole('button', { name: 'Abrir menu' });
  if (await toggle.isVisible()) await toggle.click();
  await page
    .getByRole('button', { name: /sair do sistema/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /sair/i }).last().click();
  await expect(page).toHaveURL(/\/login$/);
});

test('Praça cannot open officer-only pages', async ({ page }) => {
  await loginAs(page, 'praca');
  await page.goto('/relatorios');
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Relatórios' })).toHaveCount(0);
});
