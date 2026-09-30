# Activate ACP permission interactions

## Problem

PR #2202 proves the permission request and answer path on staging, but the checked-in Worker flag still disables request creation. The activation needs a reviewed release, an operator rollback, and explicit evidence about which pinned agents actually emit requests.

## Research

- `apps/api/wrangler.toml` and the shared fallback both set `ACP_INTERACTIONS_ENABLED=false`; GitHub staging and production Environment variables have no override as of 2026-09-30.
- The deployed staging and production Worker settings both report `false` before this change.
- `codex-acp` 1.13.1 receives SAM's `agent-full-access` mode and sends `approvalPolicy=never` and `dangerFullAccess` on every turn. A real process completed a shell turn without a permission request.
- Claude wrapper permission emission needs a pinned process or staged account test; transport fixtures from #2202 are not provider emission.
- Older vm-agent code selected the first permission option. New VM task placement uses `VM_AGENT_REQUIRED_VERSION`; active sessions on older nodes need an explicit rollout disposition.

## Checklist

- [x] Enable permission creation through the checked-in Worker flag and typed fallback, with `false` as a reversible deployment override.
- [x] Update the public configuration reference and focused flag tests.
- [x] Verify pinned wrapper behavior and old-node compatibility; record actual account versus fixture evidence.
- [x] Run focused tests, specialist reviews, CI, and one coordinated staging candidate.
- [x] Record exact release head, deployed staging value, cleanup, rollback, and limitations in draft PR #2204 for parent review.

## Acceptance criteria

- A freshly deployed Worker advertises the proven permission bridge to version-compatible VM and Instant runtimes.
- Setting `ACP_INTERACTIONS_ENABLED=false` disables new requests without preventing existing pending requests from being answered or read.
- Forms and URL elicitation remain independent and unadvertised in this slice.
- The follow-up is not merged or activated in production by this task agent.

## Evidence in progress

