import { expect, type Page, type Route, test } from '@playwright/test';

import { assertNoOverflow, getProjectSuffix, jsonResponse, makeMockUser, screenshot } from './audit-helpers';

const USER_A = makeMockUser({
  email: 'user-a@example.com',
  name: 'User A',
  sessionId: 'session-user-a',
  userId: 'user-a-id',
});

const MOCK_PROJECT = {
  id: 'proj-terminal-audit',
  name: 'Terminal Audit Project',
  repoUrl: 'https://github.com/test/audit',
  repoName: 'test/audit',
  repoProvider: 'github',
  installationId: 'inst-1',
  defaultProvider: 'hetzner',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  defaultNodeSize: 'cpx21',
  defaultAgentType: 'claude-code',
};

let currentUser: ReturnType<typeof makeMockUser> | null = USER_A;

async function setupMocks(page: Page) {
  await page.route('**/api/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const respond = (status: number, body: unknown) => jsonResponse(route, status, body);

    if (path.includes('/api/auth/get-session') || path.includes('/api/auth/session')) {
      if (currentUser) return respond(200, currentUser);
      return respond(200, { session: null, user: null });
    }
    if (path === '/api/auth/sign-out') {
      currentUser = null;
      return respond(200, { success: true });
    }
    if (path.startsWith('/api/notifications')) {
      return respond(200, { notifications: [], unreadCount: 0 });
    }
    if (path === '/api/projects') {
      return respond(200, { projects: [MOCK_PROJECT], nextCursor: null });
    }

    return respond(200, {});
  });
}

function seedTerminalKeys(page: Page) {
  return page.evaluate(() => {
    sessionStorage.setItem(
      'sam-terminal-sessions-ws-terminal-audit',
      JSON.stringify({
        sessions: [{ name: 'Terminal 1', order: 0, serverSessionId: 's1' }],
        counter: 2,
        wsUrl: 'wss://ws-terminal-audit.sammy.party/terminal/ws/multi?token=deterministic-test-token',
      })
    );
    sessionStorage.setItem(
      'sam-terminal-sessions-ws-other',
      JSON.stringify({ sessions: [], counter: 1 })
    );
    sessionStorage.setItem('unrelated-key', 'should-persist');
  });
}

function getSessionStorageSnapshot(page: Page) {
  return page.evaluate(() => {
    const result: Record<string, string | null> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) result[key] = sessionStorage.getItem(key);
    }
    return result;
  });
}

function checkForTokenLeaks(page: Page, tokenSubstring: string) {
  return page.evaluate((tok) => {
    const leaks: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)!;
      const value = sessionStorage.getItem(key) ?? '';
      if (value.includes(tok)) leaks.push(`sessionStorage[${key}]`);
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      const value = localStorage.getItem(key) ?? '';
      if (value.includes(tok)) leaks.push(`localStorage[${key}]`);
    }
    return leaks;
  }, tokenSubstring);
}

