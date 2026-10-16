# Reliability C production release

Owner: SAM task01M538QAGEM4EA8QQT5G7X8PVS; session7c9747b3-5708-4456-b50f-ce84f43e405d; started2026-10-16T21:09:46Z. Running Codex turn_context verifies gpt-6.1-sol. Assigned isolated checkout/branch reused; no extra worktree or resource sizing.

## Scope and source

Finish hot MCP counter/boot-log KV migration through verified production activation. Preserve current main and independently released A/B. Extract C from exact integrated77f803d91/runtime7a623c; original source a890a46b retained. Do not integrate stale combined code or quarantined autosaves2352/2354/2364/2367 or2351. Original implementation task's draft-only scope is historical; this release task owns the remaining normal gates and production objective.

## Checklist

- [x] Read current2361/2357 bodies and exact source runbook/tasks.
- [x] Reconcile C-only source/config/tests onto main51a0, excluding unrelated code.
- [x] Independently analyze prebridge/in-flight writer boundary (local Sol C-PREBRIDGE-BOUNDARY-20261016-01).
- [ ] Obtain complete concrete old/in-flight writer fence/retirement proof; see runbook decision.
- [ ] Complete meaningful adversarial old/new, clean/upgrade migration and rollback verification.
- [ ] Current full lint/typecheck/tests/build and quality checks.
- [ ] Required independent security/Cloudflare/constitution/docs/completion reviews.
- [ ] Coordinated pinned staging verification; max1 normal-pool VM if needed; activation isolated.
- [ ] Exact CI/Sonar/security and trusted CodeRabbit request/wait/findings resolution.
- [ ] Normal main merge/canonical production; record SHA/run/CF version/health.
- [ ] Safe immutable activation, quota/callback/rollback/old-writer proof; preserve evidence before cleanup.

## Findings and limits

Old MCP auth->heldJSON->freshwindowKV and old ready auth->heldJSON->currentpendingworkspace->callbacksigning prevent retroactive fencing by new shared-record code. Key/namespace splitting and identity births do not complete migration. Local reviewer edited no files. Escalation to parent requests exact provider retirement semantics, not a credential/security workaround. No deployment, activation, cancellation, support message or credential/storage manipulation performed.

SAM readonly child01M538VQBG2MFXKCGZGBQ79W8D started21:12:12 and failed21:12:30 agent_prompt_failed with Caller identity is not valid for this project reported for get_event/ack. No useful review claimed and no blind retry. Replaced by local Sol reviewer.

Live read-only CF21:14:01: shared staging activation record ABSENT, query primary/0rowswritten; current staging CF80d54154-8d4e-4da0-aa68-528e7e0edcd1@100%, owned by A. No staging overwrite.

## Validation

Dependencies installed frozen lock; shared/providers/cloud-init build PASS. Initial unit run lacked built workspace dependencies; after build, targeted3files35tests PASS. Initial Worker command accidentally selected entire suite; stopped own runner and corrected direct Vitest file selection. Final focused real Worker18tests PASS, including two explicitly unsafe prebridge overlap characterizations; the minute-boundary clock is pinned and restored. Affected API9files375tests PASS; migration/config2files80tests PASS; full scripts52files730tests PASS. APIlint/typecheck/build and DO/migration/bindings quality checks PASS. Full repository suite and exact CI remain pending until a release candidate is ready. No historical tests are claimed as current-head proof.

Read-only CF21:16:45: production activation ABSENT (primary read/0writes); production version4a5b351d-f25d-49a9-8506-66995e4ae770@100%.

## Independent current source review

- C-PREBRIDGE-BOUNDARY-20261016-01: local Sol adversarial reviewer, no additional bridge defect; confirms old/inflight retirement blocker. Minor test minute-boundary flake fixed using restored Date.now spy. Reviewer did not execute tests.
- C-CF-CONSTITUTION-20261016-01: local Sol Cloudflare/constitution source review, no new blocking source findings; migrations/bindings/locking/bounded/configurable storage reviewed. No live/test execution claimed.
- C-SECURITY-DOCS-COMPLETION-20261016-01: local Sol security/docs/completion source review, no new auth/identity/failopen defect; full objective FAIL until oldwriter/live/release gates complete. Staging role wording clarified. No release approval.

Provider retirement request sent to parent in durable message b70f6722-2d8c-49d5-8822-56222879ec63; no support inquiry or cancellation attempted. Channel reliability.2026-10-15 retains milestone evidence. Shared activation stays absent. This task is incomplete and must not be archived.

## Coordinator provenance confirmation

Durable coordinator event65ca282d-4149-49bb-b554-700df390f529 confirms original dispatch used explicit Sol profile01KSSMJCG4EE1XS153GNZX5B09 and verified this task/session/title/branch. Actual local turn_context independently confirms gpt-6.1-sol. get_task_details does not expose resolved profile; no such claim is made. This message predates the pushed retirement findings and grants no cancellation/support-contact authority.

## Proposed provider inquiry — draft only, not sent

Subject: Supported global retirement boundary for old Workers application versions before a storage migration

We operate `sam-api-prod` and `sam-api-staging`. An old application version may have authenticated an HTTP request and then be awaiting a streamed JSON body. When resumed, that version can issue new KV operations. It may also have deferred work or already-dispatched KV writes. We need to migrate hot KV counters and boot logs to Durable Objects without overlapping authoritative writers.

Please identify a supported, nondestructive operation or documented guarantee that can establish retirement of every invocation of specified old application version IDs. Specifically:

1. Does an application deployment or version deletion terminate held-body requests, open connections, and deferred tasks? If so, what is the global completion signal or guaranteed upper bound, and what exactly starts that bound?
2. What happens to KV writes already dispatched when execution is terminated? What acknowledgment establishes completion/cancellation and read visibility needed for migration?
3. How do we ensure old versions cannot be invoked again through version URLs, overrides, or other entry points after retirement?
4. Can this be accomplished while preserving Worker identity, Durable Object namespaces, D1/KV/R2 data, bindings, secrets, and existing VM credentials? Please specify any interruption to current requests.
5. Can the exact operation be exercised in an isolated Worker and independently observed before applying it to production?

The documented grace period for a Cloudflare runtime process update is not being treated as an application-deployment retirement guarantee. No production operation is requested by this inquiry. We need the supported semantics and procedure first; an operational change would receive separate review and authorization.

Coordinator decision requested: authorize sending this scoped inquiry through an existing supported support interface, or supply equivalent existing authoritative retirement evidence. The C owner has not contacted support or executed any cancellation operation. Current release authorization does not by itself establish provider semantics or authorize credential/storage-boundary redesign.