- Rebased on main merge `86e6c5b75439cb2f495cc87f3b245fcd04d6c3f2` after #2202 merged at 16:16:23Z.
- No staging or production GitHub Environment override for `ACP_INTERACTIONS_ENABLED`; both deployed Workers reported `false` before this follow-up.
- Local `codex-acp` 1.13.1 with SAM's exact mode/config completed one real account shell turn (`end_turn`), emitted 16 `session/update` notifications, and emitted zero `session/request_permission` calls.
- Pinned `claude-agent-acp` 0.81.2 source sends `client.requestPermission` from `canUseTool` with the tool signal. A real staging Claude Instant account using explicit `permissionMode=default` emitted permission requests for MCP `get_instructions` and a harmless Python command. The browser rendered their exact options, and rejecting through the UI reached `delivery_confirmed` for both. The first staging session's request was cancelled when its turn ended before answer; it is not counted as a successful answer.
- Candidate `b9b96b579edd0940810295397e9719d8ea2804f8` deployed through staging workflow `36747159371`. The deploy job passed; its smoke job initially timed out waiting for `networkidle` on the settings page, then passed on one failed-job rerun. The effective `sam-api-staging` Worker binding reported `ACP_INTERACTIONS_ENABLED=true` after deploy.
- Draft PR #2204 contains the staged runtime candidate plus documentation-only evidence commits; the parent controls readiness, merge, and production activation.
- The explicit staging profile `01M3SMFPP7SQW5VAPMNVY9FJD9` was created with `agentType=claude-code`, `runtime=cf-container`, and `permissionMode=default`; its response echoed those values. The first session was `a6024e71-fe31-4e5e-96bc-925998943434` in workspace `01M3SMGBC3B5PMVP46E4N8WK87` and had one cancelled, unanswered request. The second was `108c309f-4642-4061-a661-8a9ad42bbd34` in workspace `01M3SN15CRA0R2SACEYDWPXKGG`. Its MCP request `9b408eac-eda5-4bc4-8473-9c7749b783e3` and harmless Python request `ad8076b4-0126-42f3-921d-068908e84893` each offered the exact `reject`/`reject_once` option; browser **No** answers reached `delivery_confirmed` with `deliveryState=confirmed`, and the card showed “Delivered to agent.” This is behavioral evidence of the effective permission path; there is no separate persisted runtime-mode readback after profile cleanup.
- Both staging chat sessions were stopped, both agent sessions are `stopped`, both workspaces are `deleted` in D1, and the temporary profile returns 404. B released staging to compatibility agent `01M3REWHQEVNFNB5CC5G5KJ5WX`; the earlier C1 handoff was superseded. C1 `01M3SGWNFG7NGAY788GA465P25` waits for compatibility release and parent review of its exact candidate.
- Focused API tests passed 39/39, Worker store tests 8/8, isolated API suite 795 files/11,086 tests, root lint 13/13 packages, typecheck 19/19, and build 9/9. The first concurrent root aggregate test run had an API package failure under load; the isolated API rerun passed. Specialist reviews passed for staging readiness.
- Production base deploy finished successfully with `ACP_INTERACTIONS_ENABLED=false`. Old node `01M3RBQNPZS29SA21HBT4V7KVT` still runs vm-agent `e9820d9f9f6beec1bfa99c654d97f41921aaa4e7` with one Claude and four Codex sessions. The Claude task `01M3RBQBHV39B9SHDC4BWBR16B` completed at 08:26:39Z (PR #2198); its chat summary last message was 08:26:55Z and recent resource-history chunks show zero tool spans. Its D1 agent session `01M3RC2TZ8M7PH05137VMWGTKM` remains `running`, which alone does not prove an in-flight turn. Canonical live `/state` requires owner authentication; this task's MCP token receives 401, so a current idleness check is still required before cleanup.
- The completed Claude workspace `01M3RBZ3RX4JN084KMNM21A5MT` remains live. Its snapshot is `degraded/home-skipped`, with a 257,916,024-byte WIP artifact, no home artifact, and 24 entries skipped for budget (72,421,962 bytes). Automatic sleep exhausted nine attempts and is now `failed`, leaving the workspace running. A direct sleep is not full-state-safe: the current final-capture path allows a degraded snapshot to release compute. Owner-authenticated agent-session stop is the narrow supported way to halt that old Claude process while keeping its workspace files, but the route can log and swallow a node-stop failure, so verify the node runtime after it returns. Full resumable migration needs a larger snapshot budget and a strict final-generation completeness gate before teardown.

## Release and rollback

The parent controls the reviewed follow-up merge. Before production activation, verify #2202's production deploy completed, the production Environment has no stale `ACP_INTERACTIONS_ENABLED` override, and no running ACP session remains on the old VM agent. New VM placement already checks `VM_AGENT_REQUIRED_VERSION`; it does not upgrade an existing session or gate direct agent-session creation inside an existing old workspace.

For the completed Claude task, first use owner-authenticated `GET /api/projects/:projectId/sessions/:sessionId/state` to confirm the turn is idle and inspect its unpublished files through the workspace Git status/diff. If the owner accepts ending the agent session while retaining the live worktree, use `POST /api/workspaces/01M3RBZ3RX4JN084KMNM21A5MT/agent-sessions/01M3RC2TZ8M7PH05137VMWGTKM/stop`, then verify both D1 and the node's `GET /workspaces/:id/agent-sessions` show stopped and the workspace remains running with its files. Do not stop/restart the shared node: four active Codex workspaces remain there. If the same chat and full agent home must remain resumable, first arrange a complete snapshot and a strict final-capture gate; the current 256 MiB budget and permissive degraded sleep path block safe hibernation. A completed task is not by itself proof of live idleness or preserved unpublished files.

The release check is the deployed `sam-api-prod` Worker setting `ACP_INTERACTIONS_ENABLED=true`, read from its Cloudflare plain-text binding, plus a supported-runtime smoke test. To stop creation, set the GitHub `production` Environment variable `ACP_INTERACTIONS_ENABLED=false` and rerun the standard production deployment; verify the deployed Worker binding is `false`. Existing pending interaction records remain readable and answerable until their deadlines, while the new start contract disables further creation.

## References

- Approved v2 idea `01M3P2E0JJNQRXX020P65ZRKEJ`
- Base PR #2202, exact head `aecaf205f405442eaabfbb5b98503e5901219128`
- `.claude/rules/70-flag-flips-must-verify-the-deployed-value.md`
