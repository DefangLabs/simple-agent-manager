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
