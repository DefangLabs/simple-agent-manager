import type { Env } from '../../env';
import { log } from '../../lib/logger';
import {
  INVALID_PARAMS,
  jsonRpcError,
  type JsonRpcResponse,
  jsonRpcSuccess,
  type McpTokenData,
} from './_helpers';
import { getTriggerById, validateTriggerOwnership } from './trigger-tool-shared';

export async function handleDeleteTrigger(
  requestId: string | number | null,
  params: Record<string, unknown>,
  tokenData: McpTokenData,
  env: Env
): Promise<JsonRpcResponse> {
  const triggerId = typeof params.triggerId === 'string' ? params.triggerId.trim() : '';
  if (!triggerId) {
    return jsonRpcError(
      requestId,
      INVALID_PARAMS,
      'triggerId is required and must be a non-empty string'
    );
  }

  const trigger = await getTriggerById(env, triggerId);
  const ownershipError = validateTriggerOwnership(
    requestId,
    trigger,
    triggerId,
    tokenData,
    'delete'
  );
  if (ownershipError) return ownershipError;

  await env.DATABASE.prepare('DELETE FROM github_trigger_configs WHERE trigger_id = ?')
    .bind(triggerId)
    .run();
  await env.DATABASE.prepare('DELETE FROM trigger_executions WHERE trigger_id = ?')
    .bind(triggerId)
    .run();
  await env.DATABASE.prepare('DELETE FROM triggers WHERE id = ? AND project_id = ?')
    .bind(triggerId, tokenData.projectId)
    .run();

  log.info('mcp.delete_trigger', {
    triggerId,
    projectId: tokenData.projectId,
    userId: tokenData.userId,
  });

  return jsonRpcSuccess(requestId, {
    content: [{ type: 'text', text: JSON.stringify({ success: true, triggerId }) }],
  });
}
