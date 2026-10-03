import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../../src/env';
import {
  CODEX_RUNTIME_ARCHIVE_BYTES,
  CODEX_RUNTIME_RELEASE,
  codexRuntimeRoutes,
} from '../../src/routes/codex-runtime';

const request = (query: string, get = vi.fn()) =>
  codexRuntimeRoutes.request(`/download?${query}`, {}, { R2: { get } } as unknown as Env);

describe('immutable Codex runtime download', () => {
  it.each(['', 'release=latest', 'release=../other', `release=${'a'.repeat(64)}`])(
    'rejects unsupported release %s without storage access',
    async (query) => {
      const get = vi.fn();
      expect((await request(query, get)).status).toBe(400);
      expect(get).not.toHaveBeenCalled();
    }
  );
  it.each(['arch=arm64', 'os=darwin', 'arch='])(
    'rejects unsupported platform %s',
    async (platform) => {
      const get = vi.fn();
      expect((await request(`release=${CODEX_RUNTIME_RELEASE}&${platform}`, get)).status).toBe(400);
      expect(get).not.toHaveBeenCalled();
    }
  );
  it('reports absent storage and unpublished artifacts', async () => {
    expect(
      (
        await codexRuntimeRoutes.request(
          `/download?release=${CODEX_RUNTIME_RELEASE}`,
          {},
          {} as Env
        )
      ).status
    ).toBe(503);
    expect(
      (await request(`release=${CODEX_RUNTIME_RELEASE}`, vi.fn().mockResolvedValue(null))).status
    ).toBe(404);
  });
  it('rejects a wrong-size object and cancels its stream', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    expect(
      (
        await request(
          `release=${CODEX_RUNTIME_RELEASE}`,
          vi.fn().mockResolvedValue({ size: 3, body })
        )
      ).status
    ).toBe(503);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('streams only the exact immutable key with download headers', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('test bytes'));
        controller.close();
      },
    });
    const get = vi.fn().mockResolvedValue({ size: CODEX_RUNTIME_ARCHIVE_BYTES, body });
    const response = await request(`release=${CODEX_RUNTIME_RELEASE}`, get);
    expect(get).toHaveBeenCalledWith(
      `acp/codex/releases/${CODEX_RUNTIME_RELEASE}/codex-runtime-linux-amd64.tar.gz`
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('content-length')).toBe(String(CODEX_RUNTIME_ARCHIVE_BYTES));
    expect(await response.text()).toBe('test bytes');
  });
});
