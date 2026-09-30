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
- Both temporary staging chat sessions were stopped, their workspaces were verified `deleted` in D1, and the temporary profile was deleted. Staging was released to C1 at about 17:17Z with parent review required for C1's exact candidate before its staging deploy.
- Focused API tests passed 39/39, Worker store tests 8/8, isolated API suite 795 files/11,086 tests, root lint 13/13 packages, typecheck 19/19, and build 9/9. The first concurrent root aggregate test run had an API package failure under load; the isolated API rerun passed. Specialist reviews passed for staging readiness.
- Production base deploy finished successfully with `ACP_INTERACTIONS_ENABLED=false`. At about 17:04Z, production D1 still showed one active Claude session on an older VM-agent node; it is a production release precondition because that agent can auto-select the first permission option.

## Release and rollback

The parent controls the reviewed follow-up merge. Before production activation, verify #2202's production deploy completed, the production Environment has no stale `ACP_INTERACTIONS_ENABLED` override, and no active older VM-agent session can still select the first permission option. New VM placement already checks `VM_AGENT_REQUIRED_VERSION`; this does not upgrade an existing session on an older node. If one remains, let it finish and drain or move it through the normal session lifecycle before claiming universal human review.

The release check is the deployed `sam-api-prod` Worker setting `ACP_INTERACTIONS_ENABLED=true`, read from its Cloudflare plain-text binding, plus a supported-runtime smoke test. To stop creation, set the GitHub `production` Environment variable `ACP_INTERACTIONS_ENABLED=false` and rerun the standard production deployment; verify the deployed Worker binding is `false`. Existing pending interaction records remain readable and answerable until their deadlines, while the new start contract disables further creation.

## References

- Approved v2 idea `01M3P2E0JJNQRXX020P65ZRKEJ`
- Base PR #2202, exact head `aecaf205f405442eaabfbb5b98503e5901219128`
- `.claude/rules/70-flag-flips-must-verify-the-deployed-value.md`
