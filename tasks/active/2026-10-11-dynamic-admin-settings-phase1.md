# Dynamic admin settings — Phase 1

SAM task: `01M4NA86TV8PHK54JGKAYXPBJV`. Output branch: `sam/implement-phase-1-dynamic-yxpbjv`.
Delivery: finish existing PR #2304, then merge and deploy after required gates under Raphaël’s 2026-10-16 authorization below. No production setting mutations or new credentials. Earlier draft-only notes below are historical.

## Research and boundaries

Read coordinator proposal 6d1abfab-c42e-4517-9035-cb6514cd9158 and streaming continuation from session 70245441-0e5c-45de-9421-e815a976f240 (2026-10-11 08:18 UTC) through cursor-paged SAM reads. D1 is authoritative; instance caching permits bounded convergence, not instantaneous global consistency.

Existing implementation: platform-config-core/store own encrypted OAuth writes and cache invalidation; connector-settings owns ten D1 overrides; trial/kill-switch and operational-kill-switch own KV flags. Trial defaults off/fails closed; runtime loops default on/fail open for availability. Existing platform config includes unrelated app/webhook/feedback controls, which remain outside the migration.

Related idea 01M47V0101CAM43ZNZN4JHB4AK identifies the missing stalled-task classifier kill switch. Its other numeric limits and PREVIEW/MCP forwarding gaps remain outside Phase 1. Confirm complete operator-switch inventory against proposal and current code before implementation.

Recovery coordination: durable request 0b4ea06a-a6ce-4fa4-b206-99817e8d8088; channel reliability-wave-1011. Await agreement on shared files/migration numbering before edits. Preserve Wave E PR #2303; do not take recovery branches; shared integration/staging behind recovery wave. PR Shepherd stays paused. Channel subscription 7bef5f47-8190-4fad-8d1d-1e791c0de817 provides durable wake.

Coordinator acknowledgement event 2ecf359a-9bcc-4603-af60-6fdaaa0eed79 explicitly defers overlapping shared edits, migrations, staging and integration until recovery release. Processed and acknowledged delivery 1fe6b6e8-fe95-4863-81d6-b0c62747bc1e. Task's own direct implementation/draft-only authorization was reported separately; recovery coordinator is not the source of Phase 1 authorization.

### Writer inventory and implementation decisions to validate

OAuth: `savePlatformIntegrationConfig` called by admin-platform-config and setup PUT; `completeSetupWithConfig` called by setup completion. Keep setup authorization and validation separate from admin writes. Existing encrypted store supports GitHub, Google login, independent Google infrastructure and GitLab; do not migrate app/webhook/feedback/analytics keys as Phase 3 work.

Connector: `updateConnectorSettings` called by connectorAdminRoutes. Existing null resets remove override and reveal environment fallback: preserve this API contract and explain fallback in UI; a separately labelled code-default action must not pretend deletion suppresses a legacy environment value.

KV: `setTrialsEnabled` called only by admin-trials; `setOperationalLoopEnabled` called only by admin-runtime-controls. Runtime reads also happen in scheduled handlers and Durable Object alarms, not only HTTP requests. Enumerate and test those consumers. Legacy KV flags remain compatibility fallback until D1 overrides exist; do not introduce live backfill which would change production values. Rollback must account for old code reading KV instead of new D1 overrides.

Missing operator switch: `STALLED_TASK_CLASSIFIER_ENABLED` is read synchronously in two classifier paths. Migrate the actual asynchronous entrypoints without changing the numeric classifier config or its decision policy. Unrelated compaction-detector, storage, event, preview and numeric tunables stay out of scope.

Cache: key by `resolveD1BindingIdentity`, not request session facade. Cache only persisted snapshots and resolve legacy environment per call. Capture generation before awaited reads; late pre-save reads must neither publish nor return authoritative stale state after invalidation. Clamp TTL to a fixed safety ceiling. Security settings never fall back to stale permissive values after expiry; observed disabled brakes remain disabled through an outage. Admin GET should bypass cache and report errors rather than presenting defaults as current D1 truth.

