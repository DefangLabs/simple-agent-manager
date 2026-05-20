import type { Env } from '../env';
import { fetchWithTimeout, getTimeoutMs } from './fetch-timeout';

const DEFAULT_CLOUDFLARE_REGISTRY_HOST = 'registry.cloudflare.com';
const DEFAULT_CREDENTIAL_EXPIRATION_MINUTES = 120;
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

export interface DevcontainerCacheCredentials {
  registry: string;
  username: string;
  password: string;
  ref: string;
}

interface CloudflareRegistryCredentialsResponse {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: {
    registry_host?: string;
    username?: string;
    password?: string;
  };
}

interface CacheConfig {
  accountId: string;
  apiToken: string;
  registryHost: string;
  repositoryPrefix: string;
  expirationMinutes: number;
  timeoutMs: number;
}

export function isDevcontainerCacheEnabled(env: Pick<Env, 'DEVCONTAINER_CACHE_ENABLED'>): boolean {
  return env.DEVCONTAINER_CACHE_ENABLED === 'true';
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getCacheConfig(env: Env): CacheConfig | null {
  if (!isDevcontainerCacheEnabled(env)) {
    return null;
  }

  const accountId = (env.DEVCONTAINER_CACHE_CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim();
  const apiToken = (env.DEVCONTAINER_CACHE_CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim();
  if (!accountId || !apiToken) {
    return null;
  }

  return {
    accountId,
    apiToken,
    registryHost: (env.DEVCONTAINER_CACHE_REGISTRY_HOST || DEFAULT_CLOUDFLARE_REGISTRY_HOST).trim(),
    repositoryPrefix: (env.DEVCONTAINER_CACHE_REPOSITORY_PREFIX || '').trim(),
    expirationMinutes: parsePositiveInteger(
      env.DEVCONTAINER_CACHE_CREDENTIAL_EXPIRATION_MINUTES,
      DEFAULT_CREDENTIAL_EXPIRATION_MINUTES
    ),
    timeoutMs: getTimeoutMs(env.CF_API_TIMEOUT_MS),
  };
}

function parseGitHubRepo(repository: string): { owner: string; repo: string } | null {
  const value = repository.trim();
  if (!value) {
    return null;
  }
  if (value.startsWith('git@github.com:')) {
    return splitOwnerRepo(stripGitSuffix(value.slice('git@github.com:'.length)));
  }
  if (value.includes('://')) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return null;
    }
    if (url.hostname !== 'github.com') {
      return null;
    }
    return splitOwnerRepo(stripGitSuffix(trimSlashes(decodeURIComponent(url.pathname))));
  }
  return splitOwnerRepo(value);
}

function splitOwnerRepo(path: string): { owner: string; repo: string } | null {
  const [owner, repo] = path.split('/');
  if (!owner || !repo) {
    return null;
  }
  return { owner, repo };
}

function sanitizeRepositoryComponent(value: string): string {
  return trimHyphens(replaceInvalidRepositoryChars(value.toLowerCase()));
}

function sanitizeRepositoryPrefix(value: string): string {
  return trimLeadingHyphens(replaceInvalidRepositoryChars(value.toLowerCase()));
}

function stripGitSuffix(value: string): string {
  return value.endsWith('.git') ? value.slice(0, -4) : value;
}

function trimSlashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) === 47) {
    start += 1;
  }
  while (end > start && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(start, end);
}

function trimHyphens(value: string): string {
  return trimTrailingHyphens(trimLeadingHyphens(value));
}

function trimLeadingHyphens(value: string): string {
  let start = 0;
  while (start < value.length && value.charCodeAt(start) === 45) {
    start += 1;
  }
  return value.slice(start);
}

function trimTrailingHyphens(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 45) {
    end -= 1;
  }
  return value.slice(0, end);
}

function replaceInvalidRepositoryChars(value: string): string {
  let result = '';
  let lastWasHyphen = false;
  for (const char of value) {
    if (isRepositoryChar(char)) {
      result += char;
      lastWasHyphen = false;
    } else if (!lastWasHyphen) {
      result += '-';
      lastWasHyphen = true;
    }
  }
  return result;
}

function isRepositoryChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 46 ||
    code === 95 ||
    code === 45
  );
}

function cacheTag(devcontainerConfigName?: string | null): string {
  const configName = (devcontainerConfigName || '').trim();
  if (!configName) {
    return 'devcontainer-cache';
  }
  return `devcontainer-cache-${sanitizeRepositoryComponent(configName)}`;
}

export function buildCloudflareDevcontainerCacheRef(
  registryHost: string,
  accountId: string,
  repositoryPrefix: string,
  repository: string,
  devcontainerConfigName?: string | null
): string | null {
  const parsed = parseGitHubRepo(repository);
  if (!parsed) {
    return null;
  }

  const prefix = sanitizeRepositoryPrefix(repositoryPrefix);
  const owner = sanitizeRepositoryComponent(parsed.owner);
  const repo = sanitizeRepositoryComponent(parsed.repo);
  const repositoryName = `${prefix}${owner}-${repo}`;
  if (!repositoryName || !owner || !repo) {
    return null;
  }

  return `${registryHost}/${accountId}/${repositoryName}:${cacheTag(devcontainerConfigName)}`;
}

async function mintCloudflareRegistryCredentials(config: CacheConfig): Promise<Omit<DevcontainerCacheCredentials, 'ref'>> {
  const url = `${CLOUDFLARE_API_BASE}/accounts/${config.accountId}/containers/registries/${config.registryHost}/credentials`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      expiration_minutes: config.expirationMinutes,
      permissions: ['pull', 'push'],
    }),
  }, config.timeoutMs);

  const body = await response.json<CloudflareRegistryCredentialsResponse>().catch(() => null);
  if (!response.ok || !body?.result) {
    const message = body?.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(`Cloudflare registry credential mint failed: ${message}`);
  }

  const registry = (body.result.registry_host || config.registryHost).trim();
  const username = (body.result.username || '').trim();
  const password = body.result.password || '';
  if (!registry || !username || !password) {
    throw new Error('Cloudflare registry credential response was missing registry, username, or password');
  }

  return { registry, username, password };
}

export async function getDevcontainerCacheCredentials(
  env: Env,
  repository: string,
  devcontainerConfigName?: string | null
): Promise<DevcontainerCacheCredentials | null> {
  const config = getCacheConfig(env);
  if (!config) {
    return null;
  }

  const ref = buildCloudflareDevcontainerCacheRef(
    config.registryHost,
    config.accountId,
    config.repositoryPrefix,
    repository,
    devcontainerConfigName
  );
  if (!ref) {
    return null;
  }

  const credentials = await mintCloudflareRegistryCredentials(config);
  return { ...credentials, ref };
}
