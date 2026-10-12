# Park tasks at provider usage limits

SAM task: 01M4QPED208W152N94DH95FHVA (T3), coordinator 01M4QMA42P8AKQD014N0W4KP6S.
Branch: sam/t3-reliability-wave-1012-95fhva. Coordination: reliability-wave-1012.

## Problem

Subscription session/weekly limits currently become generic prompt failures and fail tasks. Existing credential usage observations carry reset times but only advise agents to wait. Preserve task/chat/work, visibly park affected tasks, then safely continue after reset without changing credentials, model or profile.

## Preflight and research

Classes: cross-component-change, business-logic-change, security-sensitive-change, infra-change, docs-sync-change.

- VM ACP `auth_failure.go` classifies typed SDK errors using top-level source categories, avoiding untrusted serialized metadata. Claude rate_limit currently becomes provider_overloaded; Codex usageLimitExceeded needs a distinct recovery category. Ordinary tool/MCP text cannot spoof provider failures.
- `session_host_prompt.go` also retries provider 429/overload before callback. Limit rejection must escape this retry loop; callback/lifecycle/broadcast retain categorical diagnostics only.
- `session_host_usage_claude.go` and `session_host_usage_probe.go` already parse Claude/Codex reset windows. Preserve credential attribution/generation; only matching credential observations can inform parking.
- `server.go:makeTaskCompletionCallback` sends failed callbacks for task-mode prompt errors. Carry only a safe code/reset timestamp additively.
- API `routes/tasks/callback.ts` authenticates workspace callback identity and applies stale Instant-generation guard before destructive state writes. Parking must preserve these guards and avoid terminal cleanup/notifications.
- `credential-limit-events/read.ts` hashes long references and scopes reads. Admission/fallback must use the exact same reference-key function, not provider/user-only matching. Collapse credential windows across projects when a shared credential is selected, with newest sample per window; expired rejected windows must stop blocking.
- `queueWorkspaceSessionSleep` records sleep intent, then existing sweep checks canonical idleness, snapshots, and bounded fallback before teardown. Do not introduce direct unsafe stop/replay. Sleep teardown clears errorMessage, so durable waiting reason must survive outside it (admission reason + chat system notice).
- `project-event-schedules-*` supports durable `message_session` self-wakes for sleeping tasks. The scheduled prompt itself explicitly continues task work and warns against replaying ambiguous actions. Existing task wake keeps task identity and strict snapshot contract.
- TaskRunner alarm can hold before placement/start using its existing alarm; no VM is needed while admission is blocked. Check credential again before agent start to catch rejection during provisioning. Resolve read-only: no credential creation/backfill for admission.
- Existing integration `sleeping-vm-wakes.test.ts` drives real sleep, scheduled admission, inbox alarm and VM delivery adapter. Extend that path; fixture boundaries are R2/node network, not the behavior under test.
- Checkpoint published 2026-10-12 09:22Z (event e1c092c6-a7f4-4d84-8703-32d0204331fb). No implementation until ~09:52Z unless coordinator explicitly advances it; channel follow registered.
- Shared-file intent published (event e7738221-d6f4-4066-b05a-d1ae757c2725). Keep new policy helpers separate from T1/T2 sleep/eviction changes.

Billable entity: existing provider credential's usage window. This change does not collect billing data, buy usage, alter capacity pools, or switch billing attribution; admission avoids wasted provisioning.

## Implementation checklist

