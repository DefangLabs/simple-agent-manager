# OOM eviction recovery

## Problem
Eviction clears an in-flight sleep then finalizes the old runtime before marking its saved snapshot sleeping. The finalizer stops the conversation and TaskRunner refuses linking it to a replacement.

## Research
- workspace-eviction-callback.ts finalizes before workspace-eviction-recovery.ts updates sleeping_at.
- Finalizer already consults the shared restorable/in-flight snapshot predicate; preserve that guard (rules 58/61).
- ensureSessionLinked repairs only failed mirrors. Failure cleanup cannot sleep stopped mirrors, preventing claim/binding release.
- Current callback rejects snapshotCaptured:false. Coordinator corrected the brief: preserve no-snapshot 409/no-mutation control.
- Recovery reuses stable task owner and attempt ID; keep rule 66 ownership fencing.

## Checklist
- [x] Mark exact eviction snapshot sleeping before lifecycle finalization, including callback replay.
- [x] Scope stopped mirror repair/re-sleep to authorized same snapshot/attempt claim.
- [x] Verify failed replacement returns sleeping, releases claim and deleted workspace binding.
- [x] Workers regression uses real snapshot-complete, eviction and TaskRunner linking; external VM/provider doubles only.
- [x] Provisioning failure and unchanged no-snapshot 409 controls; discriminating revert proofs.
- [x] Sequential lint/typecheck/test/build; specialist reviews (combined full-suite and corrected fixture evidence below).
- [ ] Exclusive staging deployment and bounded real memory-pressure eviction, runtime teardown verification, cleanup.
- [ ] PR CI/Sonar/CodeRabbit; MERGE_READY then coordinator MERGE_GRANT.
- [ ] Production deployment/Worker/health proof; next natural eviction read-only check.
- [ ] Report supported stranded-chat recovery or precise approval-required one-off without mutation.

## Acceptance
Chat never stopped during captured eviction and move reaches in_progress on replacement VM. Failed move leaves sleeping chat and no claim/binding stranded. No general stopped resurrection. Instant remains consistent through shared service guards. No merge without live staging proof. Protected production chat never mutated.

## Verification evidence
- Real eviction Workers suite: 14 tests, including captured move through real linking, failed provisioning with active or explicitly eviction-attributed stopped mirror, actual NodeLifecycle deletion, protected unknown legacy cleanup refusal, stop provenance, and unchanged uncaptured 409.
- Six integrated Workers suites: 151 tests passed, including Instant recovery and C mission compatibility. Service suite: 84 passed, covering exact claims, stop intent, duplicate eviction replay, queued newer stop and revoked claim interleavings.
- Root lint 13 tasks, typecheck 19 tasks, build 9 tasks passed sequentially. Final unit fixture files also pass targeted lint.
- Full monorepo run passed all 11 non-API tested packages (6,688 tests); API rerun passed 862 files/12,064 tests, with nine failures confined to two older RPC/metadata fixtures. Corrected fixtures passed both files/40 tests. Combined verification covers all API tests; this is not a clean full-suite rerun. CI must run the final head fresh.
- Atomic-marker revert: captured move red, sleeping expected/stopped received. Exact-claim guard revert: 11 intended red, six retained controls pass. Stop-eligibility revert: all five ordinary/repeated/internal/unknown/replay intent controls red. Fixed source restored byte-for-byte after each proof.
- Read-only Sol security review ADDRESSED/PASS after ordinary-stop and replay fixes; Cloudflare/constitution PASS; completion/test/doc re-review implementation PASS. Staging and release gates remain pending in `.do-state.md` and PR evidence.

## Protected historical chat (read-only)
Fix does not itself expose a normal supported wake for an already stopped composer or run cleanup for an already completed failed attempt. Verified snapshot remains available/sleeping, claim waking, task sleeping; failed replacement is deleted with runtime deletion confirmed but retains chat binding. Exact approval-required one-off: after verifying unchanged chat/task/snapshot/attempt/replacement, use authorized claim repair to return chat to sleeping, release only deleted replacement binding under attempt fence, and mark only this stale claim failed/retryable, without resetting budget/replacing artifacts; then normal message wake can restore. Nothing executed.

Coordinator requested optional automatic legacy-shape self-repair but required positive stored attribution of stop to eviction, never timing inference. Blocker published: current stopSession and terminal events record only generic `project_data.stop_session`/`session_stopped`, and chat stop is not atomically coupled to D1 eviction. These records cannot prove historical stop was eviction-induced rather than user/manual stop. Forward fix is independent; no automatic sweep added.

