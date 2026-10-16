import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../../src/env';
import { createAdminSettingsEnv } from '../../helpers/admin-settings-env';
import { createMemoryKv } from '../../helpers/sqlite-d1';

vi.mock('../../../src/middleware/auth', () => ({
  requireAuth: () =>
    vi.fn((c: any, next: any) => {
      c.set('auth', {
        user: {
          id: 'admin',
          role: c.req.header('x-test-role') ?? 'superadmin',
          status: c.req.header('x-test-status') ?? 'active',
        },
      });
      return next();
    }),
  requireApproved: () => vi.fn((_c: any, next: any) => next()),
  requireSuperadmin: () => vi.fn((_c: any, next: any) => next()),
}));

vi.mock('../../../src/lib/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { adminTrialsRoutes } = await import('../../../src/routes/admin-trials');

const databases: Database.Database[] = [];
afterEach(() => {
  databases.splice(0).forEach((db) => db.close());
});

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    if (!c.env.DATABASE) {
      const instance = createAdminSettingsEnv(c.env);
      databases.push(instance.sqlite);
      Object.assign(c.env, instance.env);
    }
    await next();
  });
  app.onError((err, c) => {
    const appError = err as { statusCode?: number; error?: string; message?: string };
    if (typeof appError.statusCode === 'number') {
      return c.json(
        { error: appError.error ?? 'ERROR', message: appError.message },
        appError.statusCode
      );
    }
    return c.json({ error: 'INTERNAL_ERROR', message: err.message }, 500);
  });
  app.route('/api/admin/trials', adminTrialsRoutes);
  return app;
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    KV: {
      get: vi.fn().mockResolvedValue('false'),
      put: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace,
    ...overrides,
  } as Env;
}

describe('admin trial config routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const service = await import('../../../src/services/trial/kill-switch');
    service.__resetKillSwitchCacheForTest();
  });

  it('returns the current trial config', async () => {
    const app = createApp();
    const get = vi.fn().mockResolvedValue('true');
    const env = createEnv({
      KV: { get, put: vi.fn() } as unknown as KVNamespace,
      TRIAL_KILL_SWITCH_CACHE_MS: '5000',
    });

    const res = await app.request('/api/admin/trials/config', {}, env);
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      enabled: true,
      kvKey: 'trials:enabled',
      cacheTtlMs: 5000,
    });
    expect(get).toHaveBeenCalledWith('trials:enabled');
  });

  it('updates the trial config and writes the configured KV key', async () => {
    const app = createApp();
    const put = vi.fn().mockResolvedValue(undefined);
    const env = createEnv({
      KV: { get: vi.fn(), put } as unknown as KVNamespace,
      TRIALS_ENABLED_KV_KEY: 'admin:trials-enabled',
    });

    const res = await app.request(
      '/api/admin/trials/config',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      },
      env
    );
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      enabled: true,
      kvKey: 'admin:trials-enabled',
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('persists an admin toggle across GET, PATCH, then GET', async () => {
    const app = createApp();
    const storage = new Map<string, string>([['trials:enabled', 'true']]);
    const env = createEnv({
      KV: {
        get: vi.fn(async (key: string) => storage.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
          storage.set(key, value);
        }),
      } as unknown as KVNamespace,
    });

    const before = await app.request('/api/admin/trials/config', {}, env);
    expect(await before.json()).toMatchObject({ enabled: true });

    const update = await app.request(
      '/api/admin/trials/config',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      },
      env
    );
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ enabled: false });

    const after = await app.request('/api/admin/trials/config', {}, env);
    expect(await after.json()).toMatchObject({ enabled: false });
    expect(storage.get('trials:enabled')).toBe('true'); // Legacy fallback is retained for rollback.
  });

  it('rejects non-boolean enabled values', async () => {
    const app = createApp();
    const put = vi.fn().mockResolvedValue(undefined);
    const env = createEnv({ KV: { get: vi.fn(), put } as unknown as KVNamespace });

    const res = await app.request(
      '/api/admin/trials/config',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: 'true' }),
      },
      env
    );
    const body = (await res.json()) as any;

    expect(res.status).toBe(400);
    expect(body.message).toBe('enabled must be a boolean');
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects a malformed JSON body with the standard jsonValidator 400 shape (not a 500)', async () => {
    const app = createApp();
    // createMemoryKv() is already typed as a real KVNamespace, so no
    // `unknown` intermediate cast is needed to pass it as an override.
    const kv = createMemoryKv();
    const putSpy = vi.spyOn(kv, 'put');
    const env = createEnv({ KV: kv });

    const res = await app.request(
      '/api/admin/trials/config',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{not valid json',
      },
      env
    );
    const body = (await res.json()) as { error: string; message: string };

    expect(res.status).toBe(400);
    expect(body.error).toBe('BAD_REQUEST');
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('rejects a missing enabled field with the same boolean-required message', async () => {
    const app = createApp();
    const kv = createMemoryKv();
    const putSpy = vi.spyOn(kv, 'put');
    const env = createEnv({ KV: kv });

    const res = await app.request(
      '/api/admin/trials/config',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      env
    );
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(400);
    expect(body.message).toBe('enabled must be a boolean');
    expect(putSpy).not.toHaveBeenCalled();
  });
});

for (const status of ['pending', 'suspended']) {
  it(`blocks ${status} superadmins before settings mutation`, async () => {
    const env = {} as Env;
    const response = await createApp().request(
      '/api/admin/trials/config',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-test-role': 'superadmin',
          'x-test-status': status,
        },
        body: JSON.stringify({ enabled: true }),
      },
      env
    );
    expect(response.status).toBe(403);
    expect(
      await env.DATABASE.prepare('SELECT revision FROM admin_settings_revision').first()
    ).toMatchObject({ revision: 0 });
  });
}
