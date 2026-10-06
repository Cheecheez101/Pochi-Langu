import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Authentication required' }) });
  });
});

async function mockAuthenticatedUser(page: Page, role: 'user' | 'admin') {
  await page.unroute('**/api/v1/auth/me');
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, user: { id: `${role}-1`, phone: '0712345678', displayName: role === 'admin' ? 'Admin User' : 'Regular User', role } }),
    });
  });
}

test('visitor can view the landing page and registration form', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /build better money habits/i })).toBeVisible();
  await page.getByRole('link', { name: /create account/i }).first().click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible();
});

test('invalid registration remains on the form with accessible validation', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByLabel('Kenyan mobile number')).toBeVisible();
});

test('unauthenticated visitors are redirected from the protected dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /^sign in$/i })).toBeVisible();
});

test('regular user gets user navigation and cannot access admin pages', async ({ page }) => {
  await mockAuthenticatedUser(page, 'user');
  await page.goto('/dashboard');
  if ((page.viewportSize()?.width ?? 1280) < 700) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
  }
  await expect(page.getByRole('navigation', { name: 'Account navigation' })).toContainText('Dashboard');
  await expect(page.getByRole('navigation', { name: 'Account navigation' })).toContainText('Profile');
  await expect(page.getByRole('link', { name: 'Admin workspace' })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('administrator gets admin navigation and read-only links', async ({ page }) => {
  await mockAuthenticatedUser(page, 'admin');
  await page.route('**/api/v1/admin/dashboard', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ statistics: { users: 3, activeSessions: 1 } }) });
  });
  await page.goto('/admin');
  if ((page.viewportSize()?.width ?? 1280) < 700) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
  }
  const navigation = page.getByRole('navigation', { name: 'Administrator navigation' });
  await expect(navigation).toContainText('Overview');
  await expect(navigation).toContainText('Users');
  await expect(navigation).toContainText('Transactions');
  await expect(navigation).toContainText('Security');
  await expect(page.getByText('Registered users')).toBeVisible();
});

test('logout removes access to protected pages', async ({ page }) => {
  await mockAuthenticatedUser(page, 'user');
  await page.route('**/api/v1/auth/logout', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/dashboard');
  if ((page.viewportSize()?.width ?? 1280) < 700) {
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
  }
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.unroute('**/api/v1/auth/me');
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Authentication required' }) });
  });
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);
});

test('mobile navigation opens and exposes the role-specific links', async ({ page }) => {
  await mockAuthenticatedUser(page, 'admin');
  await page.route('**/api/v1/admin/dashboard', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ statistics: { users: 0, activeSessions: 0 } }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.getByRole('navigation', { name: 'Administrator navigation' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'User workspace' })).toBeVisible();
});

test('authenticated user can view the wallet and deposit flow', async ({ page }) => {
  await mockAuthenticatedUser(page, 'user');
  await page.route('**/api/v1/wallet', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, wallet: { id: 'wallet-1', currency: 'KES', availableMinor: '12500', lockedMinor: '0', pendingMinor: '0', status: 'active' } }),
    });
  });
  await page.route('**/api/v1/deposits', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, deposits: [] }),
    });
  });
  await page.goto('/wallet');
  await expect(page.getByRole('heading', { name: 'Your wallet' })).toBeVisible();
  await expect(page.getByText('KES 125.00')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start a deposit' })).toBeVisible();
});