## Final preventive design and integration
- The snapshot sleeping marker is part of the eviction D1 transaction, scoped to the winning resource identity/timestamp. The exact bound ProjectData chat sleeps before NodeLifecycle finalization; replay uses the same marker statement. Other finalizers cannot observe eviction without its recovery record.
- Stopped mirrors heal only while an exact claimed replacement is creating/running/recovery/error; deleted, stopped, evicted, sleeping, stopping and unknown replacements are refused. A real legacy cleanup alarm leaves stopped chat, snapshot, claim and deleted workspace binding unchanged, preventing accidental repair of the protected incident on deployment.
- Re-sleep happens before binding detach; detach precedes deletion scheduling. Otherwise the deletion queue's chat identity is revoked by its own handoff. Real NodeLifecycle deletion confirms deleted/unbound replacement.
- Eviction-induced terminal closure records workspace_eviction_finalization in existing DO stop activity and lifecycle/revocation events. Generic/manual stops remain distinct; missing provenance is unknown.
- Failed-move controls assert no wake_failed or idle_cleanup_failed attention marker is created; progress/task/snapshot error state carries failure.
- Final guard reverts: 11 intended controls red, 6 unchanged controls passed (74 skipped), fixed bytes restored. Final atomic-marker revert: happy move red (expected sleeping, received stopped), fixed bytes restored.
- Main integrated conflict-free at b7fea305 after C #2302 and model refresh #2314. Integrated root lint/typecheck/build passed; 6 Workers suites passed 144 tests, including C compatibility and unchanged Instant recovery. Final combined full-suite/corrected-fixture evidence is recorded above; final CI remains a fresh full-run gate.
- Coordinator relay refined historical restoration: a separate reviewed one-case allowlist, consulted only through an explicit supported owner wake, with every identity/generation/intent/expiry/budget rechecked, no database backdoor, removed/expired after use. Main preventive PR performs no historical restoration. That follow-up remains pending; original incident data untouched.

## Local review and stop-intent hardening
Security review caught a matching live wake claim reviving an ordinary stopped chat. Stopped healing now additionally requires explicit eviction-stop eligibility stored alongside the successful DO terminal transition in existing metadata. Ordinary/internal stop intent, including a no-op repeated stop, clears eligibility; successful sleep/wake consumes it. Duplicate explicitly attributed eviction stops preserve existing eligibility without recreating eligibility revoked by an ordinary stop. Unknown historical stops refuse repair.

The repair RPC validates local identity/eligibility and exact D1 claim inside `blockConcurrencyWhile` immediately before synchronous sleeping mutation. D1 and DO cannot share a transaction; current attempt fences remain required for distributed ownership. The existing snapshot wake service has a preexisting distributed claim-read/RPC window, but its synchronous stopped wake now requires the same local eligibility; no ordinary stop can revive through it. A broader wake authority protocol is outside this preventive change.

Read-only Sol reviews: Cloudflare/constitution PASS; completion/test/docs implementation PASS with release gates pending; security initial finding ADDRESSED/PASS after final re-review. Service Workers 84/84 PASS, including ordinary/repeated/internal/unknown stops, duplicate explicit eviction replay, queued newer stop during authority read, and revoked claim before the real D1 read. The initial race harness crossed Cloudflare I/O contexts; final harness delays query dispatch and runs the original real D1 query in the repair RPC context.

## Final local run and staging blocker (2026-10-12)
The clean final API rerun passed 864 files / 12,073 tests, with two existing skips. All six focused Workers suites passed 151 tests. Lint/typecheck/build and all local specialist reviews passed.

Deploy Staging run 38248633596, head 19f26bcbe9a4013387a2fec92c4b296a4e5a10fc, passed on attempt 2. Attempt 1 uploaded the Worker/container application but failed on Cloudflare's final subdomain management GET with 504; independent state and health checks preceded the single retry. Playwright normal primary-token login verified dashboard, projects, the owned project page, and settings with no page/console errors.

A real isolated 2 CPU / 4 GB VM was provisioned through the existing effective compute credential path. Task reached in_progress in chat 570aaceb-8302-4a46-b35a-667e7c29557d; owner terminal and heartbeat worked. The 120-second allocator capped at host RAM did not produce critical pressure or OOM because the host had 2 GB swap. Kernel cgroup OOM counters remained zero. Ordinary idle sleep completed at 13:31:49 before the sustained page-touch follow-up could start. The harness repeatedly redeemed login on each poll, hitting the normal 20-per-IP-per-clock-hour limit; the attempted UI wake also initially used Enter rather than the required Ctrl+Enter. No auth, rate-limit, security, capacity-pool, or credential workaround was used. The corrected harness persists one normal authenticated browser session with a restricted local cookie file.

