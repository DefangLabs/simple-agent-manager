/**
 * Hand an empty managed workspace VM to NodeLifecycle, so the warm timeout, warm reuse and the
 * cleanup sweep's stopped-node teardown apply to it.
 *
 * Every last-workspace removal path and the cleanup sweep's backstop call this one operation.
 * It is keyed on the node itself, never on `tasks.auto_provisioned_node_id`: a task pack-placed
 * onto an existing pool node never records that link, and a woken conversation clears the one
 * it had (`reactivateSleepingTask`). Keying on it left a healthy cx53 running empty for 34 h
 * (tasks/archive/2026-10-11-reap-empty-managed-vm-nodes.md).
 *
 * NodeLifecycle stays the authority: `markIdle()` re-checks occupancy and node class inside the
 * Durable Object, so the read below only avoids pointless RPCs. A node without teardown
 * provenance is never handed off, because once its warm timer marks it `stopped` the cleanup
 * sweep could not destroy it and the VM would keep running behind a `stopped` row.
 *
 * Never throws and never destroys anything. A failed handoff is returned to the caller; the
 * cleanup sweep's backstop (`empty-node-warm-handoff.ts`) retries nodes that stay empty.
 */
import type { Env } from '../env';
import { log } from '../lib/logger';
import * as nodeLifecycleService from './node-lifecycle';
import { cleanupNodeProvenanceSql } from './node-teardown-provenance';
import { wakeVmAdmissionWaiters } from './vm-admission-wakeup';
import { ACTIVE_WORKSPACE_RESERVATION_STATUS_SQL } from './workspace-resource-capacity';

export type NodeWarmHandoffSkipReason =
  | 'node_missing'
  | 'owner_mismatch'
  | 'not_vm'
  | 'not_workspace_role'
  | 'not_managed'
  | 'not_running'
  | 'already_warm'
  | 'no_teardown_provenance'
  | 'occupied';

export type NodeWarmHandoffResult =
  | { outcome: 'handed_to_warm' }
  /** NodeLifecycle kept the node active: a workspace or claim arrived first. */
  | { outcome: 'preserved_active' }
  | { outcome: 'skipped'; reason: NodeWarmHandoffSkipReason }
  | { outcome: 'failed'; error: string };

export interface NodeWarmHandoffInput {
  nodeId: string;
  /** Diagnostic label naming the removal path, e.g. `task_run_cleanup`. */
  reason: string;
  /** When set, a node owned by anyone else is left alone. */
  expectedUserId?: string | null;
  /** Project warm-retention override; null uses NODE_WARM_TIMEOUT_MS. */
  warmTimeoutOverrideMs?: number | null;
}

interface HandoffNodeRow {
  user_id: string;
  status: string;
  warm_since: string | null;
  node_class: string;
  runtime: string;
  node_role: string;
  teardown_provenance: number;
  occupied: number;
}

function skipReason(
  node: HandoffNodeRow | null,
  expectedUserId: string | null | undefined
): NodeWarmHandoffSkipReason | null {
  if (!node) return 'node_missing';
  if (expectedUserId && node.user_id !== expectedUserId) return 'owner_mismatch';
  if (node.runtime !== 'vm') return 'not_vm';
  if (node.node_role !== 'workspace') return 'not_workspace_role';
  // Fail closed: only SAM-provisioned hardware enters the warm → teardown pipeline.
  if (node.node_class !== 'managed') return 'not_managed';
  if (node.status !== 'running') return 'not_running';
  // A second markIdle would restart a warm timer another path already armed.
  if (node.warm_since) return 'already_warm';
  if (node.teardown_provenance !== 1) return 'no_teardown_provenance';
  if (node.occupied === 1) return 'occupied';
  return null;
}

export async function handOffEmptyWorkspaceNode(
  env: Env,
  input: NodeWarmHandoffInput
): Promise<NodeWarmHandoffResult> {
  const logContext = { nodeId: input.nodeId, reason: input.reason };
  try {
    const node = await env.DATABASE.prepare(
      `SELECT n.user_id, n.status, n.warm_since, n.node_class, n.runtime, n.node_role,
              CASE WHEN ${cleanupNodeProvenanceSql('n', true)} THEN 1 ELSE 0 END
                AS teardown_provenance,
              EXISTS (
                SELECT 1 FROM workspaces live
                WHERE live.node_id = n.id
                  AND live.status IN (${ACTIVE_WORKSPACE_RESERVATION_STATUS_SQL})
              ) AS occupied
         FROM nodes n
        WHERE n.id = ?`
    )
      .bind(input.nodeId)
      .first<HandoffNodeRow>();

    const skipped = skipReason(node, input.expectedUserId);
    if (skipped || !node) {
      log.info('node_warm_handoff.skipped', { ...logContext, skipReason: skipped });
      return { outcome: 'skipped', reason: skipped ?? 'node_missing' };
    }

    const state = await nodeLifecycleService.markIdle(
      env,
      input.nodeId,
      node.user_id,
      input.warmTimeoutOverrideMs ?? null
    );
    if (state.status !== 'warm') {
      log.info('node_warm_handoff.preserved_active', { ...logContext, state: state.status });
      return { outcome: 'preserved_active' };
    }

    log.info('node_warm_handoff.handed_to_warm', {
      ...logContext,
      userId: node.user_id,
      warmSince: state.warmSince,
      warmTimeoutOverrideMs: input.warmTimeoutOverrideMs ?? null,
    });
    try {
      // A warm node is reusable capacity: let queued admissions claim it now.
      await wakeVmAdmissionWaiters(env, { userId: node.user_id, reason: 'node_marked_warm' });
    } catch (error) {
      log.warn('node_warm_handoff.admission_wake_failed', {
        ...logContext,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { outcome: 'handed_to_warm' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('node_warm_handoff.failed', { ...logContext, error: message });
    return { outcome: 'failed', error: message };
  }
}