Concurrency/audit: use atomic D1 `batch`, never interactive transaction; mutations and audit must share rollback semantics. Server revision compare-and-set required for UI saves, including resets and secrets. Audit contains allowlisted key/action/actor/time/revision; secret values and plaintext derived errors must be absent. Legacy writers must share revision/invalidation/audit behavior so the old endpoints cannot bypass it.

Primary documentation checked: https://developers.cloudflare.com/d1/worker-api/d1-database/ — batch statements roll back as a sequence on failure; first-primary sessions retain sequential consistency. Tests need actual SQLite migration/transaction behavior and workerd coverage, not only mocks of batch success.

UI variants considered: (1) searchable grouped cards with per-setting save/reset, (2) wide settings table, (3) category wizard. Prefer grouped cards: wraps on phones and isolates risky edits; table risks horizontal overflow and wizard hides overview. Keep connection management and unrelated integration controls accessible outside the generated Phase 1 cards.

## Scoped implementation plan

- [x] Agree ownership/integration order; publish exact shared-file and migration claims.
- [x] Declare typed metadata/default/validation registry for bounded Phase 1 controls; reuse encrypted OAuth storage, existing authorization and secret mutation validation.
- [x] Implement D1 override resolution with legacy-env/KV compatibility, bounded stable-binding instance cache, generation fencing, local invalidation and safe outage policy.
- [x] Add atomic audit/version handling; reject concurrent stale writes. Secret audit stores action/actor/time only.
- [x] Route all existing Phase 1 writers/readers through shared behavior; enumerate setup/admin OAuth, Connector, trial and runtime writers. Preserve API compatibility.
- [x] Build grouped/searchable mobile admin settings page, source/default display, reset, confirmation and change history. Preserve existing connection/credential operations.
- [x] Wire missing operator kill switches with unchanged fresh-install defaults.
- [x] Update guidance/docs and add CI env-tunable ratchet with narrowly explained bootstrap allowlist; preserve legacy environment migration support.
- [x] Test authorization/approval, invalid and adversarial input, precedence/reset, concurrent edits, interrupted/repeated saves, cache fencing/expiry/cross-instance convergence, D1 failures, encrypted redaction, migration upgrade/fresh install/rollback.
- [ ] Run lint/typecheck/tests/build and agent-context budget; review desktop/mobile screenshots and browser error flows.
- [x] Independent Sol specialist/adversarial review; address findings and task-completion review.
- [ ] Coordinate bounded staging after wave release; verify real admin route/UI without live production mutation or new OAuth grants.
- [ ] Publish separate draft PR with complete verification evidence and requested CodeRabbit review; report exact remaining limitations.

## Acceptance

No secret appears in API responses/logs/audit. Cache duration never becomes unbounded through legacy configuration. An outage never silently re-enables an observed disabled safety control. Existing install behavior and fresh-install defaults hold. All settings changes are approved-superadmin only and auditable. Only Phase 1 migrates; no unrelated bulk tunables or new credentials. The current endpoint is verified production deployment after all gates; the original draft-only endpoint was superseded on 2026-10-16.

## Verification so far

Baseline at eb18d9c93: installed frozen lockfile, built shared package, then ran five current suites (`connector/settings`, `platform-config-cache`, `trial-kill-switch`, `operational-kill-switch`, `admin-runtime-controls`): 5 files / 48 tests passed. These are baseline results, not Phase 1 implementation verification. Earlier attempts failed due to missing dependencies/build outputs; setup is now complete for these tests. Full implementation, adversarial review, real authorization/browser QA and staging remain outstanding behind the ownership hold.

## PR #2304 gate cleanup — 2026-10-12

Original task is failed; replacement gate-cleanup task `01M4RMMQG7HX4PB6E11106RKEB` owns the existing draft PR. Original delivery constraint remains **draft / do not merge / do not deploy**. The Phase 1 checklist above is intentionally not complete and this task must not be archived from the foundation diff.

Implemented isolated foundation only: `admin-settings-registry.ts` declares 23 metadata definitions and reuses shipped Connector defaults/validation and OAuth store identifiers. `admin-settings-cache.ts` supplies binding-scoped snapshots, bounded TTL, single-flight reads, generation fencing, clone isolation, fresh-read bypass and sanitized outage errors. Neither module has a production consumer; no migration, route, live setting mutation, new credential, domain/bootstrap change or resource provisioning is included.

