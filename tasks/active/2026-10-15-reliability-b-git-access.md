# Reliability B: Git access retries, budgets and repository authorization

Owner task: 01M500AK29N2DS0YQ7D6N3KA0S. Coordinator: 01M50044HCHRVR12B4337721G5.
Draft PR only; no merge or independent staging. Final CI/Sonar/security/CodeRabbit and pinned consolidated staging belong to coordinator.

## Research
- Provisioning and helper both call fetchGitTokenResponseForWorkspace; one transient failure currently terminates provisioning.
- Helper defaults 5s; shared upstream transport header budget 10s. Preserve caller cancellation and set a smaller total upstream budget than helper.
- assertRepositoryAccess accepts stale positive KV data and scans every page on a miss. Replace positive authorization cache with nonauthoritative page hints, verify fresh user/installation intersection and stop scanning when found. Do not cache tokens, negative results or serve stale auth.
- Existing user-filtered installation endpoint is the authorization authority (GitHub REST installations docs). Keep this endpoint; no broader app-only substitution.
- Relevant lessons: scoped rules 34 callback auth, 71 caller context, 72 recovery categories. Never log response bodies or transport URLs for credential requests.

## Implementation checklist
- [ ] Configurable bounded attempts/backoff/total request budget, defaults aligned with helper budget.
- [ ] Retry transient transport, body interruption, 408/429/5xx; fail fast other 4xx and invalid payloads; cancellation honored.
- [ ] Safe categories/status/attempt telemetry without secret-bearing underlying errors.
- [ ] Replace authorization cache with fresh checked page hints and early exit; cache unavailable cannot break access.
- [ ] Tests through actual provisioning and helper: success, exhaustion, cancellation, 4xx, slow response, redaction.
- [ ] API tests verify pagination, stale/revoked/changed identity, token/user/installation separation and failure behavior.
- [ ] Update configuration/docs; full lint/typecheck/test/build and Go checks.
- [ ] Independent local domain/completion and fresh adversarial security reviews; fix findings.
- [ ] Draft PR with durable evidence; publish pinned-head readiness and consolidated staging plan.

## Acceptance
Transient failures recover within bounded budgets; permanent auth/revocation never retries or serves stale credentials. Both helper variants survive slow successful responses and cancel promptly. Repository checks preserve fresh user ∩ installation authority. Scanner coverage/baselines unchanged.

## Consolidated staging plan
Coordinator integrates A/B/C pinned heads, deploys once, provisions configured-pool workspace, verifies heartbeat and clone, push and gh refresh after delay/transient failure; verifies revoked repo/user access denies credentials, cancellation and safe telemetry. Exercise standalone and devcontainer helpers. Clean test workspace/node; capture runtime version/head and evidence. No independent B deployment.
