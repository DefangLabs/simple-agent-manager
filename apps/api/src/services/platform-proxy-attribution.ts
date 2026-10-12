/** Actual upstream identity without exposing credentials to admission or agents. */
import type { drizzle } from 'drizzle-orm/d1';

import type { Env } from '../env';
import {
  resolveOpenAIPlatformCredential,
  resolveUpstreamAuth,
  UpstreamCredentialUnavailable,
} from './ai-billing';
import type { AIProxyCredentialAttribution } from './ai-proxy-shared';

export async function resolvePlatformProxyAttribution(
  env: Env,
  db: ReturnType<typeof drizzle>,
  agentType: string
): Promise<AIProxyCredentialAttribution | null> {
  try {
    const upstream =
      agentType === 'claude-code'
        ? await resolveUpstreamAuth(env, db)
        : agentType === 'openai-codex'
          ? await resolveOpenAIPlatformCredential(env, db)
          : null;
    return upstream
      ? {
          credentialReference: upstream.credentialReference,
          credentialSource: upstream.credentialSource,
          credentialProvider: upstream.credentialProvider,
          providerMode: upstream.providerMode,
        }
      : null;
  } catch (error) {
    if (error instanceof UpstreamCredentialUnavailable) return null;
    throw error;
  }
}