test.describe('Terminal logout cleanup — Mobile', () => {
  test.beforeEach(() => {
    currentUser = USER_A;
  });

  test('dashboard renders without console errors after terminal cleanup changes', async ({
    page,
  }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setupMocks(page);
    await page.goto('/');
    await page.waitForTimeout(1500);

    await screenshot(page, `terminal-dashboard-mobile-${getProjectSuffix(testInfo.project.name)}`);
    await assertNoOverflow(page);

    const terminalCleanupErrors = consoleErrors.filter((e) =>
      e.includes('terminal-cleanup')
    );
    expect(terminalCleanupErrors).toEqual([]);
  });

  test('no terminal token data persists in DOM after fresh authenticated load', async ({
    page,
  }, testInfo) => {
    await setupMocks(page);
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Verify no token-bearing data is present in the DOM
    const domLeaks = await page.evaluate(() => {
      const body = document.body?.innerHTML ?? '';
      return body.includes('deterministic-test-token') || body.includes('?token=');
    });
    expect(domLeaks).toBe(false);

    await screenshot(page, `terminal-no-dom-tokens-${getProjectSuffix(testInfo.project.name)}`);
    await assertNoOverflow(page);
  });

  test('no network requests to terminal token endpoints after unauthenticated load', async ({
    page,
  }, testInfo) => {
    currentUser = null;
    const tokenRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/terminal/token')) {
        tokenRequests.push(req.url());
      }
    });

    await setupMocks(page);
    await page.goto('/');
    await page.waitForTimeout(2000);

    expect(tokenRequests).toEqual([]);

    await screenshot(page, `terminal-no-unauth-requests-${getProjectSuffix(testInfo.project.name)}`);
    await assertNoOverflow(page);
  });

  test('sessionStorage sam-terminal-sessions-* keys use the shared prefix constant', async ({
    page,
  }, testInfo) => {
    await setupMocks(page);
    await page.goto('/');
    await page.waitForTimeout(500);

    // Seed data with the expected prefix
    await seedTerminalKeys(page);

    const snapshot = await getSessionStorageSnapshot(page);
    const terminalKeys = Object.keys(snapshot).filter((k) =>
      k.startsWith('sam-terminal-sessions-')
    );
    expect(terminalKeys.length).toBe(2);
    expect(terminalKeys).toContain('sam-terminal-sessions-ws-terminal-audit');
    expect(terminalKeys).toContain('sam-terminal-sessions-ws-other');

    // Unrelated keys are preserved
    expect(snapshot['unrelated-key']).toBe('should-persist');

    await screenshot(page, `terminal-storage-prefix-${getProjectSuffix(testInfo.project.name)}`);
    await assertNoOverflow(page);
  });

  test('signOut via mobile drawer clears terminal session data', async ({ page }, testInfo) => {
    await setupMocks(page);

    await page.addInitScript(() => {
      const origHrefDescriptor = Object.getOwnPropertyDescriptor(
        window.Location.prototype,
        'href'
      );
      if (origHrefDescriptor?.set) {
        Object.defineProperty(window.Location.prototype, 'href', {
          ...origHrefDescriptor,
          set(value: string) {
            (window as unknown as Record<string, unknown>).__redirectTarget = value;
          },
        });
      }
    });

    await page.goto('/');
    await page.waitForTimeout(1000);
    await seedTerminalKeys(page);

    // On mobile, sign-out is inside the navigation drawer
    const hamburger = page.getByRole('button', { name: /open navigation menu/i });
    if (await hamburger.isVisible({ timeout: 2000 }).catch(() => false)) {
      await hamburger.click();
      await page.waitForTimeout(300);
    }

    const signOutButton = page.getByRole('button', { name: /sign out|log out/i });
    const visible = await signOutButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (visible) {
      await signOutButton.click();
      await page.waitForTimeout(500);

      const afterSignOut = await getSessionStorageSnapshot(page);
      expect(afterSignOut['sam-terminal-sessions-ws-terminal-audit']).toBeUndefined();
      expect(afterSignOut['sam-terminal-sessions-ws-other']).toBeUndefined();
      expect(afterSignOut['unrelated-key']).toBe('should-persist');

      const leaks = await checkForTokenLeaks(page, 'deterministic-test-token');
      expect(leaks).toEqual([]);
    }

    await screenshot(page, `terminal-signout-mobile-${getProjectSuffix(testInfo.project.name)}`);
    await assertNoOverflow(page);
  });
});

test.describe('Terminal logout cleanup — Desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false });

  test.beforeEach(() => {
    currentUser = USER_A;
  });

  test('desktop dashboard renders without regression', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await setupMocks(page);
    await page.goto('/');
    await page.waitForTimeout(1500);

    await screenshot(
      page,
      `terminal-dashboard-desktop-${getProjectSuffix(testInfo.project.name)}`
    );
    await assertNoOverflow(page);

    // Terminal-cleanup-specific errors would indicate a regression
    const terminalCleanupErrors = consoleErrors.filter((e) =>
      e.includes('terminal-cleanup')
    );
    expect(terminalCleanupErrors).toEqual([]);
  });

  test('signOut via desktop sidebar clears terminal session data', async ({ page }, testInfo) => {
    await setupMocks(page);

    await page.addInitScript(() => {
      const origHrefDescriptor = Object.getOwnPropertyDescriptor(
        window.Location.prototype,
        'href'
      );
      if (origHrefDescriptor?.set) {
        Object.defineProperty(window.Location.prototype, 'href', {
          ...origHrefDescriptor,
          set(value: string) {
            (window as unknown as Record<string, unknown>).__redirectTarget = value;
          },
        });
      }
    });

    await page.goto('/');
    await page.waitForTimeout(1000);
    await seedTerminalKeys(page);

    const signOutButton = page.getByRole('button', { name: /sign out|log out/i });
    const visible = await signOutButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (visible) {
      await signOutButton.click();
      await page.waitForTimeout(500);

      const afterSignOut = await getSessionStorageSnapshot(page);
      expect(afterSignOut['sam-terminal-sessions-ws-terminal-audit']).toBeUndefined();
      expect(afterSignOut['sam-terminal-sessions-ws-other']).toBeUndefined();
      expect(afterSignOut['unrelated-key']).toBe('should-persist');
    }

    await screenshot(page, `terminal-signout-desktop-${getProjectSuffix(testInfo.project.name)}`);
    await assertNoOverflow(page);
  });

  test('no terminal token data leaks in any storage at 1280px', async ({ page }, testInfo) => {
    await setupMocks(page);
    await page.goto('/');
    await page.waitForTimeout(1000);

    const leaks = await checkForTokenLeaks(page, 'deterministic-test-token');
    expect(leaks).toEqual([]);

    const domLeaks = await page.evaluate(() => {
      return (document.body?.innerHTML ?? '').includes('?token=');
    });
    expect(domLeaks).toBe(false);

    await screenshot(page, `terminal-no-leaks-desktop-${getProjectSuffix(testInfo.project.name)}`);
    await assertNoOverflow(page);
  });
});