At the 14:00 reset, normal owner deletion removed the VM first, then the test workspace, snapshot state, task, and temporary profile. Cleanup completed at 14:00:42, about 55 minutes after provisioning, with peak one VM. D1 confirmed zero nondeleted nodes and zero owned node/snapshot/task/profile rows. The new test chat was stopped only by explicit cleanup. The staging lease was released.

**The required real memory-pressure eviction and same-chat move are unproven.** No PR, merge readiness, merge, production deploy, DONE, or complete_task was performed. A later approved bounded live-verification window remains necessary. This is a harness/budget failure, not successful eviction evidence. The protected production chat, snapshot and claim remain untouched.

## T2 integration and authority failure hardening (2026-10-12)

Integrated main `11d4cc80b4087d0939c6a168ca0b204e58245dc9`, including T2 #2317, without rewriting history. The recovery repair's concurrency gate calls sleep without a runtime guard, so T2's synchronous transition runs without a nested gate. Ordinary guarded sleep retains T2's runtime/claim check; the service forwards that guard while withholding the stopped-repair capability.

Authority failures are caught inside the recovery gate and rethrown outside it, preserving the DO instance and the original rejection. A real Workers regression injects rejection at the bound D1 query: the original callback rejected (RED), while the fixed callback fulfills, leaves the stopped session and eviction eligibility unchanged, and allows a healthy real-query retry on the same instance (GREEN). The test contains only the expected callback rejection to protect the RED test harness; it does not claim an uninstrumented native reset experiment.

Integrated focused Workers verification passed: service 85, real eviction 14, and T2 sleep/runtime-guard compatibility 6 tests. T2 controls cover changed generation, revoked claim, changed local binding, valid/idempotent sleep, and lookup rejection with a transient same-instance marker and healthy retry. Boundary controls now also exercise service guard forwarding. Final staging proof, fresh PR checks/reviews, coordinator merge grant, and production verification remain pending. No staging compute was allocated by this integration work; the protected production incident remains untouched.

## Review: cleanup before replacement binding

CodeRabbit comment 4250745576 raised cleanup before replacement bookkeeping. The ordinary VM provisioning-failure callback occurs after `ensureWorkspaceBookkeeping` and remains covered by the real failed-move tests. Earlier failures can leave an unbound allocation, which must not authorize stopped-chat repair. Existing cleanup throws before claim release, binding detach, or teardown; its persisted `wakeFailureMessage` makes the next alarm retry cleanup rather than replay provisioning. It does not manufacture a missing binding or automatically replay bookkeeping.

A real Workers control reconstructs that persisted pre-binding boundary and verifies the stopped chat, eviction eligibility, snapshot claim, and unbound allocation remain unchanged after refusal. Later real `ensureSessionLinked` bookkeeping establishes the exact D1 binding; its executable-task guard still refuses restarting the now-sleeping task. A subsequent cleanup alarm then converges to sleeping chat/task, failed retryable snapshot claim, and stopped/unbound unused allocation. No VM was dispatched at this boundary. Existing dispatched-failure tests separately verify actual runtime deletion and deleted/unbound replacement; the deleted legacy control still refuses repair. No repair authority or product code was broadened.

## Second staging window: owner submission failure

The normal owner `tasks/submit` request failed with HTTP 500 at 2026-10-12 17:45:15 UTC, request `9f43f047-1fac-478d-90e9-f0e4c03b751c`. The API reported `D1_ERROR` while intentionally redacting the failing query/cause. Read-only staging checks found no new task, chat, workspace, or node; only temporary profile `01M4RKFWEA8ZZ5WGZB6KV3E37V` existed. The coordinator removed that profile, confirmed zero active nodes, and released staging at channel sequence 150. No compute was allocated in this window and no blind retry or alternate submission route was used.

Read-only comparison of current Drizzle column metadata against staging confirmed no missing columns in 15 relevant tables: tasks, projects, users, agent_profiles, skills, credentials, platform_credentials, capacity_sources, capacity_pools, capacity_pool_candidates, capacity_pool_fallbacks, platform_settings, nodes, default_quotas, and user_quotas. The tasks/task_status_events table definitions and task insertion constraints were also inspected. A subsequent expanded metadata SELECT joining sqlite_master with pragma_table_info was rejected with D1 code 7500, `not authorized: SQLITE_AUTH`; that expansion stopped without an equivalent query workaround. This later read denial does **not** establish the cause of the earlier submission HTTP 500.

The submission cause remains unresolved. A supported retry requires an authorized diagnosis of the original D1 boundary/cause or schema clarification, followed by a fresh staging claim after the current holder releases it. Preserve the normal owner/session, effective compute credentials, resource limits, and existing auth policy. Do not duplicate the task, change identities, credentials, security settings, capacity pools, or D1 rows to bypass the blocker. Real eviction proof and all subsequent release gates remain pending; product source remains identical to the deployed `dc5fc5b8f` runtime.

