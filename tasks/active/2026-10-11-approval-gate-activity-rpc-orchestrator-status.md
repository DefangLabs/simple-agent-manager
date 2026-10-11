# Approval gate on /api/sam, dead ProjectData activity fetches, /sam get_project_status orchestrator RPC

SAM task `01M4MZSRFR6TC4JXNYE5HN8X4N` (Wave B of `reliability-wave-1011`, coordinator `01M4MXGVH4EMVNE1CT2XRH484J`).
Source idea: `01M4GJ17Y8K45D0J80ARSFFQEH` (line numbers there are from `3c263a779`; re-verified on `eb18d9c93`).

## Problem

1. **Security.** `/api/sam/*` applies only `requireAuth()` (`apps/api/src/routes/sam.ts:20`). Every other user
   surface also applies `requireApproved()`. With signup approval on, a `pending` account can call
   `POST /api/sam/chat` and spend the platform LLM budget (production had 10 pending users on 2026-10-11).
2. **Silent data loss.** Five callers record activity with `stub.fetch('https://do/activity')`, but
   `ProjectData.fetch` (`durable-objects/project-data/index.ts:2774`) only serves `/ws` and answers 404 for
   everything else. The callers never check `response.ok`, so `task.progress`, `task.awaiting_followup`,
   `task.completed` and `task.dispatched` never reach `activity_events`.
3. **/sam `get_project_status` always reports `orchestrator: null`.** It calls `fetch()` on
   `ProjectOrchestrator`, which exposes only RPC (`getStatus`); the error is swallowed.

## Research findings

### Approval-gate audit (every authenticated-user surface that skips `requireApproved()`)

Method: scanned every `requireAuth()` call site for a `requireApproved()` in the same chain (multi-line aware),
then enumerated the other ways a handler resolves a session user: `getAuthenticatedUser`
(`services/session-factory.ts`), `optionalAuth()`, direct `auth.api.getSession` (`routes/auth.ts`,
`src/index.ts` workspace proxy), and routers that declare no auth and inherit the `/api/projects/*` wildcard
from `projectsRoutes` (`routes/projects/index.ts:19`). BetterAuth has no bearer/API-key plugin
(`src/auth.ts`), so sessions are cookie-only; PATs are exchanged via `token-login`.

Admins can only approve (`active`) or suspend (`routes/admin.ts` PATCH `/users/:userId`), so a `pending`
account has never been approved and cannot own workspaces, nodes, or projects created through gated routes.

