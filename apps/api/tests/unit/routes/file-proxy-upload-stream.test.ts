import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../../src/env';

const mocks = vi.hoisted(() => ({
  fetchNodeAgent: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('drizzle-orm/d1', () => ({
  drizzle: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{
            id: 'workspace-local',
            status: 'running',
            projectId: 'project-local',
            nodeId: 'NODE-LOCAL',
          }],
        }),
      }),
    }),
  }),
}));
vi.mock('../../../src/middleware/auth', () => ({ getUserId: () => 'user-local' }));
vi.mock('../../../src/middleware/project-auth', () => ({ requireProjectAccess: vi.fn() }));
vi.mock('../../../src/services/jwt', () => ({ signTerminalToken: async () => ({ token: 'local-test-token' }) }));
vi.mock('../../../src/services/node-agent', () => ({ fetchNodeAgent: mocks.fetchNodeAgent }));
vi.mock('../../../src/lib/logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../src/lib/logger')>();
  return { ...original, log: { ...original.log, error: mocks.logError } };
});

import { fileProxyRoutes } from '../../../src/routes/projects/files';

const route = '/projects/project-local/sessions/chat-local/files/upload';
const env = { DATABASE: {}, BASE_DOMAIN: 'example.test' } as Env;

function app() {
  const api = new Hono<{ Bindings: Env }>();
  api.onError((err, c) => c.json({ error: err.message }, 500));
  api.route('/projects', fileProxyRoutes);
  return api;
}

describe('authenticated file-proxy multipart forwarding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves a 4.096 MB multipart body, boundary, and file fields at the node fetch boundary', async () => {
    const payload = new Uint8Array(4_096_000).fill(0x61);
    const form = new FormData();
    form.set('destination', '../.private');
    form.set('files', new File([payload], 'bundle.part-15', { type: 'application/octet-stream' }));

    mocks.fetchNodeAgent.mockImplementation(async (_nodeId, _env, _url, init: RequestInit) => {
      const contentType = new Headers(init.headers).get('Content-Type');
      expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
      const body = init.body as ReadableStream<Uint8Array>;
      expect(body.locked).toBe(false);
      const forwarded = new Request('https://node.example.test/upload', {
        method: 'POST', headers: { 'Content-Type': contentType! }, body, duplex: 'half',
      } as RequestInit);
      const parsed = await forwarded.formData();
      expect([...parsed.keys()].sort()).toEqual(['destination', 'files']);
      expect(parsed.get('destination')).toBe('../.private');
      const file = parsed.get('files') as File;
      expect(file.name).toBe('bundle.part-15');
      expect(file.type).toBe('application/octet-stream');
      expect(Buffer.compare(Buffer.from(await file.arrayBuffer()), Buffer.from(payload))).toBe(0);
      return Response.json({ files: [{ name: file.name }] });
    });

    const response = await app().request(route, { method: 'POST', body: form }, env);
    expect(response.status).toBe(200);
    expect(mocks.fetchNodeAgent).toHaveBeenCalledOnce();
    expect(mocks.fetchNodeAgent.mock.calls[0]![0]).toBe('NODE-LOCAL');
  });

  it('shows a transport exception reaches the global error handler without a node HTTP response', async () => {
    mocks.fetchNodeAgent.mockRejectedValue(new Error('Network connection lost.'));
    const form = new FormData();
    form.set('files', new File(['local'], 'small.part'));
    const response = await app().request(route, { method: 'POST', body: form }, env);
    expect(response.status).toBe(500);
    expect(mocks.logError).not.toHaveBeenCalledWith('file_proxy.upload_error', expect.anything());
  });
});
