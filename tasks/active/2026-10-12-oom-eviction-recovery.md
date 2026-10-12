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
- [ ] Provisioning failure and unchanged no-snapshot 409 controls; discriminating revert proof.
- [ ] Sequential lint/typecheck/test/build; specialist reviews.
- [ ] Exclusive staging deployment and bounded real memory-pressure eviction, runtime teardown verification, cleanup.
- [ ] PR CI/Sonar/CodeRabbit; MERGE_READY then coordinator MERGE_GRANT.
- [ ] Production deployment/Worker/health proof; next natural eviction read-only check.
- [ ] Report supported stranded-chat recovery or precise approval-required one-off without mutation.

## Acceptance
Chat never stopped during captured eviction and move reaches in_progress on replacement VM. Failed move leaves sleeping chat and no claim/binding stranded. No general stopped resurrection. Instant remains consistent through shared service guards. No merge without live staging proof. Protected production chat never mutated.

## Verification evidence
- Existing eviction prompt suite: 6 passed.
- Expanded real Workers eviction round trip: 10 passed, including captured move, provisioning failure, injected legacy stopped mirror during failed provisioning, and unchanged uncaptured callback 409 control.
- Revert proof: removing both pre-finalizer preparation calls made `never stops the chat and reaches in_progress on another VM` fail (expected sleeping, received stopped). Fixed source restored.
- Root lint 13 tasks passed; root typecheck 19 tasks passed; root build 9 tasks passed, sequentially.
- Full monorepo tests still running, one worker and one package at a time.

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
- Main integrated conflict-free at b7fea305 after C #2302 and model refresh #2314. Integrated root lint/typecheck/build passed; 6 Workers suites passed 144 tests, including C compatibility and unchanged Instant recovery. Full monorepo rerun pending.
- Coordinator relay refined historical restoration: a separate reviewed one-case allowlist, consulted only through an explicit supported owner wake, with every identity/generation/intent/expiry/budget rechecked, no database backdoor, removed/expired after use. Main preventive PR performs no historical restoration. That follow-up remains pending; original incident data untouched.

## Local review and stop-intent hardening
Security review caught a matching live wake claim reviving an ordinary stopped chat. Stopped healing now additionally requires explicit eviction-stop eligibility stored alongside the successful DO terminal transition in existing metadata. Ordinary/internal stop intent, including a no-op repeated stop, clears eligibility; successful sleep/wake consumes it. Duplicate explicitly attributed eviction stops preserve existing eligibility without recreating eligibility revoked by an ordinary stop. Unknown historical stops refuse repair.

The repair RPC validates local identity/eligibility and exact D1 claim inside `blockConcurrencyWhile` immediately before synchronous sleeping mutation. D1 and DO cannot share a transaction; current attempt fences remain required for distributed ownership. The existing snapshot wake service has a preexisting distributed claim-read/RPC window, but its synchronous stopped wake now requires the same local eligibility; no ordinary stop can revive through it. A broader wake authority protocol is outside this preventive change.

Read-only Sol reviews: Cloudflare/constitution PASS; completion/test/docs implementation PASS with release gates pending; security initial finding ADDRESSED/PASS after final re-review. Service Workers 84/84 PASS, including ordinary/repeated/internal/unknown stops, duplicate explicit eviction replay, queued newer stop during authority read, and revoked claim before the real D1 read. The initial race harness crossed Cloudflare I/O contexts; final harness delays query dispatch and runs the original real D1 query in the repair RPC context.
