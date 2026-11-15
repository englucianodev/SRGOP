import { expect } from '@playwright/test';

export const DEMO_PASSWORD = 'DemoSRGOP!2026';
export const USERS = {
  admin: 'admin@srgop.local',
  oficial: 'oficial@srgop.local',
  praca: 'praca@srgop.local',
};

export async function login(page, email, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: false }).first().fill(password);
  await page.locator('form button[type="submit"]').click();
}

export async function loginAs(page, user) {
  await login(page, USERS[user]);
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Opens a menu entry, using the drawer on narrow screens. */
export async function openMenu(page, name) {
  const toggle = page.getByRole('button', { name: 'Abrir menu' });
  if (await toggle.isVisible()) await toggle.click();
  await page
    .getByRole('navigation', { name: 'Menu principal' })
    .getByRole('link', { name })
    .click();
}
