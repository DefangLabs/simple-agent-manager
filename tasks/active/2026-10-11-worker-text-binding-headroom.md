# Worker Text-Binding Headroom: Stop Shipping Default-Valued Vars

- **SAM task**: `01M4MZTMG7RHYYFZXXNNQSDSAR` (Wave E, channel `reliability-wave-1011`)
- **Branch**: `sam/wave-e-reliability-wave-qsdsar`
- **Created**: 2026-10-11

## Problem

The production API Worker is close to Cloudflare's per-Worker text-binding limit, and the
deploy-time guard will soon refuse production deploys.

Verified 2026-10-11 through the Cloudflare script-settings API and the repo:

- `sam-api-prod` has 296 `plain_text` + 25 `secret_text` = **321** text bindings
  (`sam-api-staging`: 301 + 26 = 327 from a branch deploy).
- `assertWorkerTextBindingLimit` (`scripts/deploy/sync-wrangler-config.ts`) fails the deploy
  above **340** (350 Cloudflare max − 10 headroom). Its count is emitted vars **plus all 38**
  `set_worker_secret` names in `configure-secrets.sh`, so production already sits at
  ~296 + 38 = **334 / 340**.
- `apps/api/wrangler.toml` `[vars]` has **283** entries and grew net +9 since 2026-09-26
  (~0.6/day). Staging branches hit 341 and 344 on 2026-10-10.
- The planned operator kill switches (idea `01M47V0101CAM43ZNZN4JHB4AK`) would use most of the
  remaining room.

Most `[vars]` entries restate the value the code already uses when the var is absent
(`DEFAULT_*` constants and parse fallbacks). Each costs a binding and buys nothing.

## Research Findings

- `getApiWorkerVars` (`scripts/deploy/sync-wrangler-config.ts`) spreads every top-level `[vars]`
  entry into the generated `[env.*].vars`, then overwrites `BASE_DOMAIN`, `VERSION`,
  `R2_BUCKET_NAME`, `VM_INCIDENT_R2_PREFIX`, `VM_INCIDENT_RETENTION_DAYS` and `AI_GATEWAY_ID`
  with derived values (so those 6 checked-in values never ship and are out of scope), then spreads
  `getOptionalProcessEnvVars(...)`: any listed name with a non-empty GitHub Environment value is
  emitted verbatim. Removing a name from `wrangler.toml` therefore does NOT stop an override for it.
- `listEnvironmentVarOverrides(checkedIn, overrides)` only reports overrides of names present in
  `wrangler.toml`. Removing a var would silently drop its override from the deploy log / job
  summary (rule 70 signal) unless the comparison base includes the recorded code default.
- Precedent: commit `0e8dbc0f7` (2026-09-13, "fix: reduce eventing worker text bindings") removed
  76 default-valued vars from `wrangler.toml`; `wrangler.toml` already says "Keeping default values
  out of [vars] preserves Worker text-binding headroom."
- GitHub Environment overrides (2026-10-11): production 46 variables, staging 16, repo 1
  (`SONAR_CI_ENABLED`, unrelated). Several are not forwarded to the Worker at all
  (e.g. `CODEX_SETUP_TERMINAL_ENABLED`, `SANDBOX_PROBE_OUTPUT_MAX_CHARS`,
  `SANDBOX_SETUP_PROBE_TIMEOUT_MS`) — pre-existing, out of scope.
- `deploy-reusable.yml` passes optional vars to BOTH "Sync Wrangler Config" steps (initial sync
  and first-deploy tail re-sync); `scripts/quality/deploy-reusable-workflow.test.ts` enforces both.
  This change does not add or remove optional names, so the mapping is untouched.
- CI gap: the `deploy-scripts` job (which runs `scripts/quality/sync-wrangler-config.test.ts`,
  including the text-binding guard test) is path-filtered on `scripts/deploy/**` etc. but NOT on
  `apps/api/wrangler.toml`, so a `wrangler.toml`-only PR that crosses the guard is not caught
  before deploy.
- Tests that read shipped `[vars]` from `wrangler.toml`: `apps/api/tests/helpers/shipped-archive-budget.ts`,
  `archive-sweep-ceiling.ts`, `sweep-message-budget-shipped.test.ts`, `write-budget-*.test.ts`,
  `task-runner-do-infra.test.ts` (`DEFAULT_TASK_AGENT_TYPE`).
- Measurement (per-var read sites, code default, classification): see "Measurement" below.

## Measurement

(filled in from the per-var audit; counts go in the PR body)

## Design

1. Delete from `apps/api/wrangler.toml` `[vars]` every entry whose production behavior with the
   var absent is provably identical (every read site, including forwarding to cloud-init / the VM
   agent). Keep anything DIFFERS / REQUIRED / UNCERTAIN.
2. Record each removed name and its value in `scripts/deploy/worker-var-defaults.ts`
   (`OMITTED_WORKER_VAR_DEFAULTS`). The generator uses it only as the comparison base for the
   override report, so overrides of omitted vars stay visible in the deploy log and job summary.
3. CI proof:
   - apps/api unit test: for every omitted var, the real production resolver/parse path returns the
     same effective value with the var absent and with the recorded value (discriminating).
   - scripts/quality test: for staging and production inputs, every var's resolved value (emitted,
     else recorded default) is identical to shipping every recorded default; every GitHub
     Environment override still ships; the binding count drops; `wrangler.toml` may not re-add an
     omitted var with its default value.
4. Keep the 340 guard unchanged.

## Implementation Checklist

- [ ] Aggregate the per-var audit into a classification table (equal / differs / required / uncertain)
- [ ] Independently spot-check every EQUAL var with a flag, empty-string value, or multiple read sites
- [ ] Remove the EQUAL vars from `apps/api/wrangler.toml`; move any load-bearing comment next to the code default
- [ ] Add `scripts/deploy/worker-var-defaults.ts` with the recorded values
- [ ] Use it as the override-report comparison base in `getApiWorkerVars`
- [ ] apps/api behavioral proof test (absent == recorded value through the real resolver)
- [ ] scripts/quality staging/production effective-config test + ratchet
- [ ] Add `apps/api/wrangler.toml` (and the new module) to the `deploy-scripts` CI path filter
- [ ] Update tests that read removed vars from `wrangler.toml`
- [ ] Update `wrangler.toml` header comment, rule 07, env-reference skill, configuration docs
- [ ] Report new binding count (guard count and Cloudflare count) in the PR

## Acceptance Criteria

- [ ] Every removed var is proven equal to the code default by a CI test that calls production code
- [ ] For staging and production inputs, resolved values are identical before/after (CI test)
- [ ] Every GitHub Environment override still ships and is still reported when it differs from the default
- [ ] The 340 guard is unchanged; the generated staging/production count drops substantially
- [ ] Staging deploy: Worker settings binding count drops and sampled vars keep the same effective values
- [ ] Production deploy: `sam-api-prod` settings read back through the Cloudflare API, count reported
- [ ] env-reference skill and docs describe how vars are set (defaults in code; `[vars]` = non-defaults)

## References

- `scripts/deploy/sync-wrangler-config.ts`, `apps/api/wrangler.toml`, `.github/workflows/deploy-reusable.yml`
- `.claude/rules/07-env-and-urls.md`, `apps/api/.claude/rules/70-flag-flips-must-verify-the-deployed-value.md`
- Commit `0e8dbc0f7` (prior reduction), idea `01M47V0101CAM43ZNZN4JHB4AK` (kill switches)
