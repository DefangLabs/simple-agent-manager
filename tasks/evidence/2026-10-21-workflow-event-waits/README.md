# Staging event-wait verification

Runtime build `064f51efa` deployed by staging workflow [39700925586](https://github.com/raphaeltm/simple-agent-manager/actions/runs/39700925586), including the staging smoke gate. Fixture API calls used `exec_with_secrets` with `SAM_PLAYWRIGHT_PRIMARY_USER`; no credential is stored here.

## Confirmed observations

- Run `e205b2b3-6a40-4443-89b4-1d8729ed89ae`: an unrelated `workflow.step.completed` event did not satisfy a `workflow.step.failed` filter. The wait failed with `Event wait timed out`; its dependent agent step was `blocked` with `Blocked: absent did not succeed`, and no dependent task was created. The controller had already finished.
- Run `a03ec723-2fd7-4f6b-ad87-49f35e7fa082`: its wait timed out at 01:14:08 UTC. The producer agent finished at 01:15:18 UTC after VM startup delay; the late event did not turn the failed wait into a match. Its dependent agent step was blocked.
- Revised wait-only fixture: trigger run `9281a50a-7327-491d-b201-ee1eff84f6a3` registered at 01:22:55 UTC and timed out at 01:26:19 UTC. Its run entered `needs_attention` at 01:26:20 UTC. Correlated run `6b0a157b-9122-44ad-bb3a-5eb454cb93b8` registered at 01:22:56 UTC with exact filter `sam.workflow` / `workflow.run.needs_attention` / subject `workflow_run:9281a50a-7327-491d-b201-ee1eff84f6a3`; its dependent wait was still awaiting prerequisites at the last successful authenticated read (01:30:47 UTC). Its own deadline is 01:37:56 UTC.
- Controllers `01M5GJ6XEGA772608H8VHBWQQM` and `01M5GJVH546BEPPNF0TA3CXC0H` and producer task `01M5GJE7QYWZTED0SN3143CXYY` completed. The three fixture workspaces and three nodes received supported DELETE HTTP 200 by 01:23:54 UTC. Authenticated API showed zero workspaces and zero active fixture nodes; four unrelated pre-existing sleeping nodes remained.

The backend Workers integration suite covers duplicate admission, restart replay, registration and deadline races, event visibility, and dependent progression. A focused Workers test also passes the complete internal path from a timed-out workflow through its source outbox, ProjectData admission, correlated match and dependent registration. Live match and dependent progression remain unverified: token-login returned HTTP 429 at 01:35, 01:40 and 01:44 UTC. The route allows 20 logins per client IP per clock hour; a read-only audit can resume after 02:00 UTC. The fixture attempt ended at its agreed 01:45 UTC cutoff with no active test task or VM.

## Fixture and cleanup references

`staging-start.mjs` submitted the first pair. `staging-start-match.mjs` submitted the revised wait-only pair once. `staging-observe.mjs` reads run/resource state and `staging-inspect.mjs` reads the superadmin event inspector; both require the managed staging credential. `staging-cleanup-controller.mjs` and `staging-cleanup-resource.mjs` use the supported DELETE endpoints. These scripts are retained as exact evidence of the bounded commands; do not rerun the submission scripts.
