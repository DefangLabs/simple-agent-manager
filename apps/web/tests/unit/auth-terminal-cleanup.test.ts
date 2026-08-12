import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('signOut terminal cleanup integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('calls cleanupTerminalSecrets before signing out', async () => {
    const cleanupMock = vi.fn();

    vi.doMock('../../src/lib/terminal-cleanup', () => ({
      cleanupTerminalSecrets: cleanupMock,
      TERMINAL_SESSION_STORAGE_PREFIX: 'sam-terminal-sessions-',
    }));

    vi.doMock('better-auth/react', () => ({
      createAuthClient: () => ({
        signIn: { social: vi.fn() },
        signOut: vi.fn(async (opts: { fetchOptions?: { onSuccess?: () => void } }) => {
          opts.fetchOptions?.onSuccess?.();
        }),
        useSession: vi.fn(() => ({ data: null, isPending: false, error: null })),
      }),
    }));

    vi.doMock('../../src/lib/api/notifications', () => ({
      unsubscribeWebPush: vi.fn(),
    }));

    vi.doMock('../../src/lib/library-cache', () => ({
      clearLibraryCache: vi.fn(),
      clearLegacyLibraryCache: vi.fn(),
      buildLibraryCacheNamespace: vi.fn(),
    }));

    // Mock navigator for push subscription
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        serviceWorker: {
          getRegistration: vi.fn().mockResolvedValue(undefined),
        },
      },
      writable: true,
      configurable: true,
    });

    const { signOut } = await import('../../src/lib/auth');

    // suppress location redirect
    const locationSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: '/',
    } as Location);

    await signOut();

    expect(cleanupMock).toHaveBeenCalledTimes(1);

    locationSpy.mockRestore();
  });
});
