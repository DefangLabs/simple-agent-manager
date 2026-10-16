import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../../src/env';
import { createAdminSettingsEnv } from '../../helpers/admin-settings-env';
vi.mock('../../../src/middleware/auth', () => ({
  getAuth: (c: any) => c.get('auth'),
  requireAuth: () => async (c: any, next: () => Promise<void>) => {
    if (c.req.header('x-user') === 'none') return c.json({ error: 'UNAUTHORIZED' }, 401);
    c.set('auth', {
      user: {
        id: 'admin',
        status: c.req.header('x-status') ?? 'active',
        role: c.req.header('x-role') ?? 'superadmin',
      },
    });
    await next();
  },
  requireApproved: () => async (_c: any, next: () => Promise<void>) => next(),
  requireSuperadmin: () => async (c: any, next: () => Promise<void>) => {
    if (c.get('auth').user.role !== 'superadmin') return c.json({ error: 'FORBIDDEN' }, 403);
    await next();
  },
}));
const { adminSettingsRoutes } = await import('../../../src/routes/admin-settings');
let sqlite: Database.Database, bindings: Env;
beforeEach(() => {
  const fixture = createAdminSettingsEnv();
  sqlite = fixture.sqlite;
  bindings = fixture.env;
});
afterEach(() => sqlite.close());
const app = new Hono<{ Bindings: Env }>().route('/settings', adminSettingsRoutes);
const request = (headers: Record<string, string> = {}, body?: unknown) =>
  app.request(
    '/settings',
    {
      method: body ? 'PATCH' : 'GET',
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    bindings
  );
describe('admin settings authorization and API', () => {
  it('requires authenticated active superadmin for GET and PATCH independently of approval-policy exemptions', async () => {
    for (const headers of [
      { 'x-user': 'none' },
      { 'x-role': 'admin' },
      { 'x-role': 'user' },
      { 'x-status': 'pending' },
      { 'x-status': 'suspended' },
      { 'x-status': 'system' },
      { 'x-status': 'unknown' },
    ]) {
      for (const body of [
        undefined,
        { expectedRevision: 0, changes: [{ name: 'trials.enabled', value: true }] },
      ])
        expect((await request(headers, body)).status).toBe(
          headers['x-user'] === 'none' ? 401 : 403
        );
    }
    expect(sqlite.prepare('SELECT revision FROM admin_settings_revision').get()).toEqual({
      revision: 0,
    });
  });
  it('requires revision, rejects unknown fields and reports stale revisions', async () => {
    expect((await request()).status).toBe(200);
    expect((await request({}, { changes: [{ name: 'trials.enabled', value: true }] })).status).toBe(
      400
    );
    expect(
      (
        await request(
          {},
          { expectedRevision: 0, changes: [{ name: 'trials.enabled', value: true }], extra: 1 }
        )
      ).status
    ).toBe(400);
    expect(
      (
        await request(
          {},
          { expectedRevision: 0, changes: [{ name: 'trials.enabled', value: true }] }
        )
      ).status
    ).toBe(200);
    expect(
      (
        await request(
          {},
          { expectedRevision: 0, changes: [{ name: 'trials.enabled', value: false }] }
        )
      ).status
    ).toBe(409);
  });
  it('sanitizes SQL errors and never exposes value-derived diagnostics', async () => {
    sqlite.exec(
      "CREATE TRIGGER fail_write BEFORE INSERT ON platform_settings BEGIN SELECT RAISE(ABORT,'private-plaintext'); END;"
    );
    const response = await request(
      {},
      { expectedRevision: 0, changes: [{ name: 'trials.enabled', value: true }] }
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-plaintext');
  });
});
