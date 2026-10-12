import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as schema from '../../src/db/schema';
import type { Env } from '../../src/env';
import { AppError } from '../../src/middleware/error';
import { getSelectedAgentCredentialReference } from '../../src/routes/credentials';
import { taskCallbackRoute } from '../../src/routes/tasks/callback';
import { runtimeRoutes } from '../../src/routes/workspaces/runtime';
import { resolveUpstreamAuth } from '../../src/services/ai-billing';
import { updateAIProxyAgentCredentialAttribution } from '../../src/services/ai-proxy-shared';
import { encrypt } from '../../src/services/encryption';
import { newProviderLimitWait } from '../../src/services/provider-limit-policy';
import { rejectedProviderWindow } from '../../src/services/provider-limit-window';
import { createAllSchemaTables, createSqliteD1 } from '../helpers/sqlite-d1';

vi.mock('../../src/services/jwt', () => ({
  verifyCallbackToken: vi.fn(async () => ({ workspace: 'workspace-1', scope: 'workspace' })),
  signCallbackToken: vi.fn(),
}));
vi.mock('../../src/services/project-data', () => ({
  persistMessage: vi.fn(async () => 'notice'),
  createProjectSchedule: vi.fn(async () => ({ schedule: { id: 'fixture-schedule' } })),
}));
vi.mock('../../src/services/session-sleep', () => ({
  queueWorkspaceSessionSleep: vi.fn(async () => {}),
}));

