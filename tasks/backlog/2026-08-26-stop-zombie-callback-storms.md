# Stop zombie callback storms after resource teardown

**Created**: 2026-08-26  
**Type**: Reliability / observability severity fix  
**Priority**: P2 — production noise and incorrect severity/status from the 2026-08-25 stability audit

## Problem

The 2026-08-25 production stability audit found the largest 48-hour error cluster was 1,965 `Expired JWT timestamp check` API errors. 1,962 came from one deleted node that continued retrying node-level heartbeats for days after deletion. D1 had the node row at `status='deleted'`, but zombie heartbeats still wrote `health_status='healthy'`, and every expired callback-token failure surfaced as HTTP 500.

The audit also found 130 inactive-workspace message write rejects in three storms from superseded or terminated agents flushing after teardown.

Two defects need to be fixed:

1. Expired/tombstoned callback authentication is reported as a server fault instead of a designed terminal callback response.
2. The VM agent does not stop or bound its outbound retries after the control plane says the callback resource is gone.

## Audit source

SAM library file:

- `/reliability/audits/production-stability-audit-2026-08-25.md`
- file id `01M0XK1XYNB34YB0X6Z41HM542`
- section: “High-volume clusters”

Relevant audit rows:

- `Expired JWT timestamp check`: 1,965 API errors; 1,962 from one deleted node; deleted D1 row still read healthy; wrong HTTP 500/error-level severity.
- `Inactive workspace write rejects`: 130 write rejects from terminated/superseded agents flushing messages after teardown.
- Required test gap: integration test with a deleted/tombstoned node and expired callback token; assert designed status codes, retry termination or capped backoff, no 500s, and no live-node regression.

## Relevant rules and prior incidents

- `.claude/rules/34-vm-agent-callback-auth.md`: callback routes must use callback JWT auth and stay mounted before session-auth routers. Do not move these routes behind BetterAuth/session middleware.
- `.claude/rules/54-vm-agent-rollout-compatibility.md`: the control-plane status/severity fix must stand alone because old deployed agents must remain protocol-compatible until refreshed.
- `tasks/archive/2026-03-06-fix-heartbeat-token-expiry.md`: heartbeat callback tokens previously expired after 24h and caused heartbeat failures to surface as 500s.
- `tasks/archive/2026-03-12-fix-workspace-callback-auth-middleware-leak.md`: workspace callbacks were broken by Hono wildcard session-auth middleware. Behavioral tests must go through combined route wiring.
- `tasks/archive/2026-03-25-deployment-identity-token-middleware-leak.md` and `tasks/archive/2026-05-12-fix-agent-auth-failures.md`: same route-mounting bug class affected project-scoped callback/token routes.

## Research findings

- `apps/api/src/services/jwt.ts:verifyCallbackToken()` lets `jose.jwtVerify()` errors bubble as non-`AppError`; the global handler converts expired/malformed callback JWTs to 500.
- `apps/api/src/middleware/app-error-handler.ts` logs all `AppError` 4xx responses through `log.error('request_error', ...)`, so designed callback rejections still carry error-level console severity.
- `apps/api/src/routes/node-lifecycle.ts` authenticates `POST /api/nodes/:id/heartbeat` before reading the node, then updates `lastHeartbeatAt` and `healthStatus='healthy'` even when the node row is already `status='deleted'`.
- `apps/api/src/routes/node-lifecycle.ts` `POST /api/nodes/:id/ready` can also update a node to running after auth without checking tombstone state.
- `apps/api/src/routes/projects/node-acp-heartbeat.ts` validates callback-token binding but does not check that the reported node is live before updating ProjectData ACP heartbeats.
- `apps/api/src/routes/workspaces/runtime.ts` rejects inactive message workspaces with 400 and persisted warn rows; this is terminal for the current batch but still noisy if an old agent keeps generating batches.
- `packages/vm-agent/internal/server/health.go` and `packages/vm-agent/internal/server/acp_heartbeat.go` log non-2xx heartbeat responses and keep retrying on every tick.
- `packages/vm-agent/internal/messagereport/reporter.go` discards individual permanent-error batches, but it does not enter a terminal disabled state, so a torn-down agent can enqueue and send more permanent-failure batches forever.

## Implementation checklist

### Control plane

- [ ] Convert expired/invalid callback JWT verification failures into designed 401 `AppError`s while preserving genuine key/import/auth-system faults as 5xx errors.
- [ ] Lower global `AppError` 4xx logging from error-level to bounded low severity, without changing 5xx error persistence.
- [ ] Return a terminal 410-class response for node callbacks targeting missing/deleted/tombstoned nodes before mutating D1 node health.
- [ ] Preserve live-node heartbeat/ready behavior and callback-token refresh behavior for non-terminal nodes.
- [ ] Add node liveness checks to `node-acp-heartbeat` before ProjectData updates; deleted/missing nodes must return terminal status and must not refresh ACP session liveness.
- [ ] Return a terminal 410-class response for inactive/tombstoned workspace message persistence, with low-severity logging and no per-attempt persisted error row.
- [ ] Preserve callback-route mounting and callback JWT auth order required by rule 34.

### VM agent

- [ ] Treat terminal callback statuses (`401`, `403`, `404`, `410`) as a stop signal for node heartbeat retry loops.
- [ ] Treat terminal callback statuses from node-level ACP heartbeat as a stop signal instead of retrying on every tick.
- [ ] Disable message reporters and clear unwinnable outbox rows after terminal message persistence responses.
- [ ] Keep transient 5xx retry/backoff behavior unchanged.
- [ ] Keep old-agent protocol compatibility: control-plane status/severity behavior must provide value even before new agents deploy.

### Tests

- [ ] Worker integration coverage through combined app routing for expired callback token returns 401, not 500.
- [ ] Worker integration coverage for deleted/tombstoned node heartbeat returns 410 and does not mark the node healthy.
- [ ] Worker integration coverage for node-level ACP heartbeat returns 410 for deleted/tombstoned nodes and still returns 204 for live nodes.
- [ ] Worker integration coverage for inactive workspace message persistence returns terminal status and does not emit server-fault 500.
- [ ] Go tests for VM-agent heartbeat/ACP terminal response handling stopping further sends.
- [ ] Go tests for message reporter terminal response handling disabling future flush/enqueue storms.
- [ ] Discriminating control: live node callbacks still succeed.

## Acceptance criteria

- [ ] Expired callback JWTs on callback routes return 401-class responses, not 500s.
- [ ] Deleted/tombstoned nodes and inactive/tombstoned workspaces return terminal callback responses (`410` or existing designed `204` where intentionally idempotent), not server faults.
- [ ] Designed 4xx/410 callback responses do not create API error-level logs or persisted `platform_errors` rows per attempt.
- [ ] Genuine callback auth infrastructure faults still surface as error-level 5xx failures with observability persistence.
- [ ] Deleted node callbacks cannot update D1 node health to healthy.
- [ ] New VM agents stop or hard-bound retries after terminal callback statuses for heartbeats and message flushing.
- [ ] Old deployed VM agents remain protocol-compatible with the changed control-plane responses.
- [ ] Targeted API/worker and Go test suites pass.
- [ ] Branch is reviewed, staging verified, merged, and production deployment monitored to completion.
