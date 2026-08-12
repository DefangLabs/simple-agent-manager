import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cleanupTerminalSecrets,
  isAuthRevoked,
  registerTerminalCleanup,
  resetAuthRevoked,
} from '../../src/lib/terminal-cleanup';

describe('terminal-cleanup', () => {
  beforeEach(() => {
    resetAuthRevoked();
    sessionStorage.clear();
  });

  afterEach(() => {
    resetAuthRevoked();
  });

  describe('registerTerminalCleanup', () => {
    it('calls registered cleanup functions on cleanupTerminalSecrets', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      const unreg1 = registerTerminalCleanup(fn1);
      const unreg2 = registerTerminalCleanup(fn2);

      cleanupTerminalSecrets();

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);

      unreg1();
      unreg2();
    });

    it('returns an unregister function that prevents future calls', () => {
      const fn = vi.fn();
      const unregister = registerTerminalCleanup(fn);
      unregister();

      cleanupTerminalSecrets();

      expect(fn).not.toHaveBeenCalled();
    });

    it('tolerates a throwing callback without blocking others', () => {
      const fn1 = vi.fn(() => {
        throw new Error('boom');
      });
      const fn2 = vi.fn();
      const unreg1 = registerTerminalCleanup(fn1);
      const unreg2 = registerTerminalCleanup(fn2);

      cleanupTerminalSecrets();

      expect(fn1).toHaveBeenCalled();
      expect(fn2).toHaveBeenCalled();

      unreg1();
      unreg2();
    });
  });

  describe('isAuthRevoked / resetAuthRevoked', () => {
    it('starts as false', () => {
      expect(isAuthRevoked()).toBe(false);
    });

    it('becomes true after cleanupTerminalSecrets', () => {
      cleanupTerminalSecrets();
      expect(isAuthRevoked()).toBe(true);
    });

    it('resets to false via resetAuthRevoked', () => {
      cleanupTerminalSecrets();
      expect(isAuthRevoked()).toBe(true);
      resetAuthRevoked();
      expect(isAuthRevoked()).toBe(false);
    });
  });

  describe('sessionStorage cleanup', () => {
    it('removes all sam-terminal-sessions-* keys including bearer URLs', () => {
      const realisticPayload = JSON.stringify({
        sessions: [{ name: 'Terminal 1', order: 0, serverSessionId: 's1' }],
        counter: 2,
        wsUrl: 'wss://ws-abc123.sammy.party/terminal/ws/multi?token=test-placeholder.fake-bearer',
      });
      sessionStorage.setItem('sam-terminal-sessions-ws1', realisticPayload);
      sessionStorage.setItem('sam-terminal-sessions-ws2', '{"sessions":[]}');
      sessionStorage.setItem('other-key', 'keep');

      cleanupTerminalSecrets();

      expect(sessionStorage.getItem('sam-terminal-sessions-ws1')).toBeNull();
      expect(sessionStorage.getItem('sam-terminal-sessions-ws2')).toBeNull();
      expect(sessionStorage.getItem('other-key')).toBe('keep');
    });

    it('ensures no token substring remains in sessionStorage after cleanup', () => {
      const tokenSubstring = 'test-placeholder';
      sessionStorage.setItem(
        'sam-terminal-sessions-ws1',
        `{"wsUrl":"wss://ws-x.sammy.party/terminal/ws?token=${tokenSubstring}.rest"}`
      );

      cleanupTerminalSecrets();

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)!;
        const value = sessionStorage.getItem(key) ?? '';
        expect(value).not.toContain(tokenSubstring);
      }
    });

    it('leaves sessionStorage untouched when no terminal keys exist', () => {
      sessionStorage.setItem('unrelated', 'data');

      cleanupTerminalSecrets();

      expect(sessionStorage.getItem('unrelated')).toBe('data');
    });
  });

  describe('idempotency', () => {
    it('can be called multiple times safely', () => {
      const fn = vi.fn();
      const unreg = registerTerminalCleanup(fn);

      cleanupTerminalSecrets();
      cleanupTerminalSecrets();
      cleanupTerminalSecrets();

      expect(fn).toHaveBeenCalledTimes(3);
      expect(isAuthRevoked()).toBe(true);

      unreg();
    });
  });
});
