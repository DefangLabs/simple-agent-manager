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
- [ ] Verify pinned wrapper behavior and old-node compatibility; record actual account versus fixture evidence.
- [ ] Run focused tests, specialist reviews, CI, and one coordinated staging candidate.
- [ ] Record exact release head, deployed staging value, cleanup, rollback, and limitations in a follow-up PR for parent review.

## Acceptance criteria

- A freshly deployed Worker advertises the proven permission bridge to version-compatible VM and Instant runtimes.
- Setting `ACP_INTERACTIONS_ENABLED=false` disables new requests without preventing existing pending requests from being answered or read.
- Forms and URL elicitation remain independent and unadvertised in this slice.
- The follow-up is not merged or activated in production by this task agent.

## Evidence in progress

- Rebased on main merge `86e6c5b75439cb2f495cc87f3b245fcd04d6c3f2` after #2202 merged at 16:16:23Z.
- No staging or production GitHub Environment override for `ACP_INTERACTIONS_ENABLED`; both deployed Workers reported `false` before this follow-up.
- Local `codex-acp` 1.13.1 with SAM's exact mode/config completed one real account shell turn (`end_turn`), emitted 16 `session/update` notifications, and emitted zero `session/request_permission` calls.
- Pinned `claude-agent-acp` 0.81.2 source sends `client.requestPermission` from `canUseTool` with the tool signal. This is source evidence, not yet external account emission.
- The focused runtime config test passed 4/4; API/shared typecheck and API/shared/www lint passed after building workspace dependencies.

## References

- Approved v2 idea `01M3P2E0JJNQRXX020P65ZRKEJ`
- Base PR #2202, exact head `aecaf205f405442eaabfbb5b98503e5901219128`
- `.claude/rules/70-flag-flips-must-verify-the-deployed-value.md`
