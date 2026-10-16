/** Trial creation gate: D1 override first, legacy KV compatibility second, off by default.
 * The shared settings cache bounds convergence and fails closed on read failures.
 */
import type { Env } from '../../env';
import {
  __resetAdminSettingsCacheForTest,
  resolveAdminSetting,
  updateAdminSettings,
} from '../admin-settings';

const DEFAULT_KILL_SWITCH_CACHE_MS = 30_000;
const DEFAULT_TRIALS_ENABLED_KV_KEY = 'trials:enabled';

/** Compatibility reset; the authoritative cache is owned by admin-settings. */
export function __resetKillSwitchCacheForTest(): void {
  __resetAdminSettingsCacheForTest();
}

export function resolveTrialsEnabledKvKey(env: Env): string {
  return env.TRIALS_ENABLED_KV_KEY ?? DEFAULT_TRIALS_ENABLED_KV_KEY;
}

export function resolveTrialKillSwitchCacheMs(env: Env): number {
  const configured = Number(env.TRIAL_KILL_SWITCH_CACHE_MS ?? DEFAULT_KILL_SWITCH_CACHE_MS);
  return Number.isFinite(configured) && configured >= 0
    ? Math.min(configured, DEFAULT_KILL_SWITCH_CACHE_MS)
    : DEFAULT_KILL_SWITCH_CACHE_MS;
}

/**
 * Returns `true` when trials are enabled. Default is **disabled** — an
 * operator must explicitly set the KV flag to `"true"` to turn trials on.
 */
export async function isTrialsEnabled(env: Env, _now: number = Date.now()): Promise<boolean> {
  return Boolean(await resolveAdminSetting(env, 'trials.enabled'));
}

export async function setTrialsEnabled(
  env: Env,
  enabled: boolean,
  _now: number = Date.now(),
  actorUserId: string = 'system'
): Promise<{ enabled: boolean; kvKey: string; cacheTtlMs: number }> {
  await updateAdminSettings(env, {
    changes: [{ name: 'trials.enabled', value: enabled }],
    actorUserId,
  });
  return {
    enabled,
    kvKey: resolveTrialsEnabledKvKey(env),
    cacheTtlMs: resolveTrialKillSwitchCacheMs(env),
  };
}
