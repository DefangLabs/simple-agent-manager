export const TERMINAL_SESSION_STORAGE_PREFIX = 'sam-terminal-sessions-';

type CleanupFn = () => void;
const cleanupCallbacks = new Set<CleanupFn>();
let authRevoked = false;

export function registerTerminalCleanup(fn: CleanupFn): () => void {
  cleanupCallbacks.add(fn);
  return () => {
    cleanupCallbacks.delete(fn);
  };
}

export function isAuthRevoked(): boolean {
  return authRevoked;
}

export function resetAuthRevoked(): void {
  authRevoked = false;
}

export function cleanupTerminalSecrets(): void {
  authRevoked = true;

  for (const fn of cleanupCallbacks) {
    try {
      fn();
    } catch {
      // best-effort — never let one callback block the rest
    }
  }

  clearTerminalSessionStorage();
}

function clearTerminalSessionStorage(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(TERMINAL_SESSION_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // sessionStorage unavailable (private browsing, etc.)
  }
}