## Native authority gate regression

Added a second authority-failure regression using the existing expected-error adapter only after the public production method returns/rejects. The workerd `blockConcurrencyWhile` implementation and callback are untouched. A one-shot D1 boundary injection executes a real missing-table SELECT; the next healthy lookup uses the real authority query. Temporarily reverting only the repair method to its uncaught implementation made the next public `getSession` RPC fail with the injected D1 error (native RED). The fixed source was restored exactly; the same test then passed, confirming the unchanged stopped session and eligibility, a transient in-memory marker surviving across RPCs, and a successful healthy public repair retry (GREEN). The earlier instrumented callback test remains a separate narrower control.

The full service Workers suite passed 86 tests with the new native proof; the unchanged T2 native runtime-guard suite also passed all 6 tests. No product source, deployment, remote D1 data, staging lease, or compute resource changed for this test work. The original staging submission HTTP 500 remains the live-verification blocker.

## CI channel lifecycle timing assertion

CI run 38287820478, Workers shard 3/3 job 114940968453, failed one existing channel capacity-share scenario while 467 tests passed. The correct recipient's match had advanced from `matched` to `batch_created` before the assertion, a legal native alarm transition. Driving the real materializer before that assertion reproduced the failure deterministically. The test now checks the unique correct recipient, explicitly materializes and acknowledges the reply wake, and checks the corresponding delivery batch is `acked`. Match state remains `batch_created` by design; acknowledgement belongs to the delivery batch. The full lifecycle Workers file passed all 14 tests. This proves the resumed pair consumes its wake instead of relying on a transient pre-materialization state. Product source and native gate proofs remain unchanged; no CI rerun, deployment, staging claim, or compute allocation was used to hide the failure.

## Request-correlated task submission diagnostics

The original staging 500 cannot be attributed retrospectively: its trace retains `D1_ERROR` but redacts the query/cause. A local real-SQLite D1 fixture with the 100-bind limit accepts the artifacts project, explicit VM Codex profile, conversation mode, and exact 2 vCPU / 3.5 GB / exclusive-node requirements. The original error is not reproduced locally and no speculative application data fix was made.

Added trusted static operation labels at submission boundaries, including the route's project-capability preflight that runs before the service. A small typed WeakMap retains the original error identity and does not trust serializable error properties. The existing global error handler includes `failingOperation` beside its generated `requestId` in the error log and persisted observability context. SQL, parameters, prompt text, credentials, and raw D1 causes remain redacted. Successful failure cleanup retains the initial failure phase; a newly failing cleanup write records its own phase. Authorization, task effects, and error propagation remain unchanged.

Two real missing-table fault injections at preflight and task insertion fail without diagnostics (RED), then correlate the correct operation with the response request ID after the change (GREEN). The submission fixture suite passes 41 tests with one existing skip, including original-error identity and successful/failed cleanup controls. The real Workers observability suite passes 15 tests, including request-ID persistence for a real Drizzle/D1 failure, preserved precise inner labels, and rejection of forged operation properties. Changed-file lint and API typecheck pass. Security and documentation review found no added secret exposure, auth/config/schema change, or public contract drift.

This diagnostic changes the submission/error-observability code; it does not change the reviewed eviction source. It has not been deployed or used to retry the staging submission. Next steps require review, a fresh staging claim after the current holder releases it, deployment, then an authorized normal same-owner request to identify the live failing operation. No alternate identity, route, metadata-read workaround, credential, permission, or capacity-pool change is authorized by this diagnostic. Required live eviction proof and subsequent release gates remain pending.

## Safe D1 failure category

Added `d1Category` beside the generated request ID and trusted failing operation in internal logs and persisted error context, including untagged D1 failures. The classifier walks native driver causes with cycle detection, skips Drizzle's SQL/parameter-bearing outer error, and emits only fixed categories: too many variables, LIKE-pattern complexity, unique/not-null/foreign-key/check constraints, missing table/column, authorization, transient D1 failure, or other. No raw message, parameter, SQL fragment, or dynamic constraint identifier is exposed; anchored reason matching avoids treating quoted identifiers or outer parameters as the failure reason.

The old handler fails the real Workers persistence assertion for the missing category (RED); the changed handler passes all 15 observability Workers tests (GREEN). Combined classifier and submission fixture verification passes 71 tests with one existing skip, covering all categories, native authorization and transient variants, cyclic causes, parameter/identifier collision controls, and the normal artifacts/VM submission case. The ordered rule-table classifier passes all 30 classifier tests after refactoring; changed-file lint and API typecheck pass. No live retry, deployment, remote query workaround, or compute allocation occurred; the historical staging 500 cause remains unproven until an authorized request uses the reviewed diagnostic.
