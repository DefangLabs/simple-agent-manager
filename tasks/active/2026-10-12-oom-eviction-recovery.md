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
