# OOM eviction recovery

## Problem
Eviction clears an in-flight sleep then finalizes the old runtime before marking its saved snapshot sleeping. The finalizer stops the conversation and TaskRunner refuses linking it to a replacement.

## Research
- workspace-eviction-callback.ts finalizes before workspace-eviction-recovery.ts updates sleeping_at.
- Finalizer already consults the shared restorable/in-flight snapshot predicate; preserve that guard (rules 58/61).
- ensureSessionLinked repairs only failed mirrors. Failure cleanup cannot sleep stopped mirrors, preventing claim/binding release.
- Current callback rejects snapshotCaptured:false. Verify safe no-snapshot terminal control without weakening snapshot capture requirements.
- Recovery reuses stable task owner and attempt ID; keep rule 66 ownership fencing.

## Checklist
- [ ] Mark exact eviction snapshot sleeping before lifecycle finalization, including callback replay.
- [ ] Scope stopped mirror repair/re-sleep to authorized same snapshot/attempt claim.
- [ ] Verify failed replacement returns sleeping, releases claim and deleted workspace binding.
- [ ] Workers regression uses real snapshot-complete, eviction and TaskRunner linking; external VM/provider doubles only.
- [ ] Provisioning failure and no-snapshot controls; discriminating revert proof.
- [ ] Sequential lint/typecheck/test/build; specialist reviews.
- [ ] Exclusive staging deployment and bounded real memory-pressure eviction, runtime teardown verification, cleanup.
- [ ] PR CI/Sonar/CodeRabbit; MERGE_READY then coordinator MERGE_GRANT.
- [ ] Production deployment/Worker/health proof; next natural eviction read-only check.
- [ ] Report supported stranded-chat recovery or precise approval-required one-off without mutation.

## Acceptance
Chat never stopped during captured eviction and move reaches in_progress on replacement VM. Failed move leaves sleeping chat and no claim/binding stranded. No general stopped resurrection. Instant remains consistent through shared service guards. No merge without live staging proof. Protected production chat never mutated.