| Group | Mount | Gate today | Do pending users legitimately need it? | Decision |
| --- | --- | --- | --- | --- |
| `samRoutes` (`routes/sam.ts`) | `/api/sam/*` | `requireAuth()` only | No. LLM chat on the platform budget. | **Fix**: `requireAuth(), requireApproved()` |
| `projectAgentRoutes` (`routes/project-agent.ts`) | `/api/projects/:projectId/agent/*` | per-route `requireAuth()` only; blocked in practice only because the `projectsRoutes` `/*` wildcard is mounted first (`src/index.ts:825` vs `:851`) | No. Project LLM agent. | **Fix**: add `requireApproved()` to each route so mount order is not load-bearing |
| `apiTokenRoutes` list/create/revoke (`routes/api-tokens.ts`) | `/api/auth/api-tokens*` | `getAuthenticatedUser` (suspension check only) | No. A pending account has no use for a PAT (every redemption re-checks approval), and minting a durable credential before approval is exactly what the gate exists to stop; `/api/credentials` already requires approval. | **Fix**: per-route `requireAuth(), requireApproved()` |
| `claimRoutes` (`routes/trial/claim.ts`) | `POST /api/trial/claim` | `requireAuth()` only | Yes. It completes signup by moving the caller's own anonymous trial project (HMAC claim cookie) to their account. D1 only, no compute or LLM; the project stays unreachable until approval because every project route is gated. Blocking it would lose the trial work before an admin can approve. | **Keep** |
| `authRoutes` (`/me`, BetterAuth sign-in/callback/sign-out/session) | `/api/auth/*` | session + suspension | Yes. Current user, approval status, sign in/out. | **Keep** |
| `POST /api/auth/token-login` | `/api/auth` | approval enforced (`assertUserCanCreateSession`) | n/a | Already gated |
| Device flow `/device/approve` | `/api/auth/device/*` | `getAuthenticatedUser` | Binds a 15-minute KV device code; mints nothing. The only credential-issuing step, `/device/token`, enforces approval (`assertUserCanCreateSession`). | **Keep** |
| GitHub App install callback (`routes/github.ts` `/callback`) | `/api/github/callback` | `optionalAuth()` | Onboarding: links an installation GitHub confirms the caller owns. No platform spend; repos stay unusable until approval (all project/GitHub list routes are gated). | **Keep** |
| Workspace subdomain proxy (`src/index.ts` ws-* session path) | `ws-*.${BASE_DOMAIN}` | session + suspension, `workspaces.user_id = caller` | Unreachable: a pending account cannot own a workspace. | **Keep** |
| `analytics-ingest`, `client-errors` | `/api/t`, `/api/client-errors` | `optionalAuth()` | Anonymous by design. | **Keep** |
| Inherited-auth project sub-routers (`project-comments`, `project-event-channels`, `project-event-subscriptions`, `project-schedules`, `project-standing-watches`, `library-comments`) | `/api/projects/:projectId/...` | no own auth; the `/api/projects/*` wildcard runs `requireAuth(), requireApproved()` (documented in `project-comments.ts`) | No | **Keep** (already gated); pinned by a real-worker test |
| Callback-JWT, MCP-token, connector, webhook, AI-proxy routes | various | non-session auth | Pending users cannot hold workspace/callback tokens; Connector PAT/OAuth re-checks approval (`assertConnectorUserActive`, connector consent/settings use `requireApproved()`) | n/a |

Reference implementation: Connector (`connector-oauth.ts:167`, `connector-settings.ts:77`,
`assertSessionUserApproved` in `services/connector-pat.ts`).

### Dead activity fetches

Callers (all `stub.fetch(new Request('https://do/activity', …))`):
- `routes/mcp/task-tools.ts:137` `task.progress` (task-backed `update_task_status`)
- `routes/mcp/task-tools.ts:281` `task.awaiting_followup` (conversation-mode `complete_task`)
- `routes/mcp/task-tools.ts:418` `task.completed` (task-mode `complete_task`)
- `routes/mcp/dispatch-activity.ts:24` `task.dispatched` (MCP `dispatch_task`)
- `durable-objects/sam-session/tools/dispatch-task.ts:558` `task.dispatched` (/sam `dispatch_task`)

The working path is the service `projectDataService.recordActivityEvent` → DO RPC `recordActivityEvent` →
`activity.recordActivityEventInternal` (used by the taskless `update_task_status` branch at
`task-tools.ts:68`). No shared operation for these tools exists under `apps/api/src/operations/`, so the
shared piece is that service.

Retention: `event-log-cleanup.ts` deletes activity rows only by joining `chat_sessions` on `session_id`
(stopped/failed sessions). `ACTIVITY_RETENTION_DAYS` is declared but unused. So the restored events must carry
the chat session id, or they are retained until the emergency purge. Task-runner MCP tokens carry
`chatSessionId` (`services/agent-session-bootstrap.ts`).

Consumers of the new rows: `ActivityFeed` (generic `task.*` rendering), `GET /api/projects/:id/activity`,
`getSummary().lastActivityAt` → `projects.last_activity_at` (project ordering only; no cleanup logic reads it).
No duplicate: REST close records its own `task.completed` (`routes/tasks/crud.ts:925`).

Why tests missed it: `tests/unit/routes/mcp.test.ts` mocks the DO stub's `fetch` to answer 200 for every path.

### get_project_status

