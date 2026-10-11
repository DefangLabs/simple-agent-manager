import { resolveD1BindingIdentity } from '../lib/d1-session';

/** Safety ceiling, not a deploy-time tunable: no instance may hide edits longer than this. */
export const ADMIN_SETTINGS_CACHE_MAX_MS = 60_000;

export interface AdminSettingOverrideRow {
  key: string;
  value: string;
  updatedAt: string;
  updatedBy: string | null;
}

export class AdminSettingsUnavailableError extends Error {
  constructor() {
    // D1 errors can contain SQL parameters. Never propagate them to admin responses or logs.
    super('Admin settings are unavailable; retry after the database recovers.');
    this.name = 'AdminSettingsUnavailableError';
  }
}

interface BindingCache {
  generation: number;
  snapshot?: { rows: AdminSettingOverrideRow[]; expiresAt: number };
  inFlight?: { generation: number; startedAt: number; promise: Promise<AdminSettingOverrideRow[]> };
}

async function loadOverrides(database: D1Database): Promise<AdminSettingOverrideRow[]> {
  const result = await database
    .prepare(
      'SELECT key, value, updated_at AS updatedAt, updated_by AS updatedBy FROM platform_settings'
    )
    .all<AdminSettingOverrideRow>();
  if (!result.success || !Array.isArray(result.results)) throw new AdminSettingsUnavailableError();
  return result.results;
}

/**
 * Persisted overrides only: resolve legacy environment values per call, outside this cache.
 * Secret plaintext never belongs in platform_settings or these snapshots.
 *
 * A writer invalidates its stable D1 binding after the atomic commit (also after ambiguous
 * failures). Other instances may retain their snapshot until TTL. Expired snapshots are
 * NEVER served on failure: consumers must explicitly apply their safe outage policy.
 */
export class AdminSettingsCache {
  private readonly bindings = new WeakMap<D1Database, BindingCache>();
  private readonly ttlMs: number;

  constructor(
    ttlMs = ADMIN_SETTINGS_CACHE_MAX_MS,
    private readonly now: () => number = Date.now,
    private readonly load: (
      database: D1Database
    ) => Promise<AdminSettingOverrideRow[]> = loadOverrides
  ) {
    this.ttlMs =
      Number.isFinite(ttlMs) && ttlMs >= 0
        ? Math.min(ttlMs, ADMIN_SETTINGS_CACHE_MAX_MS)
        : ADMIN_SETTINGS_CACHE_MAX_MS;
  }

  private state(database: D1Database): BindingCache {
    const identity = resolveD1BindingIdentity(database);
    let state = this.bindings.get(identity);
    if (!state) {
      state = { generation: 0 };
      this.bindings.set(identity, state);
    }
    return state;
  }

  invalidate(database: D1Database): void {
    const state = this.state(database);
    state.generation += 1;
    delete state.snapshot;
    delete state.inFlight;
  }

  /** Fresh admin reads bypass snapshots; all reads retain the mutation-generation fence. */
  async read(database: D1Database, fresh = false): Promise<AdminSettingOverrideRow[]> {
    const state = this.state(database);
    // A request facade may have anchored before an admin commit. Retrying that session
    // after invalidation cannot prove it has seen the write. Load through the raw primary
    // binding so a new generation never republishes an older session snapshot.
    const primary = resolveD1BindingIdentity(database);
    // Bound repeated invalidation races. Never return an obsolete pre-save result to its caller.
    const maxReadAttempts = 3;
    for (let attempt = 0; attempt < maxReadAttempts; attempt += 1) {
      const startedAt = this.now();
      if (!fresh && state.snapshot && startedAt < state.snapshot.expiresAt) {
        return structuredClone(state.snapshot.rows);
      }
      const generation = state.generation;
      let flight = !fresh ? state.inFlight : undefined;
      if (!flight || flight.generation !== generation) {
        flight = { generation, startedAt, promise: this.load(primary) };
        if (!fresh) state.inFlight = flight;
      }
      try {
        const rows = await flight.promise;
        if (state.generation !== generation) continue;
        // Do not cache a slow read for another TTL after its response arrives.
        if (this.ttlMs > 0 && this.now() >= flight.startedAt + this.ttlMs) {
          throw new AdminSettingsUnavailableError();
        }
        if (!fresh && this.ttlMs > 0) {
          state.snapshot = {
            rows: structuredClone(rows),
            expiresAt: flight.startedAt + this.ttlMs,
          };
        }
        return structuredClone(rows);
      } catch {
        if (state.generation !== generation) continue;
        delete state.snapshot;
        throw new AdminSettingsUnavailableError();
      } finally {
        if (state.inFlight === flight) delete state.inFlight;
      }
    }
    throw new AdminSettingsUnavailableError();
  }
}
