# Reap empty managed VM nodes automatically

**SAM task:** 01M4MZSFT6YDPKQ1S2JQDSKA91 (Wave A, reliability wave `reliability-wave-1011`,
coordinator 01M4MXGVH4EMVNE1CT2XRH484J)
**Branch:** `sam/wave-reliability-wave-1011-dska91`
**Ideas:** 01M2RSNGE0M47PHA82BP89FR7E, 01M4JMDPRP7FCY6CVJEDQ0TW5A (queue 01M4DR7MBDD8AAVF1XMC2XYQEX)

## Problem

A healthy managed Hetzner cx53 node (`01M4E9JDA98JERQ69TBBN7FB4M`, 16 vCPU / 32 GB, user
capacity pool `cap-pool-default:user:4bw1FJlXCOgSGq0TsQgpiMAhQKjGOSXx`) ran about 34 h with
zero live workspaces after its last workspace left on 2026-10-09. `warm_since` stayed NULL and
no task had it as `auto_provisioned_node_id`. Raphaël deleted it by hand on 2026-10-11 ~07:48Z.
Meanwhile Hetzner refused six provisioning attempts with "shared core limit exceeded".

The "DO alarm + cron sweep + max lifetime" defense never saw the node. Goal: SAM hands every
empty managed workspace VM to NodeLifecycle so the normal warm timeout and teardown apply, and
no operator ever deletes an idle node by hand.

## Root cause (verified in production D1 and observability, read-only)

Timeline (all 2026-10-08/09 UTC):

1. 17:39:18 coordinator conversation task `01M4DNYR09RX5WQQZPM5T33DAD` woke and was
   delegated at 17:43:02 to a freshly provisioned node `01M4E9JDA98JERQ69TBBN7FB4M`. That
   task row was the node's only `tasks.auto_provisioned_node_id` link.
2. 18:14:21 the same conversation woke again. `reactivateSleepingTask()`
   (`apps/api/src/services/session-recovery.ts:87`) resets `auto_provisioned_node_id = NULL`,
   and the wake was pack-placed back onto the same existing node (no new link). From here
   no task referenced the node.
3. Every later workspace on the node (13 task rows visible in D1, 24 workspaces in
   observability) was pack-placed by the capacity pool, so `auto_provisioned_node_id` was NULL.
4. 21:45:19 (10-09) the stuck-task sweep failed task `01M4EQEJ9PS6Q4MKBKE6FY2FMB` with the
   1440-minute runaway-cost ceiling. Ceiling diagnostics in observability:
   `autoProvisionedNodeId: null`, node `running`/`healthy`.
   `recoverStuckTasks()` → `transitionTaskToTerminal()` → `cleanupTaskRun()`
   (`apps/api/src/scheduled/stuck-tasks.ts:1647`).
5. `cleanupTaskRun()` stopped the workspace (VM-agent stop, D1 `stopped`), queued the
   NodeLifecycle stopped-workspace deletion, and then handed the node to NodeLifecycle only
   `if (task.autoProvisionedNodeId)` (`apps/api/src/services/task-runner.ts:210`). NULL →
   no `markIdle()`. The node stayed `running` with NULL `warm_since`.
6. ~21:51:46 NodeLifecycle's 5-minute stopped-workspace deletion
   (`node-lifecycle-workspace-deletion.ts` `runClaimedAttempt` → `attemptWorkspaceDeletion`)
   deleted the workspace. That path never hands the node off either.
7. Cron could not see the node:
   - `sweepStaleWarmNodes` needs `warm_since` AND a task link.
   - `sweepMaxLifetimeNodes`, `sweepIncompatibleVmAgentNodes`, `sweepIdleOrphanNodes` all
     require `EXISTS tasks.auto_provisioned_node_id = n.id`.
   - `sweepUnhealthyNodes` only acts on heartbeat-lost nodes (this one was healthy).
   - `sweepStoppedHandoffNodes` / `sweepDestroyingHandoffNodes` need `stopped`/`destroying`,
     which only NodeLifecycle's warm alarm writes.

So two defects compose: (a) the last-workspace removal path keys the NodeLifecycle handoff on
a task's provisioning pointer instead of the node the workspace ran on; (b) every running-node
backstop keys ownership on that same mutable pointer, which a conversation wake erases.

The same shape is live now: production node `01M4MXF6925FF7AX8B2XNF4FK2` (6 live workspaces at
08:15Z) has pool provenance but no task link.

## Last-workspace removal paths

(Inventory: see "Path inventory" below; filled from the code search.)

## Design

1. **One shared handoff operation** (`apps/api/src/services/node-warm-handoff.ts`): given a
   node, if it is a running managed `vm` workspace node with no live workspace
   (`running|creating|recovery`) and is not already warm, call `NodeLifecycle.markIdle()` and
   wake VM admission waiters. Keyed on the node, never on `tasks.auto_provisioned_node_id`.
   NodeLifecycle stays the authority (it re-checks occupancy and node class). No destructive
   fallback: a failed handoff is logged and left to the cron backstop (the old
   `stopNodeResources` fallback raced pack placement and bypassed warm retention).
2. **`cleanupTaskRun()`** hands off `workspace.nodeId` (and `task.autoProvisionedNodeId` when
   different) through that operation. This fixes every caller at once: stuck-task ceiling and
   liveness terminalization, TaskRunner failure cleanup, task completion/archive/cancel
   (`cleanupTerminalTaskResources`), requested run cleanup, failed-task preservation release,
   attention expiry, ProjectData dead-target reconciliation, and session sleep.
