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

## Last-workspace removal paths (inventory at `eb18d9c93`)

"Handoff" = the node reaches `NodeLifecycle.markIdle()`. `[AP]` = only when the task row had
`auto_provisioned_node_id`. CTR = `cleanupTaskRun()`, TTC = `cleanupTerminalTaskResources()`
(ends in CTR, or queues a sleep for completed/failed chat-backed tasks).

| # | Path | Before | After this change |
|---|------|--------|-------------------|
| 1 | `DELETE /api/workspaces/:id` → `cleanupWorkspaceForDeletion()` | No | Yes, on confirmed deletion |
| 2 | Chat Archive `POST /tasks/:t/close` → same service | No | Yes, on confirmed deletion |
| 3 | `POST /api/workspaces/:id/stop` | No (schedules deletion only) | Yes, after the stop is finalized |
| 4 | Restart/rebuild failure (`creating` → `error`/`evicted`) | No | Backstop |
| 5 | Session sleep (explicit, cron, bounded fallback) | Yes (`markWorkspaceNodeWarmIfEmpty`) | Yes, shared operation |
| 6 | Sleep lifecycle repair | Yes | Yes, shared operation |
| 7–14 | Task Complete/Fail/Cancel/Delete, chat stop, VM-agent status callback, MCP `complete_task`, `stop_subtask` (TTC → CTR) | Sleep path yes, else `[AP]` | Yes (CTR keyed on the workspace's node) |
| 15 | `retry_subtask` (leaves the workspace running; orphan sweep stops it) | No | Backstop |
| 17 | Stuck-task cron: queued/delegated timeouts, **runaway ceiling (incident)**, liveness, dead runtime, compaction loop (→ CTR) | `[AP]` | Yes |
| 18 | Stalled-classifier branch (TTC) | Sleep or `[AP]` | Yes |
| 19 | ProjectData dead-target reconciliation (→ CTR) | `[AP]` | Yes |
| 20 | ProjectData attention expiry (→ CTR) | `[AP]` | Yes |
| 21 | Failed-task preservation release (→ CTR) | `[AP]` | Yes |
| 22 | Cron `sweepOrphanedWorkspaces` | No | Backstop |
| 24 | NodeLifecycle stopped-workspace deletion queue | No | Backstop (the stop/sleep that preceded it now hands off) |
| 25 | OOM eviction callback (source node) | No | Backstop |
| 26–28 | ProjectData idle cleanup, workspace idle timeout, heartbeat-timeout coupling | No | Backstop |
| 29 | TaskRunner DO failure cleanup | With workspace `[AP]`; no workspace: direct `markIdle`; reused node without workspace: no | With workspace: yes (CTR); other branches unchanged, backstop covers the reused-node case |
| 31 | `creating` → `error` writers (provisioning timeout, `/ready` re-dispatch, `/provisioning-failed`, direct provisioning exhaustion) | No | Backstop |
| 32 | Trial expiry on a shared node (→ #1 machinery) | No | Yes, on confirmed deletion |

Not removal decision points: `transitionTaskToTerminal()` (its callers then run CTR), the lifecycle
finalizer, `sweepStaleStoppedWorkspaces` (rows already stopped), node-level teardown and
cf-container writers (node destroyed, terminal, or not a VM).

The incident path was #17: the ceiling's CTR call had no `auto_provisioned_node_id`, and the
5-minute deletion queue (#24) that deleted the workspace at ~21:51:46Z never hands off.

Backstop latency for the remaining paths: the grace (30 min after the last workspace activity),
then the unchanged warm window (30 min), then the next stopped-handoff sweep (≤5 min).

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
   no live workspace, no recent warm-placement claim, and last workspace activity (falling back
   to `created_at`) older than `NODE_EMPTY_WARM_HANDOFF_GRACE_MS`
   (`DEFAULT_NODE_EMPTY_WARM_HANDOFF_GRACE_MS` = 30 min). In-flight provisioning is covered by
   `status='running'` plus that clock; reservations are live workspace rows. Bounded by
   `NODE_CLEANUP_SWEEP_LIMIT`. Each candidate goes through the shared handoff with the default
   warm timeout (warm retention is not shortened, policy d08d64dc). Every action is recorded in
   observability (`recoveryType: 'empty_node_warm_handoff'`) with one reason:
   `missed_warm_handoff`, `preserved_active`, `warm_since_not_persisted` or `handoff_failed`.
   Escape paths: success sets `warm_since`; anything else sets `cleanup_backoff_until`.
5. Deployment nodes, user-owned nodes, cf-container nodes, unhealthy nodes (owned by the
   unhealthy sweep), and nodes with live workspaces are never candidates.

Not changed: warm timeout, stopped-handoff teardown, Phase 5 idle-orphan semantics for
task-linked nodes, `reactivateSleepingTask` (the link is a per-task provisioning record; the
fix stops depending on it rather than reviving it). No migration. The new env var is read
with a default and is not added to `wrangler.toml` (Worker text-binding headroom, wave E).

## Implementation checklist

- [x] Shared `DEFAULT_NODE_EMPTY_WARM_HANDOFF_GRACE_MS` constant + export
- [x] `services/node-warm-handoff.ts` shared handoff operation (never throws, destroys nothing)
- [x] `services/node-teardown-provenance.ts`: `cleanupNodeProvenanceSql` moved from
      `scheduled/node-cleanup/shared.ts` (re-exported there, unchanged) so the service can use it
- [x] `cleanupTaskRun()` hands off by workspace node; removed `cleanupAutoProvisionedNode` /
      `markNodeIdleForReuse` and its destructive `stopNodeResources` fallback
- [x] Sleep path uses the shared operation; removed `markWorkspaceNodeWarmIfEmpty` and the
      `nodeRole`/`runtime` selections only it read
- [x] Archive/delete (`cleanupWorkspaceForDeletion`) and the workspace Stop route hand off
- [x] Cron phase `empty_node_warm_handoff` (new file), wired in `runNodeCleanupSweep`, new
      result counters, completion-log fields in `scheduled/handler.ts`
- [x] Config: `emptyNodeWarmHandoffGraceMs` in `CleanupConfig`; Env field; `.env.example`
      (no `wrangler.toml` var: Worker text-binding headroom, wave E)
- [x] Docs: configuration reference, architecture overview, compute-pools guide, env-reference
      skill, CLAUDE.md, node-cleanup index comment
- [x] Replaced obsolete source-contract tests on `cleanupAutoProvisionedNode` with behavioral
      tests (deleted `tests/unit/task-runner-warm.test.ts`)
- [x] Worker test: real ceiling path (`recoverStuckTasks`) on a pack-placed pool node → node
      handed to warm (fails on pre-fix code)
- [x] Worker test: backstop vertical slice → warm → NodeLifecycle alarm → `stopped` → stopped
      handoff → strict provider DELETE → `deleted`
- [x] Controls: live workspace, deployment, within grace, fresh node, user-owned, unhealthy,
      sleeping Instant container, no provenance, cleanup backoff, recent warm claim, already warm;
      two-sweep escape tests for a failed handoff and an unpersisted `warm_since`
- [x] Proven discriminating (see below)
- [ ] Staging: real VM through the real path, then clean up to zero VMs
- [ ] Production read-only check after deploy

## Discrimination evidence (rule 62)

- Backstop phase deleted from `runNodeCleanupSweep`: exactly the 5 backstop tests went red; the
  13 handoff/path tests stayed green.
- `cleanupTaskRun` reverted to `[AP]` gating: only "runaway-cost ceiling on a pack-placed task
  warms its node" went red.
- Archive handoff removed: only "archiving the last conversation on a node warms it immediately"
  went red.
- Each backstop query predicate deleted one at a time: health, backoff, warm claim, live
  workspace, `warm_since`, provenance, class, role, runtime → the excluded-shapes test went red;
  the idle clock → excluded-shapes and grace tests went red. Class/role/runtime needed task-linked
  controls (a task link alone satisfies provenance). A separate `created_at < grace` predicate was
  redundant with the `COALESCE(..., created_at)` idle clock and was removed.
- Dropped an in-flight VM admission guard from the design: workspace reservation is atomic against
  a `running` node and the warm alarm re-checks occupancy, so it protected nothing.

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
