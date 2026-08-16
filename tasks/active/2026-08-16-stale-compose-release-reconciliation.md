# Reconcile stale compose deployment releases

## Problem

R2 compose image archives under `compose-image-artifacts/` remain protected as long as any
persisted `deployment_releases.manifest` references them. The existing scheduled pipeline
correctly deletes only old unreferenced archives: release retention runs first, then
`runComposeImageArtifactCleanup()` recomputes references and deletes old unreferenced objects.

Production investigation on 2026-08-16 found stale `deployment_releases.status = 'applying'`
rows from 2026-06-26/27 that still reference 9 compose archives / 5.903 GB. Current release
retention intentionally fails closed for every non-terminal status, so those rows are never
pruned and their R2 archives never become unreferenced.

This task must add a bounded, configurable reconciliation step that transitions only provably
stale non-terminal compose releases to a terminal state. Active deploys, observed-applied
releases, newest rollback releases, and ambiguous/future statuses must remain protected.

## Research findings

- `apps/api/src/scheduled/d1-retention.ts:runDeploymentReleaseRetention()` deletes only
  terminal `applied`/`failed` release rows outside the newest-N window and not matching
  `deployment_environments.observed_applied_seq`.
- `apps/api/src/scheduled/compose-image-artifact-cleanup.ts:runComposeImageArtifactCleanup()`
  scans surviving release manifests for `compose-image-artifacts/` references and fails closed
  on malformed relevant manifests.
- `apps/api/src/routes/deploy-release-callback.ts` marks a release `applying` when a deployment
  node fetches a signed apply payload. The row has no status timestamp today, so status age is
  not independently tracked.
- `apps/api/src/routes/node-lifecycle.ts` receives authenticated deployment-node heartbeats,
  persists `observed_applied_seq`, `observed_status`, `observed_at`, and only asks a node to
  apply the latest release when the latest row is `created`, or when it is `applying` but the
  node is not currently reporting `applying`.
- `apps/api/src/services/deployment-control.ts:reconcileDeploymentReleaseStatuses()` maps
  observed runtime status back to release rows: observed `applied` marks the observed seq
  `applied`; observed terminal failure marks the failed seq `failed`; observed `applying`
  is an active-deploy signal.
- `packages/vm-agent/internal/deploy/engine.go` reports `applying`, then either `applied`,
  `failed`, `failed-initial`, or `reverted`. `packages/vm-agent/internal/server/health.go`
  also has an apply watchdog and emits release events during fetch/apply progress.
- `deployment_release_events` provide a cheap D1-only activity/lease signal for apply progress.
  A stale reconciler can protect any release with recent events without calling the node.
- The retained post-mortem in `tasks/archive/2026-08-07-fix-provisioning-node-cleanup-race.md`
  shows cleanup jobs must model the real ownership/state-machine interleaving, not just
  downstream idle state. This task needs deterministic D1 tests for fresh, active, stale,
  concurrent, and ambiguous release states.
- `.claude/rules/47-control-loop-io-budget.md` requires bounded candidate sets and an escape
  path for every selected candidate. The reconciliation must be D1-only, batch-limited, and
  idempotent.
- `apps/www/src/content/blog/sams-journal-the-cleanup-job-asked-d1-first.md` documents the
  core safety rule: R2 artifact cleanup must treat D1 release references as the source of truth,
  never object age alone.
- The separate degraded sleeping session snapshot purge gap is intentionally out of scope for
  this PR unless a tiny shared lifecycle abstraction becomes clearly safer.

## Implementation checklist

- [x] Add additive D1 schema/migration support for release status timestamps needed to make
      stale-state reconciliation race-safe.
- [x] Update release creation/apply/status-transition paths to maintain status timestamp data
      and avoid late apply-fetch overwriting a reconciled terminal status.
- [x] Add configurable stale non-terminal release reconciliation to the scheduled release
      retention path, with safe defaults, kill switch, batch bound, observed-state gate, recent
      event lease, compose-artifact scope, and fail-closed handling for unknown statuses.
- [x] Preserve observed-applied release and newest rollback protection by keeping terminalized
      stale rows subject to the existing terminal release-retention query.
- [x] Ensure the scheduled ordering is reconciliation → terminal release retention → compose
      artifact cleanup so a single scheduled run can make stale old releases unreferenced before
      R2 cleanup.
- [x] Add deterministic tests for fresh applying protection, stale reconciliation, observed
      applied protection, cleanup ordering, batching/concurrency/idempotency, disabled/configured
      behavior, and malformed/future statuses.
- [x] Update `Env`, `.env.example`, generated deployment variable allowlists, env reference, and
      public configuration/architecture docs for the new knobs and stale definition.
- [x] Capture the degraded sleeping snapshot purge gap as a SAM Idea unless addressed in this PR
      by a clearly shared lifecycle abstraction.
- [x] Run focused tests while implementing, then full local validation required by `/do`.
- [ ] Run required specialist reviews: Cloudflare, constitution, documentation sync, env
      validation, task completion, and test engineering.
- [ ] Push the branch, create a PR against `main`, include required preflight/specialist
      evidence, monitor CI, fix failures until required checks are green, and leave the PR open
      and unmerged.

## Implementation notes

- Out-of-scope degraded sleeping session snapshot purge follow-up captured as SAM Idea
  `01M05HTJHCWXCG5YZJ6TB3Y2AG`.

## Local validation evidence

- `pnpm typecheck` — passed
- `pnpm lint` — passed with pre-existing warnings only
- `pnpm quality:migration-safety` — passed
- `pnpm quality:wrangler-bindings` — passed
- `pnpm --filter @simple-agent-manager/api typecheck` — passed after final test coverage
  adjustment
- `pnpm --filter @simple-agent-manager/api lint` — passed after final test coverage
  adjustment
- `pnpm --filter @simple-agent-manager/api test -- tests/unit/services/deployment-control.test.ts tests/unit/routes/deploy-release-callback.test.ts tests/unit/routes/compose-publish-release-callback.test.ts tests/unit/routes/deployment-release-compose-submission.test.ts tests/unit/routes/deployment-environment-observability.test.ts tests/unit/routes/deployment-environment-lifecycle-vertical.test.ts tests/unit/services/deployment-volumes.test.ts tests/unit/scheduled/d1-retention.test.ts`
  — passed, 8 files / 143 tests
- `pnpm --filter @simple-agent-manager/api test` — passed, 547 files / 7,367 tests

## Acceptance criteria

- Fresh `created`/`applying` compose releases remain protected.
- Releases actively reported as `applying`, or with recent apply/fetch events, remain protected.
- A stale non-terminal compose release with old status activity, stable authoritative observed
  node state, no recent release activity, and not matching `observed_applied_seq` transitions to
  terminal `failed`.
- Unknown/future/malformed release statuses and ambiguous observed environment state are not
  modified.
- Existing terminal release retention still protects observed-applied and newest-N releases, and
  only deletes terminal releases outside that window.
- R2 compose artifact cleanup continues to fail closed on malformed relevant manifests and only
  deletes old unreferenced objects.
- The reconciler is D1-only, batch-bounded, configurable, disabled by kill switch, and idempotent.
- CI required checks are green on the PR; the PR remains open/unmerged.
