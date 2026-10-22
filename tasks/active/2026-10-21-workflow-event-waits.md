# Durable event-wait workflow steps

## Problem
Agent-created workflows need to wait for matching project events while the parent sleeps, then continue a DAG or fail on a finite timeout.

## Research
Foundation state is in D1 mission_steps, reconciled by ProjectOrchestrator. ProjectData already owns event admission, filtered subscriptions and match deduplication. The UI/read owner has published the wait projection contract on feature.workflows and owns PR #2405.

## Checklist
- [x] Extend validated workflow plans with event wait definitions and finite timeouts.
- [x] Persist subscription correlation, registration/listening/timeout and matched identity.
- [x] Reconcile waits through ProjectData record-only subscriptions and existing orchestrator.
- [x] Cover match, nonmatch, duplicate/replay, registration, timeout race, downstream progression and authorization in Workers tests.
- [x] Integrate UI read contract after PR #2405 lands, without editing UI.
- [x] Update documentation and tool schema.
- [ ] Run specialist review, staging, CI, CodeRabbit and production smoke.

## Acceptance
Waits require no task or VM; first canonical match before timeout wins; duplicates are safe; restarts replay registration; timeout blocks dependents; owner/project auth and event visibility hold; no payload instructions enter prompts; staged scenarios pass; release reaches production.

## References
`docs/guides/durable-workflows.md`; `apps/api/src/services/workflow-{plan,runs,reconcile,waits}.ts`; `apps/api/src/durable-objects/project-data/project-events*`.