3. **Sleep path** (`markWorkspaceNodeWarmIfEmpty`) moves onto the same operation instead of a
   second copy.
4. **Cron backstop** — new isolated phase `empty_node_warm_handoff` in
   `apps/api/src/scheduled/node-cleanup/empty-node-warm-handoff.ts`, after the idle-orphan
   phase. Candidates: `status='running'`, `warm_since IS NULL`, `node_class='managed'`,
   `runtime='vm'`, `node_role='workspace'`, healthy, destroy provenance
   (`cleanupNodeProvenanceSql(..., true)`: task link or server-written pool/credential
   snapshot, so the stopped-handoff sweep can finish the teardown), not in cleanup backoff,
   no live workspace, no recent warm-placement claim, no in-flight VM admission
   (`provisioning`/`node_ready`) naming the node, and last workspace activity and
   `created_at` older than `NODE_EMPTY_WARM_HANDOFF_GRACE_MS`
   (`DEFAULT_NODE_EMPTY_WARM_HANDOFF_GRACE_MS` = 30 min). Bounded by
   `NODE_CLEANUP_SWEEP_LIMIT`. Each candidate goes through the shared handoff with the default
   warm timeout (warm retention is not shortened, policy d08d64dc). Every action records a
   structured reason (`handed_to_warm`, `preserved_active`, `warm_since_not_persisted`,
   `handoff_failed`) in observability and logs. Escape paths: success sets `warm_since`;
   anything else sets `cleanup_backoff_until`.
5. Deployment nodes, user-owned nodes, cf-container nodes, unhealthy nodes (owned by the
   unhealthy sweep), and nodes with live workspaces are never candidates.

Not changed: warm timeout, stopped-handoff teardown, Phase 5 idle-orphan semantics for
task-linked nodes, `reactivateSleepingTask` (the link is a per-task provisioning record; the
fix stops depending on it rather than reviving it). No migration. The new env var is read
with a default and is not added to `wrangler.toml` (Worker text-binding headroom, wave E).

## Implementation checklist

- [ ] Shared `DEFAULT_NODE_EMPTY_WARM_HANDOFF_GRACE_MS` constant + export
- [ ] `services/node-warm-handoff.ts` shared handoff operation
- [ ] `cleanupTaskRun()` hands off by workspace node; remove `cleanupAutoProvisionedNode` /
      `markNodeIdleForReuse` (no dead code)
- [ ] Sleep path (`markWorkspaceNodeWarmIfEmpty`) uses the shared operation
- [ ] Cron phase `empty_node_warm_handoff` (new file), wired in `runNodeCleanupSweep`, new
      result counters, completion-log fields in `scheduled/handler.ts`
- [ ] Config: `emptyNodeWarmHandoffGraceMs` in `CleanupConfig`; Env field; `.env.example`
- [ ] Docs: configuration reference, architecture overview, env-reference skill, node-cleanup
      index comment
- [ ] Replace obsolete source-contract tests on `cleanupAutoProvisionedNode` with behavioral
      tests
- [ ] Worker test: real ceiling path (`recoverStuckTasks`) on a pack-placed pool node → node
      handed to warm (fails on pre-fix code)
- [ ] Worker test: backstop vertical slice → warm → NodeLifecycle alarm → `stopped` → stopped
      handoff → `deleted`
- [ ] Controls: live workspace, deployment node, within grace, user-owned, unhealthy,
      recent warm claim, in-flight admission, backoff; two-sweep escape test
- [ ] Prove discriminating: delete the backstop once, confirm the intended test goes red
- [ ] Staging: real VM through the real path, then clean up to zero VMs
- [ ] Production read-only check after deploy

## Acceptance criteria

- [ ] A task failed by the runaway ceiling on a pack-placed pool node (no
      `auto_provisioned_node_id`) leaves its node warm (`warm_since` set, NodeLifecycle `warm`).
- [ ] A running managed workspace VM with no live workspace, NULL `warm_since`, pool provenance
      and no task link, idle past the grace, is handed to NodeLifecycle by the cron sweep and is
      then torn down by the normal warm timeout + stopped handoff.
- [ ] Nodes with a live workspace, deployment nodes, user-owned nodes and nodes within the grace
      are untouched (both D1 and NodeLifecycle state).
- [ ] Each backstop action records a specific structured reason.
- [ ] Warm retention window unchanged.
- [ ] Staging: real VM reaped through the real path; zero staging VMs at the end.
- [ ] Production: no running managed workspace node with 0 live workspaces and NULL
      `warm_since` beyond the grace after deploy.

## References

- `apps/api/src/scheduled/node-cleanup/{shared,node-phases,unhealthy-nodes,index}.ts`
- `apps/api/src/services/task-runner.ts`, `apps/api/src/services/session-sleep-cleanup.ts`
- `apps/api/src/durable-objects/node-lifecycle.ts`
- `apps/api/src/scheduled/stuck-tasks.ts`, `stuck-task-ceiling.ts`
- `apps/api/src/services/session-recovery.ts` (`reactivateSleepingTask`)
- Rules: 47 (control-loop budget), 51 (node-class gates), 53 (liveness vs idleness),
  62 (real trigger), 67 (shared predicates), 74 (proxy signals), 18 (file size)
- Prior: `tasks/archive/2026-08-27-workspace-based-node-cleanup.md`,
  `tasks/archive/2026-08-06-fix-node-reaping-orphan-reconciliation.md`