const PLATFORM_SECRET = 'synthetic-platform-fixture-value';
describe('platform quota attribution at real credential and callback boundaries', () => {
  let sqlite: Database.Database;
  let env: Env;
  let mode: string;
  beforeEach(async () => {
    sqlite = new Database(':memory:');
    createAllSchemaTables(sqlite, schema);
    mode = 'platform-key';
    const encryptionKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    env = {
      DATABASE: createSqliteD1(sqlite),
      ENCRYPTION_KEY: encryptionKey,
      BASE_DOMAIN: 'fixture.example',
      AI_PROXY_ENABLED: 'true',
      KV: { get: vi.fn(async (key: string) => (key === 'ai_proxy_billing_mode' ? mode : null)) },
    } as unknown as Env;
    const encrypted = await encrypt(PLATFORM_SECRET, encryptionKey);
    sqlite
      .prepare(
        "INSERT INTO platform_credentials(id,credential_type,agent_type,credential_kind,label,encrypted_token,iv,is_enabled,created_by)VALUES('platform-1','agent-api-key','claude-code','api-key','Fixture',?,?,1,'user-1')"
      )
      .run(encrypted.ciphertext, encrypted.iv);
    sqlite.exec(
      "INSERT INTO users(id,email,name,status)VALUES('user-1','fixture@example.test','Fixture','active');INSERT INTO projects(id,user_id,name,repository)VALUES('project-1','user-1','Fixture','fixture/repo');INSERT INTO nodes(id,user_id,status)VALUES('node-1','user-1','running');INSERT INTO workspaces(id,user_id,node_id,project_id,status)VALUES('workspace-1','user-1','node-1','project-1','running');INSERT INTO tasks(id,project_id,user_id,workspace_id,chat_session_id,status)VALUES('task-1','project-1','user-1','workspace-1','chat-1','delegated');INSERT INTO agent_sessions(id,user_id,workspace_id,status,agent_type,agent_credential_generation)VALUES('agent-1','user-1','workspace-1','running','claude-code',0);INSERT INTO agent_settings(id,user_id,agent_type,provider_mode)VALUES('settings-1','user-1','claude-code','sam');"
    );
  });
  afterEach(() => sqlite.close());
  function db() {
    return drizzle(env.DATABASE, { schema });
  }
  function selected() {
    return getSelectedAgentCredentialReference(
      db(),
      'user-1',
      'claude-code',
      env.ENCRYPTION_KEY,
      'project-1',
      env
    );
  }
  async function request(path: string, body: object) {
    const app = new Hono<{ Bindings: Env }>();
    app.onError((err, c) =>
      err instanceof AppError
        ? c.json(err.toJSON(), err.statusCode)
        : c.json({ error: 'fixture_error' }, 500)
    );
    app.route('/api/workspaces', runtimeRoutes);
    app.route('/api/projects', taskCallbackRoute);
    return app.request(
      path,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer synthetic-fixture-callback',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      env,
      { waitUntil: () => {}, passThroughOnException: () => {} }
    );
  }
  function inject() {
    return request('/api/workspaces/workspace-1/agent-key', {
      agentType: 'claude-code',
      agentSessionId: 'agent-1',
    });
  }
  function hold(reference: string) {
    const wait = newProviderLimitWait({
      taskId: 'task-1',
      origin: 'admission',
      incidentId: 'admission:task-1',
      credentialKey: reference,
      previous: null,
      now: Date.now(),
      resetsAt: Date.now() + 60_000,
    });
    sqlite
      .prepare(
        "UPDATE tasks SET provider_limit_wait_json=?,admission_state='provider_limit_waiting' WHERE id='task-1'"
      )
      .run(JSON.stringify({ ...wait, phase: 'released' }));
  }
  it.each(['platform-key', 'unified'])(
    'uses actual %s quota identity without writing credentials',
    async (billing) => {
      mode = billing;
      if (billing === 'unified') env.CF_AIG_TOKEN = 'synthetic-unified-fixture-value';
      const actual = await resolveUpstreamAuth(env, db());
      sqlite
        .prepare(
          "INSERT INTO credential_limit_windows(project_id,credential_reference,window_type,status,observed_at,updated_at,resets_at)VALUES('project-1',?,'api.requests','rejected',?,?,?)"
        )
        .run(actual.credentialReference, Date.now(), Date.now(), Date.now() + 60_000);
      const reference = await selected();
      expect(reference).toBe(actual.credentialReference);
      expect(await rejectedProviderWindow(env, reference, Date.now())).not.toBeNull();
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM cc_credentials').get()).toEqual({
        count: 0,
      });
      hold(actual.credentialReference);
      const response = await inject();
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        credentialReference: actual.credentialReference,
        providerMode: actual.providerMode,
        credentialSource: 'platform',
        apiKey: '__platform_proxy__',
      });
      expect(JSON.stringify(body)).not.toContain(PLATFORM_SECRET);
    }
  );
  it('proxy telemetry preserves the accepted generation so its limit callback parks', async () => {
    const response = await inject();
    expect(response.status).toBe(200);
    const body = await response.json();
    const actual = await resolveUpstreamAuth(env, db());
    await updateAIProxyAgentCredentialAttribution(
      env,
      {
        workspaceId: 'workspace-1',
        userId: 'user-1',
        agentSessionId: 'agent-1',
        agentType: 'claude-code',
        agentCredentialGeneration: body.credentialGeneration,
      },
      actual
    );
    expect(
      sqlite
        .prepare(
          "SELECT agent_credential_generation AS generation FROM agent_sessions WHERE id='agent-1'"
        )
        .get()
    ).toEqual({ generation: body.credentialGeneration });
    const callback = await request('/api/projects/project-1/tasks/task-1/status/callback', {
      toStatus: 'failed',
      errorMessage: 'provider_limit_reached',
      providerLimitResetsAt: Date.now() + 60_000,
      providerLimitAgentSessionId: 'agent-1',
      providerLimitCredentialGeneration: body.credentialGeneration,
      providerLimitPromptAttemptId: 1,
    });
    expect(callback.status).toBe(200);
    expect(
      sqlite.prepare("SELECT admission_state AS state,status FROM tasks WHERE id='task-1'").get()
    ).toEqual({ state: 'provider_limit_waiting', status: 'delegated' });
  });
});
