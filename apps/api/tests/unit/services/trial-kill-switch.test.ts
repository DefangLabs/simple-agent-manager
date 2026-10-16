import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../../src/env';
import { invalidateAdminSettings } from '../../../src/services/admin-settings';
import {
  isTrialsEnabled,
  resolveTrialKillSwitchCacheMs,
  setTrialsEnabled,
} from '../../../src/services/trial/kill-switch';
import { createAdminSettingsEnv } from '../../helpers/admin-settings-env';
let sqlite: Database.Database;
let env: Env;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  ({ sqlite, env } = createAdminSettingsEnv());
});
afterEach(() => {
  sqlite.close();
  vi.useRealTimers();
});
describe('trial kill-switch through authoritative settings', () => {
  it('defaults off on fresh install', async () => expect(await isTrialsEnabled(env)).toBe(false));
  it('retains exact true legacy KV opt-in', async () => {
    await env.KV.put('trials:enabled', 'true');
    expect(await isTrialsEnabled(env)).toBe(true);
  });
  it('rejects other legacy KV encodings', async () => {
    for (const value of ['TRUE', '1', 'enabled', 'false', '']) {
      await env.KV.put('trials:enabled', value);
      invalidateAdminSettings(env);
      expect(await isTrialsEnabled(env)).toBe(false);
    }
  });
  it('bounds caching and re-reads expired legacy KV', async () => {
    const get = vi.spyOn(env.KV, 'get');
    await env.KV.put('trials:enabled', 'true');
    expect(await isTrialsEnabled(env)).toBe(true);
    await env.KV.put('trials:enabled', 'false');
    vi.setSystemTime(29_999);
    expect(await isTrialsEnabled(env)).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
    vi.setSystemTime(30_001);
    expect(await isTrialsEnabled(env)).toBe(false);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('fails closed after legacy KV outage', async () => {
    await env.KV.put('trials:enabled', 'true');
    expect(await isTrialsEnabled(env)).toBe(true);
    vi.spyOn(env.KV, 'get').mockRejectedValue(new Error('unavailable'));
    vi.setSystemTime(30_001);
    expect(await isTrialsEnabled(env)).toBe(false);
  });
  it('honors legacy custom KV keys', async () => {
    env.TRIALS_ENABLED_KV_KEY = 'custom:trials';
    await env.KV.put('custom:trials', 'true');
    expect(await isTrialsEnabled(env)).toBe(true);
  });
  it('clamps configured TTL and preserves zero', () => {
    expect(resolveTrialKillSwitchCacheMs({ ...env, TRIAL_KILL_SWITCH_CACHE_MS: '999999999' })).toBe(
      30_000
    );
    expect(resolveTrialKillSwitchCacheMs({ ...env, TRIAL_KILL_SWITCH_CACHE_MS: '0' })).toBe(0);
    expect(resolveTrialKillSwitchCacheMs({ ...env, TRIAL_KILL_SWITCH_CACHE_MS: 'invalid' })).toBe(
      30_000
    );
  });
  it('legacy admin writer commits D1 and audit without overwriting legacy KV', async () => {
    await env.KV.put('trials:enabled', 'false');
    expect(await setTrialsEnabled(env, true, 0, 'admin')).toEqual({
      enabled: true,
      kvKey: 'trials:enabled',
      cacheTtlMs: 30_000,
    });
    expect(await isTrialsEnabled(env)).toBe(true);
    expect(await env.KV.get('trials:enabled')).toBe('false');
    expect(sqlite.prepare('SELECT name,actor_user_id FROM admin_settings_audit').get()).toEqual({
      name: 'trials.enabled',
      actor_user_id: 'admin',
    });
    await setTrialsEnabled(env, false, 1, 'admin');
    expect(await isTrialsEnabled(env)).toBe(false);
  });
});
