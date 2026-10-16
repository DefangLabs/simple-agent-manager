/** Fail-closed occupancy checks used inside NodeLifecycle's serialized idle transition. */
import { DEFAULT_NODE_WORKSPACE_IDLE_TIMEOUT_MS } from '@simple-agent-manager/shared';

import { log } from '../lib/logger';
import { parsePositiveInt } from '../lib/route-helpers';
import { boundedWarmPlacementClaimGuardSql } from '../services/warm-placement-claims';
import { ACTIVE_WORKSPACE_RESERVATION_STATUS_SQL } from '../services/workspace-resource-capacity';
import type { NodeLifecycleEnv } from './node-lifecycle-types';

/** A live admission owns capacity before its workspace exists, for a finite window only. */
export async function hasRecentPlacementClaim(
  env: NodeLifecycleEnv,
  nodeId: string
): Promise<boolean> {
  const claimWindowMs = parsePositiveInt(
    env.NODE_WORKSPACE_IDLE_TIMEOUT_MS ?? env.NODE_ORPHAN_IDLE_TIMEOUT_MS,
    DEFAULT_NODE_WORKSPACE_IDLE_TIMEOUT_MS
  );
  try {
    const row = await env.DATABASE.prepare(
      `SELECT 1 AS unclaimed WHERE 1 = 1 ${boundedWarmPlacementClaimGuardSql('?')}`
    )
      .bind(nodeId, new Date(Date.now() - claimWindowMs).toISOString())
      .first<{ unclaimed: number }>();
    return row === null;
  } catch (error) {
    log.warn('node_lifecycle.placement_claim_unknown', { nodeId, error: String(error) });
    return true;
  }
}

export async function hasActiveWorkspace(env: NodeLifecycleEnv, nodeId: string): Promise<boolean> {
  try {
    const row = await env.DATABASE.prepare(
      `SELECT 1 AS occupied FROM workspaces WHERE node_id = ?
          AND status IN (${ACTIVE_WORKSPACE_RESERVATION_STATUS_SQL}) LIMIT 1`
    )
      .bind(nodeId)
      .first<{ occupied: number }>();
    return row !== null;
  } catch (error) {
    // Never turn an uncertain occupancy read into a destructive fallback.
    log.warn('node_lifecycle.occupancy_unknown', { nodeId, error: String(error) });
    return true;
  }
}
