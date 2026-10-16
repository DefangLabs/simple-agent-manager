/** Shared Phase 1 resolver and atomic, value-free audit boundary. */
import type { Env } from '../env';
import { resolveD1BindingIdentity } from '../lib/d1-session';
import { getCredentialEncryptionKey } from '../lib/secrets';
import { errors } from '../middleware/error';
import {
  ADMIN_SETTINGS_CACHE_MAX_MS,
  AdminSettingsCache,
  AdminSettingsUnavailableError,
} from './admin-settings-cache';
import {
  ADMIN_SETTINGS_REGISTRY,
  type AdminSettingDefinition,
  type AdminSettingName,
  type AdminSettingValue,
  findAdminSetting,
  publicAdminSettingDefinition,
} from './admin-settings-registry';
import { decrypt, encrypt } from './encryption';
import { INTEGRATION_CREDENTIAL_TYPE } from './platform-config-store';

function requiredDefinition(name: string): AdminSettingDefinition {
  const def = findAdminSetting(name);
  if (!def) throw errors.badRequest('Unknown admin setting');
  return def;
}
const cache = new AdminSettingsCache();
const generations = new WeakMap<D1Database, number>();
const LEGACY_KV_CACHE_MAX_MS = 30_000;
type CredentialRow = {
  provider: string;
  kind: string;
  ciphertext: string;
  iv: string;
  updatedAt: string;
  updatedBy: string | null;
};
const credentialCache = new WeakMap<
  D1Database,
  { expiresAt: number; promise: Promise<CredentialRow[]> }
>();
async function credentialRows(env: Env, fresh = false, attempt = 0): Promise<CredentialRow[]> {
  if (attempt >= 3) throw new AdminSettingsUnavailableError();
  const db = resolveD1BindingIdentity(env.DATABASE);
  const generation = generations.get(db) ?? 0;
  const existing = credentialCache.get(db);
  if (!fresh && existing && existing.expiresAt > Date.now()) {
    const rows = await existing.promise;
    if ((generations.get(db) ?? 0) !== generation) throw new AdminSettingsUnavailableError();
    if (Date.now() >= existing.expiresAt) throw new AdminSettingsUnavailableError();
    return rows;
  }
  const entry = {
    expiresAt: Date.now() + ADMIN_SETTINGS_CACHE_MAX_MS,
    promise: db
      .prepare(
        'SELECT provider,credential_kind AS kind,encrypted_token AS ciphertext,iv,updated_at AS updatedAt,COALESCE(updated_by,created_by) AS updatedBy FROM platform_credentials WHERE credential_type=? AND is_enabled=1 ORDER BY updated_at DESC,created_at DESC'
      )
      .bind(INTEGRATION_CREDENTIAL_TYPE)
      .all<CredentialRow>()
      .then((result) => {
        if (!result.success) throw new AdminSettingsUnavailableError();
        return result.results;
      }),
  };
  if (!fresh) credentialCache.set(db, entry);
  try {
    const rows = await entry.promise;
    if (!fresh && credentialCache.get(db) !== entry) return credentialRows(env, false, attempt + 1);
    if ((generations.get(db) ?? 0) !== generation || Date.now() >= entry.expiresAt)
      throw new AdminSettingsUnavailableError();
    return rows;
  } catch {
    if (credentialCache.get(db) === entry) credentialCache.delete(db);
    throw new AdminSettingsUnavailableError();
  }
}
const kvCache = new WeakMap<
  D1Database,
  Map<string, { expiresAt: number; promise: Promise<string | null> }>
