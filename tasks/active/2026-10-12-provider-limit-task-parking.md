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

- [x] Verify baseline typecheck/lint and existing scheduled wake integration.
- [x] Validate pinned Claude/Codex adapter wire shapes and recorded limit fixtures (session + weekly + API 429/reset); preserve auth/ordinary failure controls.
- [x] Implement sanitized provider_limit_reached classification and resetsAt propagation from error/event without raw text in diagnostics; exclude limit failures from transient prompt retry.
- [x] Add additive persistent task wait state (count, credential key, reset/next wake, blocked, schedule identity), idempotent callback handling and bounded policy defaults in code; no wrangler vars.
- [x] Park callbacks using existing sleep intent + scheduled self-wake with explicit safe continuation; preserve task/chat/profile/model/credential and lifecycle guards.
- [x] Bound consecutive waits, unknown-reset backoff and visible blocked exhaustion; success ends consecutive episode, duplicate callbacks do not spend budget.
- [x] Gate new dispatch before provisioning and agent start on selected rejected credential; known hold releases at reset; unknown hold cannot loop forever.
- [x] Old-agent fallback only for agent_prompt_failed + just-observed rejection of exact session credential; expired/unrelated/auth/ordinary errors unchanged.
- [x] Real-path regression tests: provider wire → callback → wait/status → sleep → schedule alarm → delivery/recovery → continuation. Admission control and unknown bounds. Redaction canaries and surgical rule-62 revert proof.
- [x] Update task callback API contract and public behavior docs.
- [x] Sequential lint/typecheck/test/build and required quality gates; no parallel heavy monorepo runs.
- [x] Local specialist review: task completion, Go, Cloudflare, security, constitution, documentation, tests. Address blockers.
- [ ] Staging claim, bounded verification on final candidate (max 2 VMs/<60 min), VM heartbeat/access, recorded-limit test through staging-only seam if needed and production prohibition proven; cleanup + release. If exact E2E cannot be done, reviewed PR only and report gap.
- [ ] PR/CI/Sonar, CodeRabbit request and bounded wait; archive after task validator. Publish MERGE_READY exact SHA/evidence, wait coordinator MERGE_GRANT. Merge main if second merger, no history rewriting.
- [ ] Merge/prod deploy verification if all gates pass; DONE channel before complete_task.

## Acceptance

Claude session/weekly limits, Codex plan limits and reset-bearing API 429s wait visibly and automatically resume retained task work safely. Admission holds matching credential dispatches without failures. Unknown resets and consecutive limits are bounded and blocked visibly. No automatic profile/model/credential switching. Ordinary errors and credential rejection retain existing outcomes. Old-agent rollout is safe. Tests observe production trigger/delivery paths and go red under surgical reverts. Staging exact coverage is required to merge; no real subscription exhaustion.

## References

Rules 05 (preflight), 23/35 (cross-boundary), 54 (rollout), 58/67/74 (shared preservation predicates), 62 (real-trigger/revert proof), 72 (error categories), 25 (review/merge). Policy a3780107 recovery; #2295 scheduled self-wake; #2300 explicit restored task continuation. User constraints override generic /do setup: use pre-created dispatched branch; do not write main or unrelated PR branches.

## Current verification limits (2026-10-12)

The real Go producer bridge uses a Go-test-only ACP peer through actual SessionHost/SDK/server HTTP callbacks. Representative normalized fixtures are labelled as such. `pnpm test:e2e:provider-limits` captures five actual callbacks, consumes them in 25 lifecycle/control tests, and compiles those same bodies into three real workerd tests. The latter drive signed callback auth, canonical snapshot prepare/R2/complete, sleep and old-workspace deletion, actual ProjectData schedule/delivery alarms, real recovery and every TaskRunner restore step. Claude/Codex resume the saved harness/runtime contract/model and authenticate the same credential injection; one continuation is acknowledged, a second drain is empty. Failed restore exhausts its existing elapsed deadline, preserves sleeping work and sends no prompt. Only the VM HTTP peer is doubled. The bridge's constant and ACP peer exist only in test configuration/binaries; release builds have no fault switch.

A rejection discovered after provisioning is held before the first provider prompt using the existing runner alarm. Current VM start requires a nonempty prompt, so this late fallback retains allocated runtime under the existing absolute ceiling. Coordinator approved this visible bounded in-place fallback (channel seq56). The immutable live ceiling has a discriminating regression; the full owned-wake late-start case remains a declared gap.

