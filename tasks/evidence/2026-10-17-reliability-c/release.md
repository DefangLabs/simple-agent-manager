# Reliability C replacement release evidence

Status: source validated; staging/PR/production not yet performed. Do not treat this as a completed release.

## Provenance and scope

Task `01M54TW40EA2VTA54SJ34SRJX1`, chat `3cb2972f-c7c7-43d1-ab2b-8db206e84628`, agent session `01M54V4ZKDD3YWQ7HD2P9G47JR`; assigned named branch `sam/ship-reliability-c-kv-4srjx1`. Primary D1 read (0 writes) confirms profile `01KSSMJCG4EE1XS153GNZX5B09`, `openai-codex`, `gpt-6.1-sol`; local turn context agrees. Preserved source remote `74d5b9486f60152c2d9be9f1ba357da3435355eb`, current main `980cef76cfca70842492d501307e660798155747` merged normally. Original sleeping owner remains untouched. All independently shipped main changes retained.

User's 2026-10-17 11:41 UTC quiet-window authorization supersedes provider/global-retirement proof. Extra authenticated admissions and missing bounded diagnostics from old invocations accepted without a fixed overlap ceiling. No support contact, forced stops, new credentials/auth surface, outage or immutable-record replacement.

## Current checks

- Repository lint: 13 tasks PASS (existing warnings only).
- Repository typecheck: 19 tasks PASS (existing Astro baseline).
- Repository build: 9 tasks PASS; explicit standalone marketing build 243 pages PASS after an initial generated-chunk failure while running other checks.
- Repository tests:21 tasks PASS, including API887 files /12483passed /2skipped (1file skipped) and web343files /4096passed.
- Lifecycle + storage unit regression: 2 files / 35 tests PASS. Clear failure prevents dispatch, records retryable failure, retry succeeds, successor lifecycle claim is preserved. MCP activation/DO failures recover with the same identity/window and consumed quota, without KV fallback.
- Real Worker storage: 1 file / 18 tests PASS. Atomic admissions, fallback identities, held bodies, log ordering/clear/TTL/deduplication, immutable guards and compatible-instance state retention; unsafe old-writer overlap retained as accepted-risk characterization.
- Activation script: 1 file / 6 tests PASS. Pinned live SHA/version/bindings, read-only preflight, idempotent exact retry, conflict/expiry/alignment/config-change rejection and atomic SQL. Actual JSON Number values plus fractions/strings tested.
- All deployment/quality script tests: 55 files / 741 tests PASS using two workers. Initial checks found unsafe workflow expression in shell (fixed via env), main's newly ignored checkpoint invalidating synthetic fixtures (test-only fixture correction), and two existing shell test timeouts during concurrent full-suite/build activity. No timeout/gate weakened.
- Migration ordering, DO migration compatibility and Wrangler bindings checks PASS; generated clean/upgrade migrations and binding behavior covered in scripts suite. C guard migration is0197 because shipped admin settings owns0196.
- Formatting and diff whitespace PASS.

## Independent local Sol reviews

| Reviewer                                    | Status    | Outcome                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| security_review                             | PASS      | No blocking findings; final env-supplied SHA, numeric guards and primary-read assertion rechecked. Independently ran original activation6tests.                                                                                                                                                                 |
| cloudflare_review / constitution            | ADDRESSED | Atomic SQL/mutex/retention/primary reads, bindings and clean/upgrade history sound. Numeric transport issue resolved with actual D1 observation and strict integral CAST validation; activation6tests independently passed.                                                                                     |
| lifecycle_review / docs/test/env/completion | PASS      | Minimal rebuild recovery fix, tests, workflow docs and existing-secret consistency reviewed; independently35unit+6activation passed. Live completion gates remain pending. Final numeric/adjacent synthetic fixture recheck PASS; constructed snapshot test is not production snapshot implementation coverage. |

## Read-only live observations

- Production Cloudflare Worker `85d8c86d-e005-4016-9a65-d0f19ef3fa5b` at100%; staging `d6c2ab4e-e63c-4888-9227-9b5528e03528` at100% before C deployment.
- Existing deployment successes: production run38984656469 on main980cef76c; staging38981626221 on admin candidatea0e3fc4b.
- Safe allowlisted version inspection confirmed `resources.bindings` with `DATABASE.id` and version annotations shape. Full settings/versions bodies never logged.
- Staging D1 REST query `SELECT typeof(?1)` with JSON parameter180 returned `real`, `served_by_primary=true`, 0rows_written. Publication SQL therefore validates exact numeric integrality and casts stored JSON integers. Every publication/readback API response requires explicit primary servicing.
- Supported Playwright staging token-login200, active smoke superadmin. Before C: no activation record,0creating workspaces;3retained nodes are sleeping. No fixtures created/mutated.
- Staging release requested from coordinator and previous admin2304 owner; no overwrite before explicit release.

## Remaining release gates

Coordinated pinned staging sweep and normal-pool VM lifecycle/cleanup, actual existing deployment credential publication/readback, compatible rollback, focused PR exact CI/Sonar/CodeRabbit, canonical production SHA/run/live CF/health, actual natural quiet-window observations including own release session, immutable future activation and postactivation MCP/counter/log/no expected hot KV write evidence. Preserve any observed old outliers separately. This file will be updated with actual outcomes.