>();
async function legacyKv(env: Env, key: string, fresh: boolean, attempt = 0) {
  if (attempt >= 3) throw new AdminSettingsUnavailableError();
  const db = resolveD1BindingIdentity(env.DATABASE);
  const generation = generations.get(db) ?? 0;
  let map = kvCache.get(db);
  if (!map) {
    map = new Map();
    kvCache.set(db, map);
  }
  const cached = map.get(key);
  if (!fresh && cached && cached.expiresAt > Date.now()) {
    const value = await cached.promise;
    if ((generations.get(db) ?? 0) !== generation || Date.now() >= cached.expiresAt)
      throw new AdminSettingsUnavailableError();
    return value;
  }
  const entry = { expiresAt: Date.now() + LEGACY_KV_CACHE_MAX_MS, promise: env.KV.get(key) };
  if (!fresh) map.set(key, entry);
  try {
    const value = await entry.promise;
    if (!fresh && map.get(key) !== entry) return legacyKv(env, key, false, attempt + 1);
    if ((generations.get(db) ?? 0) !== generation || Date.now() >= entry.expiresAt)
      throw new AdminSettingsUnavailableError();
    return value;
  } catch {
    if (map.get(key) === entry) map.delete(key);
    throw new AdminSettingsUnavailableError();
  }
}
const disabled = new WeakMap<D1Database, Set<string>>();
export function invalidateAdminSettings(env: Env): void {
  const db = resolveD1BindingIdentity(env.DATABASE);
  generations.set(db, (generations.get(db) ?? 0) + 1);
  cache.invalidate(env.DATABASE);
  credentialCache.delete(resolveD1BindingIdentity(env.DATABASE));
  kvCache.delete(resolveD1BindingIdentity(env.DATABASE));
}
function observe(env: Env, name: string, value: AdminSettingValue): void {
  const db = resolveD1BindingIdentity(env.DATABASE);
  let values = disabled.get(db);
  if (!values) {
    values = new Set();
    disabled.set(db, values);
  }
  if (value === false) values.add(name);
  else values.delete(name);
}
function parseValue(def: AdminSettingDefinition, raw: string): unknown {
  if (def.type === 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return def.type === 'string-list' ? raw.split(',').map((x) => x.trim()) : raw;
  }
}
async function resolved(
  env: Env,
  def: AdminSettingDefinition,
  rows: Awaited<ReturnType<AdminSettingsCache['read']>>,
  secretValue: boolean,
  credentials?: CredentialRow[],
  fresh = false
) {
  if (def.credential) {
    const credential = def.credential;
    const result = (credentials ?? (await credentialRows(env))).find(
      (row) => row.provider === credential.provider && row.kind === credential.kind
    );
    if (result)
      return {
        value: secretValue
          ? await decrypt(result.ciphertext, result.iv, getCredentialEncryptionKey(env))
          : null,
        configured: true,
        source: 'database' as const,
        updatedAt: result.updatedAt,
        updatedBy: result.updatedBy,
      };
  } else {
    const row = rows.find((row) => row.key === def.name);
    if (row) {
      const value = parseValue(def, row.value);
      if (!def.validate(value)) throw new AdminSettingsUnavailableError();
      observe(env, def.name, value as AdminSettingValue);
      return {
        value: value as AdminSettingValue,
        configured: true,
        source: 'database' as const,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      };
    }
  }
  const raw = def.legacyEnvironment ? env[def.legacyEnvironment] : undefined;
  if (typeof raw === 'string' && raw.trim()) {
    const value = parseValue(def, raw);
    if (def.validate(value)) {
      observe(env, def.name, value as AdminSettingValue);
      return {
        value: def.secret && !secretValue ? null : (value as AdminSettingValue),
        configured: true,
        source: 'environment' as const,
        updatedAt: null,
        updatedBy: null,
      };
    }
  }
  if (def.legacyKv) {
    const key =
      def.legacyKv === 'trials'
        ? (env.TRIALS_ENABLED_KV_KEY ?? 'trials:enabled')
        : def.legacyKv === 'cron'
          ? (env.CRON_SWEEPS_ENABLED_KV_KEY ?? 'control-loops:cron-enabled')
          : (env.DO_ALARMS_ENABLED_KV_KEY ?? 'control-loops:alarms-enabled');
    const value = await legacyKv(env, key, fresh);
    if (value !== null) {
      const enabled =
        def.legacyKv === 'trials' ? value === 'true' : value !== 'false' && value !== 'disabled';
      observe(env, def.name, enabled);
      return {
        value: enabled,
        configured: true,
        source: 'kv' as const,
        updatedAt: null,
        updatedBy: null,
      };
    }
  }
  observe(env, def.name, def.defaultValue);
  return {
    value: def.defaultValue,
    configured: false,
    source: 'default' as const,
    updatedAt: null,
    updatedBy: null,
  };
}
export async function resolveAdminSettingDetails(env: Env, name: AdminSettingName) {
  const def = findAdminSetting(name);
  if (!def) throw errors.badRequest('Unknown admin setting');
  try {
    return await resolved(env, def, await cache.read(env.DATABASE), true);
  } catch {
    throw new AdminSettingsUnavailableError();
  }
}
export async function resolveAdminSetting(
  env: Env,
  name: AdminSettingName
): Promise<AdminSettingValue> {
  const def = findAdminSetting(name);
  if (!def) throw errors.badRequest('Unknown admin setting');
  try {
    return (await resolved(env, def, await cache.read(env.DATABASE), true)).value;
  } catch {
    if (
      def.legacyEnvironment &&
      typeof env[def.legacyEnvironment] === 'string' &&
      parseValue(def, String(env[def.legacyEnvironment])) === false
    )
      return false;
    if (def.type === 'boolean') {
      if (name.startsWith('connector.') || name === 'trials.enabled') return false;
      return disabled.get(resolveD1BindingIdentity(env.DATABASE))?.has(name)
        ? false
        : def.defaultValue;
    }
    if (name === 'connector.clientRegistration') return 'allowlist';
    if (name === 'connector.allowedRedirectHosts') return [];
    if (def.category === 'OAuth') return null;
    return def.defaultValue;
  }
}
export async function readAdminSettings(env: Env, options: { fresh?: boolean } = {}) {
  try {
    const revisionBefore = await env.DATABASE.prepare(
      'SELECT revision FROM admin_settings_revision WHERE singleton=1'
    ).first<{ revision: number }>();
    const rows = await cache.read(env.DATABASE, options.fresh ?? true);
    const credentials = await credentialRows(env, options.fresh ?? true);
    const revision = await env.DATABASE.prepare(
      'SELECT revision FROM admin_settings_revision WHERE singleton=1'
    ).first<{ revision: number }>();
    if (!revision) throw new AdminSettingsUnavailableError();
    const settings = await Promise.all(
      ADMIN_SETTINGS_REGISTRY.map(async (def) => ({
        ...publicAdminSettingDefinition(def),
        ...(await resolved(env, def, rows, false, credentials, options.fresh ?? true)),
      }))
    );
    const history = await env.DATABASE.prepare(
      'SELECT name,action,actor_user_id AS actorUserId,created_at AS createdAt,revision FROM admin_settings_audit ORDER BY revision DESC,name LIMIT 100'
    ).all<{
      name: string;
      action: 'set' | 'reset';
      actorUserId: string;
      createdAt: string;
      revision: number;
    }>();
    if (!history.success) throw new AdminSettingsUnavailableError();
    const revisionAfter = await env.DATABASE.prepare(
      'SELECT revision FROM admin_settings_revision WHERE singleton=1'
    ).first<{ revision: number }>();
    if (
      revisionBefore?.revision !== revision.revision ||
      revisionAfter?.revision !== revision.revision
    )
      throw new AdminSettingsUnavailableError();
    return { revision: revision.revision, settings, history: history.results };
  } catch {
    throw new AdminSettingsUnavailableError();
  }
}
export type AdminSettingsView = Awaited<ReturnType<typeof readAdminSettings>>;
type AuditChange = { name: AdminSettingName; action: 'set' | 'reset' };
function auditStatements(
  env: Env,
  changes: AuditChange[],
  actor: string,
  now: string,
  mutation: string
) {
  return changes.map((change) =>
    env.DATABASE.prepare(
      'INSERT INTO admin_settings_audit(id,name,action,actor_user_id,created_at,revision) SELECT ?,?,?,?,?,revision FROM admin_settings_revision WHERE singleton=1 AND mutation_id=?'
    ).bind(crypto.randomUUID(), change.name, change.action, actor, now, mutation)
  );
}
export async function commitAdminSettingsStatements(
  env: Env,
  input: {
    statements: D1PreparedStatement[];
    changes: AuditChange[];
    actorUserId: string;
    expectedRevision?: number;
  }
): Promise<void> {
  if (!input.changes.length) {
    await env.DATABASE.batch(input.statements);
    return;
  }
  const mutation = crypto.randomUUID();
  try {
    const result = await env.DATABASE.batch([
      ...(input.expectedRevision === undefined
        ? []
        : [
            env.DATABASE.prepare(
              'INSERT INTO admin_settings_revision(singleton) SELECT 1 FROM admin_settings_revision WHERE singleton=1 AND revision<>?'
            ).bind(input.expectedRevision),
          ]),
      env.DATABASE.prepare(
        'UPDATE admin_settings_revision SET revision=revision+1,mutation_id=? WHERE singleton=1'
      ).bind(mutation),
      ...input.statements,
      ...auditStatements(env, input.changes, input.actorUserId, new Date().toISOString(), mutation),
    ]);
    if (
      result.some((item) => !item.success) ||
      result[input.expectedRevision === undefined ? 0 : 1]?.meta.changes !== 1
    )
      throw new AdminSettingsUnavailableError();
  } catch (error) {
    if (
      input.expectedRevision !== undefined &&
      String(error).includes('admin_settings_revision.singleton')
    )
      throw errors.conflict('Settings changed. Reload before saving.');
    throw new AdminSettingsUnavailableError();
  } finally {
    invalidateAdminSettings(env);
  }
}
export async function validateAdminSettingsChanges(
  env: Env,
  changes: { name: AdminSettingName; value: AdminSettingValue }[]
): Promise<number> {
  const primaryEnv = { ...env, DATABASE: resolveD1BindingIdentity(env.DATABASE) };
  const before = await primaryEnv.DATABASE.prepare(
    'SELECT revision FROM admin_settings_revision WHERE singleton=1'
  ).first<{ revision: number }>();
  if (!before) throw new AdminSettingsUnavailableError();
  const touched = new Set(
    changes
      .filter((change) => change.name.startsWith('integration.'))
      .map((change) => change.name.split('.')[1])
  );
  if (touched.size) {
    const rows = await cache.read(primaryEnv.DATABASE, true),
      credentials = await credentialRows(primaryEnv, true);
    for (const provider of ['github', 'google', 'googleInfrastructure', 'gitlab'] as const) {
      if (!touched.has(provider)) continue;
      const effective = async (name: AdminSettingName) => {
        const change = changes.find((item) => item.name === name),
          def = requiredDefinition(name);
        if (change?.value === null)
          return (await resolved(primaryEnv, def, [], false, [], true)).configured;
        if (change) return Boolean(change.value);
        return (await resolved(primaryEnv, def, rows, false, credentials, true)).configured;
      };
      const id = await effective(`integration.${provider}.clientId`),
        secret = await effective(`integration.${provider}.clientSecret`);
      if (id !== secret)
        throw errors.badRequest('OAuth client ID and secret must be configured or reset together.');
    }
  }
  const after = await primaryEnv.DATABASE.prepare(
    'SELECT revision FROM admin_settings_revision WHERE singleton=1'
  ).first<{ revision: number }>();
  if (before.revision !== after?.revision)
    throw errors.conflict('Settings changed. Reload before saving.');
  return before.revision;
}
export async function updateAdminSettings(
  env: Env,
  input: {
    changes: { name: AdminSettingName; value: AdminSettingValue }[];
    actorUserId: string;
    expectedRevision?: number;
  }
) {
  if (
    !input.changes.length ||
    input.changes.length > ADMIN_SETTINGS_REGISTRY.length ||
    new Set(input.changes.map((x) => x.name)).size !== input.changes.length ||
    input.changes.some(
      (change) =>
        !findAdminSetting(change.name) ||
        (change.value !== null && !requiredDefinition(change.name).validate(change.value))
    ) ||
    (input.expectedRevision !== undefined &&
      (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0))
  )
    throw errors.badRequest('Invalid admin settings change');
  const validatedRevision = await validateAdminSettingsChanges(env, input.changes);
  if (input.expectedRevision !== undefined && input.expectedRevision !== validatedRevision)
    throw errors.conflict('Settings changed. Reload before saving.');
  const expectedRevision = input.expectedRevision ?? validatedRevision;
  const mutation = crypto.randomUUID(),
    now = new Date().toISOString();
  const guard = 'EXISTS(SELECT 1 FROM admin_settings_revision WHERE singleton=1 AND mutation_id=?)';
  const statements: D1PreparedStatement[] = [];
  for (const change of input.changes) {
    const def = requiredDefinition(change.name);
    if (def.credential) {
      statements.push(
        env.DATABASE.prepare(
          `DELETE FROM platform_credentials WHERE credential_type=? AND provider=? AND credential_kind=? AND ${guard}`
        ).bind(INTEGRATION_CREDENTIAL_TYPE, def.credential.provider, def.credential.kind, mutation)
      );
      if (change.value !== null) {
        const encrypted = await encrypt(
          String(change.value).trim(),
          getCredentialEncryptionKey(env)
        );
        statements.push(
          env.DATABASE.prepare(
            `INSERT INTO platform_credentials(id,credential_type,provider,agent_type,credential_kind,label,encrypted_token,iv,is_enabled,created_by,created_at,updated_by,updated_at) SELECT ?,?,?,NULL,?,?,?,?,1,?,?,?,? WHERE ${guard}`
          ).bind(
            crypto.randomUUID(),
            INTEGRATION_CREDENTIAL_TYPE,
            def.credential.provider,
            def.credential.kind,
            def.description,
            encrypted.ciphertext,
            encrypted.iv,
            input.actorUserId,
            now,
            input.actorUserId,
            now,
            mutation
          )
        );
      }
    } else if (change.value === null)
      statements.push(
        env.DATABASE.prepare(`DELETE FROM platform_settings WHERE key=? AND ${guard}`).bind(
          change.name,
          mutation
        )
      );
    else
      statements.push(
        env.DATABASE.prepare(
          `INSERT INTO platform_settings(key,value,updated_at,updated_by) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by`
        ).bind(
          change.name,
          def.type === 'string' ? String(change.value).trim() : JSON.stringify(change.value),
          now,
          input.actorUserId,
          mutation
        )
      );
  }
  let result: D1Result[];
  try {
    result = await env.DATABASE.batch([
      env.DATABASE.prepare(
        `UPDATE admin_settings_revision SET revision=revision+1,mutation_id=? WHERE singleton=1 AND revision=?`
      ).bind(mutation, expectedRevision),
      ...statements,
      ...auditStatements(
        env,
        input.changes.map((x) => ({ name: x.name, action: x.value === null ? 'reset' : 'set' })),
        input.actorUserId,
        now,
        mutation
      ),
    ]);
    if (result.some((item) => !item.success)) throw new AdminSettingsUnavailableError();
  } catch {
    throw new AdminSettingsUnavailableError();
  } finally {
    invalidateAdminSettings(env);
  }
  if (result[0]?.meta.changes !== 1)
    throw errors.conflict('Settings changed. Reload before saving.');
  return readAdminSettings(env, { fresh: true });
}