Gate cleanup removes accidentally autosaved `.do-state.md` from git and replaces the autosave-only PR body with scope, preflight and review evidence. Review identified an unchecked D1 row boundary; validated allowlisted row fields now reject malformed results with a sanitized error and discard unexpected fields. Five regression cases failed before the fix and passed afterward.

Validation: six focused API suites passed, **64 tests** (16 foundation and 48 existing Connector/platform-cache/trial/runtime tests). This verifies the foundation and preserved baseline only. Final lint/typecheck/build/CI and CodeRabbit outcomes are recorded in the PR body.

Independent local env/config/domain review passed for foundation: no Env/deploy/domain changes, existing defaults reused. Cloudflare/config review required the D1 row-boundary fix. Task-completion review confirms full Phase 1 is incomplete: effective resolution, atomic audit/revisions, all legacy reader/writer routing, superadmin authorization, UI, missing switch integration, migrations/rollback, docs/CI ratchet and staging remain outstanding. Do not present these as implemented or validated.

Staging is required before integrated runtime code can become merge-ready, but the original explicit no-deployment constraint and separate integration sequencing remain in force. No staging deployment or resource was created by this cleanup. CodeRabbit is requested through the approved label/workflow path while preserving draft status, as explicitly requested by the cleanup task.

## Fresh recovery — 2026-10-16

Current owner task `01M52PEXV56VPD7H8541HP8EFJ`, existing PR #2304 and branch unchanged. Raphaël explicitly authorizes completing Phase 1, readiness, merge and production deployment after repository gates; this supersedes the historical draft-only endpoint above. One supported message asking original completion owner to push recovered work failed with nonretryable `recipient_unavailable` (chat no longer active for its task). Raphaël then explicitly authorized reconstruction from GitHub; retained snapshot remains untouched and its access is no longer a blocker. No auth bypass, lifecycle DB change or credential expansion.

Reused registry/cache foundation and normally merged current main. Reconstruct service/migration/route, legacy consumers and mobile settings editor. Local implementation agents own disjoint backend, integration and web paths. Final independent review and exact-head tests remain mandatory. Cost incident task `01M52PH42QMRWN19K3TQ9GCAQG` has shared deployment priority; coordinate before staging/merge/deploy. Never take over #2305/#2351/#2363/#2357, mutate live production settings, or perform destructive live tests.

Recovery validation: original foundation 16 tests passed before reconstruction. Current frozen install and shared/providers/cloud-init builds pass. New environment ratchet includes inherited scalar fields plus Worker vars; its two behavioral tests and static check pass. Agent context budget measured after guidance changes. These are partial results, not feature-completion evidence.

## Final reconstruction review and browser evidence

Checkpoint `73f818a48` contains restored implementation. Fresh independent backend reviewer found emergency KV override, primary/replica snapshot and ignored TTL issues; fixes are source re-reviewed with no remaining critical/high findings. Fresh task-completion/docs/constitution/env reviewer confirms all 23 consumer mappings and metadata/ratchet scope. Legacy accepted OAuth read values remain compatible; new writes retain validation. Bulk OAuth reads preserve the auth-preamble query budget even with caching disabled.

Browser audit on the actual web app with mocked HTTP: 4/4 cases pass on 375×667 and 1280×800, plus 320px confirmation overflow check. All four provider pairs save/reset atomically, secrets stay masked, conflicts/network failures retain drafts, duplicate saves are guarded. Fixed stale success banner after pair-validation error; UI component6/6 pass. UI reviewer and root inspected screenshot images; no clipping/overflow; rubric hierarchy4/clarity4/mobile4/accessibility4/consistency5. Evidence under `tasks/evidence/2026-10-16-admin-settings/`.

Serial focused API verification:12files/104tests pass, plus compatibility3/3 after correcting realistic fixture timestamps =107tests. Real D1/workerd, broad lint/typecheck/test/build, exact-head CI/Sonar/security, coordinated live staging and final production evidence remain pending. No completion/merge claim from source review or subset tests.
