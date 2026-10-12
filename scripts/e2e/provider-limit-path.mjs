/** Test-only Go HTTP producer → Worker callback → sleep → scheduled wake proof. */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
mkdirSync(resolve(root, '.codex/tmp'), { recursive: true });
const output = resolve(root, '.codex/tmp/provider-limit-callbacks.json');
const env = {
  ...process.env,
  GOMAXPROCS: process.env.GOMAXPROCS ?? '2',
  TEST_PROVIDER_LIMIT_CALLBACK_OUTPUT: output,
};
execFileSync(
  'go',
  [
    'test',
    '-p',
    '1',
    './internal/server',
    '-run',
    'ProviderLimitRecordedFixtureCallbacks',
    '-count=1',
  ],
  { cwd: resolve(root, 'packages/vm-agent'), env, stdio: 'inherit' }
);
execFileSync(
  'pnpm',
  ['exec', 'vitest', 'run', 'tests/integration/provider-limit-lifecycle.test.ts', '--maxWorkers=1'],
  { cwd: resolve(root, 'apps/api'), env, stdio: 'inherit' }
);