`orchestratorService.getOrchestratorStatus(env, projectId)` (`services/project-orchestrator.ts:68`) already
wraps the `getStatus` RPC and is used by the REST route, the MCP tool, and /sam `get_orchestrator_status`.

### Sibling check

Every other internal `stub.fetch('https://…')` targets a DO with a matching `fetch` handler
(SamSession, ProjectAgent, TrialEventBus, CodexRefreshLock). Only the six calls above are dead.

## Implementation checklist

- [ ] `routes/sam.ts`: `app.use('/*', requireAuth(), requireApproved())`
- [ ] `routes/project-agent.ts`: `requireApproved()` after `requireAuth()` on all four routes
- [ ] `routes/api-tokens.ts`: per-route `requireAuth(), requireApproved()` on list/create/revoke; use `getUserId`
- [ ] Update unit-test auth mocks (`tests/unit/routes/sam.test.ts`, `tests/unit/routes/project-agent.test.ts`, api-token tests if any)
- [ ] Shared helper for MCP agent activity (one try/catch, actor = agent session or workspace, workspace + chat session columns); use it for taskless progress, task progress, awaiting_followup, completed, dispatched
- [ ] Delete the dead `https://do/activity` fetches (task-tools x3, dispatch-activity, /sam dispatch-task)
- [ ] /sam `dispatch-task.ts`: `projectDataService.recordActivityEvent(…'task.dispatched', 'user', userId, null, sessionId, taskId, …)`
- [ ] /sam `get-project-status.ts`: call `orchestratorService.getOrchestratorStatus`; warn-log failures
- [ ] Workers test (real worker, real session cookies, real approval setting): per fixed group pending → 403 `APPROVAL_REQUIRED`, approved passes; pending `GET /api/auth/me` → 200 (liveness); approval-off control; project-agent router mounted alone (discriminating); trial claim still reachable; inherited project sub-routers pinned
- [ ] Workers test (real `/mcp`, real DO): task-backed `update_task_status` → `task.progress` row; conversation `complete_task` → `task.awaiting_followup`; task-mode `complete_task` → `task.completed`; dispatch helper → `task.dispatched` row
- [ ] Unit: MCP `dispatch_task` reaches the activity RPC; /sam `dispatch_task` records `task.dispatched` via the service
- [ ] Workers test: /sam `get_project_status` returns real orchestrator status for an active mission (fails pre-fix)
- [ ] Prove each new guard discriminating (delete → intended test red → restore) and record in PR
- [ ] Docs: public self-hosting guide states what a pending account can reach
- [ ] File sizes: `task-tools.ts` below 500 after the change

## Acceptance criteria

- [ ] Pending account (approval on) gets 403 `APPROVAL_REQUIRED` on every `/api/sam/*`, `/api/projects/:id/agent/*` and `/api/auth/api-tokens*` route; an approved account reaches the handlers.
- [ ] With approval off, a pending account is not blocked (control).
- [ ] Pending account can still call `GET /api/auth/me` and `POST /api/trial/claim` (reaches the handler).
- [ ] A task-backed `update_task_status` writes a `task.progress` row to `activity_events` through the real DO, with task id and chat session id.
- [ ] `complete_task` writes `task.awaiting_followup` / `task.completed`; dispatch writes `task.dispatched`.
- [ ] No `https://do/activity` fetch remains in `apps/api/src`.
- [ ] /sam `get_project_status` returns orchestrator status (not `null`) for a project with an active mission.
- [ ] Security-auditor review plus an independent adversarial re-verification (policy 034747da).

## References

- `apps/api/src/middleware/auth.ts`, `apps/api/src/services/signup-approval.ts`
- `apps/api/.claude/rules/06-api-patterns.md` (wildcard middleware scoping, test through the combined app)
- `.claude/rules/62-tests-must-observe-the-real-trigger.md`, `.claude/rules/28-credential-resolution-fallback-tests.md`
- Policies 5cb362e8 (shared operations), 034747da (verified security fixes)