- [ ] Verify baseline typecheck/lint and existing scheduled wake integration.
- [ ] Validate pinned Claude/Codex adapter wire shapes and recorded limit fixtures (session + weekly + API 429/reset); preserve auth/ordinary failure controls.
- [ ] Implement sanitized provider_limit_reached classification and resetsAt propagation from error/event without raw text in diagnostics; exclude limit failures from transient prompt retry.
- [ ] Add additive persistent task wait state (count, credential key, reset/next wake, blocked, schedule identity), idempotent callback handling and bounded policy defaults in code; no wrangler vars.
- [x] Park callbacks using existing sleep intent + scheduled self-wake with explicit safe continuation; preserve task/chat/profile/model/credential and lifecycle guards.
- [x] Bound consecutive waits, unknown-reset backoff and visible blocked exhaustion; success ends consecutive episode, duplicate callbacks do not spend budget.
- [x] Gate new dispatch before provisioning and agent start on selected rejected credential; known hold releases at reset; unknown hold cannot loop forever.
- [x] Old-agent fallback only for agent_prompt_failed + just-observed rejection of exact session credential; expired/unrelated/auth/ordinary errors unchanged.
- [ ] Real-path regression tests: provider wire → callback → wait/status → sleep → schedule alarm → delivery/recovery → continuation. Admission control and unknown bounds. Redaction canaries and surgical rule-62 revert proof.
- [x] Update task callback API contract and public behavior docs.
- [ ] Sequential lint/typecheck/test/build and required quality gates; no parallel heavy monorepo runs.
- [ ] Local specialist review: task completion, Go, Cloudflare, security, constitution, documentation, tests. Address blockers.
- [ ] Staging claim, bounded verification on final candidate (max 2 VMs/<60 min), VM heartbeat/access, recorded-limit test through staging-only seam if needed and production prohibition proven; cleanup + release. If exact E2E cannot be done, reviewed PR only and report gap.
- [ ] PR/CI/Sonar, CodeRabbit request and bounded wait; archive after task validator. Publish MERGE_READY exact SHA/evidence, wait coordinator MERGE_GRANT. Merge main if second merger, no history rewriting.
- [ ] Merge/prod deploy verification if all gates pass; DONE channel before complete_task.

## Acceptance

Claude session/weekly limits, Codex plan limits and reset-bearing API 429s wait visibly and automatically resume retained task work safely. Admission holds matching credential dispatches without failures. Unknown resets and consecutive limits are bounded and blocked visibly. No automatic profile/model/credential switching. Ordinary errors and credential rejection retain existing outcomes. Old-agent rollout is safe. Tests observe production trigger/delivery paths and go red under surgical reverts. Staging exact coverage is required to merge; no real subscription exhaustion.

## References

Rules 05 (preflight), 23/35 (cross-boundary), 54 (rollout), 58/67/74 (shared preservation predicates), 62 (real-trigger/revert proof), 72 (error categories), 25 (review/merge). Policy a3780107 recovery; #2295 scheduled self-wake; #2300 explicit restored task continuation. User constraints override generic /do setup: use pre-created dispatched branch; do not write main or unrelated PR branches.

## Current verification limits (2026-10-12)

The real Go producer bridge uses a Go-test-only ACP peer through actual SessionHost/SDK/server callback wiring; representative normalized provider fixtures are labelled as such. It does not make real provider requests or ship a release fault switch. Worker tests execute real callback, sleep, schedule, inbox and delivery code, but currently mock `ensureSessionRecovery`; full restoration is still pending integration with T1's real Workers harness.

A rejection discovered after provisioning is held before the first provider prompt using the existing runner alarm. Current VM start requires a nonempty prompt, so this late fallback retains allocated runtime under the existing absolute ceiling. Coordinator approved the visible bounded in-place fallback (channel seq56); no new teardown or VM protocol was introduced. A late reset beyond the ceiling and owned wake-claim lifecycle need explicit coverage. No merge claim until these limits are resolved or a reviewed-PR-only outcome is published.

20 surgical guard reverts yielded assertion-level RED; exact bytes restored. Sources, timestamps, consecutive budgets, TTL, admission, credential pin/JIT, wake episode identity, canonical sleep and production completion handoff discriminate. Subsequent joint workspace/pin read and immutable ceiling controls are being validated; final-candidate proofs/reviews remain pending.
