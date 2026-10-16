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

## Superseded initial provider inquiry — retained research, do not send

Canonical ready-to-send text is [reliability-c-provider-inquiry.md](../../docs/architecture/reliability-c-provider-inquiry.md). Use that standalone document, reviewed by the independent local Sol boundary reviewer, instead of the initial draft below. The canonical text separates invocation cancellation, dispatched KV settlement, and final read visibility, and omits application/account identifiers. No support contact is authorized or performed.

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

## Official capability and support-channel research, 2026-10-16

Public documentation and the connected Cloudflare OpenAPI were inspected read-only. No operational endpoint was invoked. The documentation search tool returned no matching chunks for the retirement query; the claims below use the actual official pages and API schemas, not that empty result.

| Documented fact                                                                                                                                                                                                                                   | Missing guarantee for C                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Worker limits](https://developers.cloudflare.com/workers/platform/limits/#duration): a connected HTTP invocation has no fixed wall-time ceiling; post-response/disconnect waitUntil has a separate bound.                                        | No global application-version drain acknowledgment follows from elapsed time since deploy.                                                                                |
| [Runtime updates](https://developers.cloudflare.com/workers/platform/limits/#runtime-updates) describes termination of old provider runtime processes after their grace period.                                                                   | It does not identify a customer-triggered application retirement operation or observable global completion for this deployment.                                           |
| [Delete deployment](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/delete/) cannot delete the latest active deployment. The connected API describes deletion of older deployments. | Neither in-flight cancellation nor settlement of dispatched storage operations is specified.                                                                              |
| [Delete version](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/delete/) is present in the connected API; its description only identifies version deletion.         | No cancellation, global completion, or storage-settlement semantics are documented there. No deletion attempted.                                                          |
| [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/#consistency) describes eventual visibility, including cached negative lookups and cases taking 60 seconds or more.                                                   | A settled invocation is not proof that a DO's first legacy read contains every completed old write. A guessed fixed visibility wait is not an attested migration barrier. |
| [Version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/) can reach an individual version when enabled.                                                                                                    | Routing the normal hostname entirely to the bridge is not evidence all other old-version entry points are disabled.                                                       |

The connected OpenAPI search found build cancellation, which cancels builds rather than application invocations; it found no application drain/cancel-all-invocations operation. Its only path containing a support segment was unrelated TLS capability reporting, not a case/ticket interface. This is a bounded search result, not proof that no provider-internal capability exists.

### Support channel and authenticated access

The documented private channel is [Dashboard → Support](https://dash.cloudflare.com/?to=/:account/support), then Technical Support and the applicable account/category. Cloudflare's [contact instructions](https://developers.cloudflare.com/support/contacting-cloudflare-support/#submit-a-support-case) describe case access for paid plans and limited case categories for Free users. Actual account entitlement and a signed-in support portal session have **not** been established; no plan change is proposed.

Existing managed staging/production API credentials successfully performed the previously recorded read-only checks. The already connected Cloudflare ReadOnly Pro identity also passed its whoami check during this research; no token values or identity details were exported. These observations establish API authentication only. They do not establish support-portal login, account entitlement, or ticket-submission permission. Opening the public dashboard link through the web reader returned an application shell without authenticated case-access evidence. No login, credential extraction, permission change, support message, ticket draft creation in the portal, or paid browser session was attempted.

Community/Discord are documented alternatives, but would publish a message externally and do not by themselves provide an account-specific operational guarantee. Do not post there without explicit human authorization. If no existing authenticated private support session is available after authorization, hand the reviewed inquiry to the account holder for submission through the normal Dashboard support flow; do not create credentials or request secret values in chat.

### Clarifications for the ready-to-send inquiry

Include these official references as the factual basis of the draft above: [HTTP/runtime limits](https://developers.cloudflare.com/workers/platform/limits/), [deployment deletion](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/delete/), [version deletion](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/delete/), [KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/), and [version URLs](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/). We found no guarantee establishing the three separate barriers: old execution cancellation, pending storage settlement, and visibility of the final legacy view. Ask for the exact supported procedure and acknowledgment for each, or explicit confirmation it is unavailable.

Old installed VM agents do not themselves write Cloudflare KV: their future requests through the canonical API hostname can be served by the new Worker with the existing callback authentication contract. This is distinct from already executing old Workers and old-version-specific entry points. No unrelated VM stop/recreation or credential change is required or justified as retirement evidence.

Risk boundary: arbitrary deletion of the Worker can delete associated resources; version/deployment deletion has unverified interruption and rollback consequences. Those are not proposed trial operations. The inquiry asks for documented behavior only. Any identified operation still requires isolated verification, a concrete interruption/storage risk assessment, and separate action-time authorization before production use.
