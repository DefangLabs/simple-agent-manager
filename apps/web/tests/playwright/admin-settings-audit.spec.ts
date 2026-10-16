import { expect, test } from '@playwright/test';

import { assertNoOverflow, makeMockUser, screenshot } from './audit-helpers';
const user = makeMockUser({
  email: 'operator@example.com',
  name: 'Operator',
  role: 'superadmin',
  sessionId: 'settings-session',
  userId: 'settings-admin',
});
const makeSettings = () =>
  Array.from({ length: 32 }, (_, i) => ({
    name: `connector.stressSetting${i}`,
    type: i === 0 ? 'boolean' : 'string',
    defaultValue: i === 0 ? true : '',
    value: i === 0 ? true : '<script>alert("x")</script> & Unicode 🔒 ' + 'long-value-'.repeat(25),
    category: i < 16 ? 'Connector' : 'Operations',
    description: 'Long operator description with Unicode 🔒 & <script>inert text</script>. '.repeat(
      4
    ),
    secret: false,
    risky: true,
    configured: true,
    source: 'database',
    updatedAt: null,
    updatedBy: null,
  }));
test('settings real app stress, search, risky confirmation and error recovery', async ({
  page,
}) => {
  page.on('pageerror', (error) => console.error('Browser error:', error.message));
  await page.addInitScript(() => localStorage.setItem('sam-onboarding-wizard-dismissed-settings-admin', 'true'));
  let fail = false;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/credentials' || path === '/api/github/installations') return route.fulfill({json: []});
    if (path === '/api/credentials/agent') return route.fulfill({json: {credentials: []}});
    if (path === '/api/trial-status') return route.fulfill({json: {isTrial: false}});
    if (path === '/api/dashboard/active-tasks') return route.fulfill({json: {tasks: []}});
    let body: unknown = {};
    if (path.includes('/auth/get-session')) body = user;
    else if (path === '/api/admin/settings') {
      if (route.request().method() === 'PATCH') {
        fail = true;
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'CONFLICT', message: 'stale' }),
        });
      }
      body = {
        revision: fail ? 2 : 1,
        settings: makeSettings(),
        history: [
          {
            name: 'connector.enabled',
            action: 'set',
            actorUserId: 'operator-' + 'x'.repeat(220),
            createdAt: '2026-10-16T10:00:00Z',
            revision: 1,
          },
        ],
      };
    } else if (path === '/api/projects') body = { projects: [], nextCursor: null };
    else if (path === '/api/notifications/unread-count') body = { count: 0 };
    else if (path === '/api/notifications')
      body = { notifications: [], unreadCount: 0, nextCursor: null };
    else if (path === '/api/setup/status')
      body = { completed: true, open: false, forced: false, tokenConfigured: true };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  await page.goto('/admin/settings');

  await expect(page.getByRole('heading', { name: 'Runtime settings' })).toBeVisible();
  await expect(page.locator('article')).toHaveCount(32);
  await assertNoOverflow(page);
  await screenshot(page, 'admin-settings-stress');
  await page.getByRole('searchbox').fill('stressSetting0');
  await page.getByLabel('connector · stress Setting0').selectOption('false');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await assertNoOverflow(page);
  await screenshot(page, 'admin-settings-confirmation');
  await page.getByRole('button', { name: 'Apply change' }).click();
  await expect(page.getByRole('alert')).toContainText('Settings changed');
  await screenshot(page, 'admin-settings-conflict');
  await page.getByRole('button', { name: 'Reload current settings' }).click();
  await expect(page.getByText('1 settings · Revision 2')).toBeVisible();
  await expect(page.getByLabel('connector · stress Setting0')).toHaveValue('false');
  await page.getByRole('searchbox').fill('missing setting');
  await expect(page.getByText('No settings match your search.')).toBeVisible();
  await assertNoOverflow(page);
  await screenshot(page, 'admin-settings-empty');
  if (test.info().project.name.startsWith('iPhone SE')) {
    await page.setViewportSize({width: 320, height: 667});
    await page.getByRole('searchbox').fill('stressSetting0');
    await page.getByRole('button', {name: 'Save', exact: true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await assertNoOverflow(page);
    await screenshot(page, 'admin-settings-confirmation-narrow');
  }
});