Final local verification on runtime head 538b286c4: all 27 surgical guard reverts yielded assertion-level RED with byte-exact restoration; final producer/API/Workers bridge passed afterward. Full API completed: 868 passing files, 12,116 passing tests (one file/two tests skipped). Full Go ACP/server passed. Post-main root lint (13 tasks), typecheck (19), build (9), migration safety (212 FK relationships), runtime-state checks and secret scan passed. CI run 38257446904 is green. Eight mobile/desktop Playwright scenarios passed; all screenshots independently reviewed and linked from PR #2318.

Scoped Go/test, security, Cloudflare/constitution and documentation/UI reviews passed runtime head 538b286c4. Task completion validator leaves release acceptance deferred: no archive or shipped claim. Draft PR #2318 has the exact staging and owned late-wake gaps. CodeRabbit trusted workflow 38261718466 was requested once at 14:16:36 UTC; bounded review window in progress. Later review evidence lives in the PR body.

Staging exact quota-trigger E2E remains unverified. T3 has no claim or resources. The coordinator clarified that the reviewed draft is an intermediate milestone: ownership stays active through supported verification and merge; do not publish DONE or complete_task. Current staging and merge order is T2 → T1 → T3. T2 released zero resources at 16:06 UTC; T1 holds the next bounded window. No MERGE_READY or merge claim.

## Quality and review follow-up

Head `2d503f437cd08c00316389167862a5afb9cf1e90` passed CI 38265211729 and Sonar (Security A, duplication 2.8%). CSPRNG jitter, absolute test executable resolution, and shared real SQLite fixture removed the four earlier security findings and duplicate test setup without analysis exclusions or security-setting changes.

CodeRabbit trusted workflow 38267489067, requested 15:03:59 UTC, returned two major findings: parsed wait JSON equality is order-sensitive; platform-proxy admission identity differs from actual upstream billing identity. Both are implemented; final committed-head validation and review replies remain pending. Semantic identity checks preserve source/episode/phase and guarded json_set only attaches a schedule while retry/deadline are unchanged. Actual upstream attribution is projected without secrets and shared by admission/injection/telemetry. Existing credential precedence and SAM eligibility are preserved. Platform and BYO proxy routes check the immutable recovery pin before sending; changed credentials block visibly. Task and conversation generic callbacks preserve genuine blocked state and repair canonical sleep behind existing source/workspace fences.

Current local checks: root lint 13, typecheck 19, build 9 PASS. Actual Go callback producer → 29 API lifecycle tests → 3 real Workers restoration tests PASS. Expanded real SQLite quota/credential/proxy controls: 17 PASS; existing BYO protocol tests: 22 PASS; focused proxy/lifecycle controls: 107 PASS before the final three eligibility controls. Full Go ACP/server rerun PASS; full API rerun in progress. The 27 earlier surgical reverts plus 7 new reverts all yield assertion-level RED and restore exact source bytes. Independent recovery/Cloudflare reviewer passes the current delta; final committed-head security/test reviews remain required.

## Supported staging fixture investigation

Offline actual Claude 2.1.281 and ACP 0.81.2 against a loopback-only synthetic provider PASS: normal SDKHost-equivalent filesystem capabilities invoke Write once, a terminal 429 returns through ACP (-32603/errorKind rate_limit), a real reset clock elapses, the adapter is terminated/restarted, original session/load succeeds, and explicit continuation preserves the receipt with write_issued=1 and continuations=1. The real adapter wraps its reset-bearing text in an SDK prefix; the Go classifier now accepts that exact typed provider source and retains negative authentication/tool-source controls. `x-should-retry: false` is verified in the pinned SDK before the status-429 retry rule; the synthetic fixture includes it and unified rejected/reset headers. These HTTP headers were not independently captured from production.

This is offline CLI/persistence proof, not live SAM snapshot/wake proof. A standalone disposable fixture branch can use existing project runtime environment support and the smoke user's existing Claude OAuth credential without credential changes. Its executable refuses non-staging platform origins from `/etc/sam/env`; it never forwards provider requests or logs authentication/raw prompts. No production fault hook or new Wrangler vars are shipped. Before use: publish final plan and STAGING_CLAIM after the sibling lease is released, integrate main after T2/T1 merge, use normal configured allocation (max 2 VMs), enforce 50-minute watchdog/<60-minute cleanup, and verify zero resources. Never use another identity, credential, or write route to circumvent an access denial.
