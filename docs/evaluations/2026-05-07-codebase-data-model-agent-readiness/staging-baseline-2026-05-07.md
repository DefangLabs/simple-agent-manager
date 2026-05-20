# Staging Baseline Snapshot — 2026-05-07

Captured: **2026-05-07T05:18Z – 05:20Z UTC**

This document records the Cloudflare staging infrastructure state before any evaluation-driven implementation work begins. It serves as the compatibility and rollback reference for D1 schema changes, Durable Object migrations, KV/R2 usage, and deployment pipeline health.

All queries used `$CF_TOKEN` (read-only) against the Cloudflare API. No mutations were performed.

---

## 1. Deployed Workers

| Worker | Last Modified (UTC) | Created (UTC) |
| --- | --- | --- |
| `sam-api-staging` | 2026-05-06T12:38:04Z | 2026-03-01T18:31:28Z |
| `sam-tail-worker-staging` | 2026-05-06T12:38:10Z | 2026-03-01T18:31:43Z |

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/workers/scripts" \
  | jq '[.result[] | {id, created_on, modified_on}]'
```

### Routes / DNS

| Record | Type | Target |
| --- | --- | --- |
| `api.sammy.party` | CNAME | `sam-api-staging.workers.dev` |
| `app.sammy.party` | CNAME | `sam-web-staging.pages.dev` |
| `*.sammy.party` | CNAME | `sam-api-staging.workers.dev` |
| `<node-id>.vm.sammy.party` | A | `46.225.80.xxx` (1 active node) |

User-managed DNS records in zone `sammy.party`: **4** (excludes NS/SOA system records)

### Cron Triggers (from `wrangler.toml`)

```
*/5 * * * *   — provisioning timeout, warm node cleanup, stuck tasks, trial expiry
0 3 * * *     — analytics forwarding
0 4 * * *     — trial waitlist purge
0 5 1 * *     — trial counter rollover audit
```

---

## 2. D1 Databases

### 2a. Main Database (`sam-staging`)

| Property | Value |
| --- | --- |
| UUID | `1cfaf5d4-8226-47d8-bf26-6ba727ce5718` |
| File size | ~2.1 MB |
| Created | 2026-03-01 |

#### Migration Level

Latest applied: **`0048_missions.sql`** (applied 2026-04-26T09:42:07Z)

This matches the latest migration file on `main`. No pending migrations.

```bash
curl -s -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM d1_migrations ORDER BY id DESC LIMIT 5"}' \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/d1/database/1cfaf5d4-8226-47d8-bf26-6ba727ce5718/query"
```

Last 5 migrations applied:

| ID | Name | Applied At |
| --- | --- | --- |
| 57 | `0048_missions.sql` | 2026-04-26 09:42:07 |
| 56 | `0047_artifacts_repo_provider.sql` | 2026-04-25 11:41:29 |
| 55 | `0046_trial_projects_unique_index_exclude_sentinel.sql` | 2026-04-19 21:21:57 |
| 54 | `0045_trial_sentinel_installation.sql` | 2026-04-19 10:25:36 |
| 53 | `0044_trials_table.sql` | 2026-04-18 21:25:48 |

#### Tables (41 total)

<details>
<summary>Full table list</summary>

`_cf_KV`, `accounts`, `agent_instruction_sets`, `agent_profiles`, `agent_sessions`, `agent_settings`, `compliance_checklists`, `compliance_runs`, `component_definitions`, `compute_usage`, `credentials`, `d1_migrations`, `default_quotas`, `exception_requests`, `github_installations`, `migration_work_items`, `missions`, `nodes`, `platform_credentials`, `project_deployment_credentials`, `project_file_tags`, `project_files`, `project_runtime_env_vars`, `project_runtime_files`, `projects`, `sessions`, `smoke_test_tokens`, `sqlite_sequence`, `task_dependencies`, `task_status_events`, `tasks`, `theme_tokens`, `trial_waitlist`, `trials`, `trigger_executions`, `triggers`, `ui_standards`, `user_quotas`, `users`, `verifications`, `workspaces`
</details>

#### Row Counts (key tables)

| Table | Count |
| --- | --- |
| `users` | 4 |
| `projects` | 23 |
| `tasks` | 8 |
| `nodes` | 32 |
| `workspaces` | 50 |
| `credentials` | 3 |
| `github_installations` | 4 |
| `triggers` | 0 |
| `agent_profiles` | 12 |
| `missions` | 0 |
| `sessions` | 3,629 |

#### Data Shape — Status Distributions

**Nodes** (32 total):
| Status | Count |
| --- | --- |
| `deleted` | 31 |
| `running` | 1 |

**Workspaces** (50 total):
| Status | Count |
| --- | --- |
| `deleted` | 49 |
| `error` | 1 |

**Tasks** (8 total):
| Status | Count |
| --- | --- |
| `completed` | 6 |
| `failed` | 2 |

#### Projects Table Schema (35 columns)

<details>
<summary>Full schema</summary>

| Column | Type | NOT NULL | Default |
| --- | --- | --- | --- |
| `id` | TEXT | No | — |
| `user_id` | TEXT | Yes | — |
| `name` | TEXT | Yes | — |
| `normalized_name` | TEXT | Yes | — |
| `description` | TEXT | No | — |
| `installation_id` | TEXT | No* | — |
| `repository` | TEXT | Yes | — |
| `default_branch` | TEXT | Yes | `'main'` |
| `github_repo_id` | INTEGER | No | — |
| `github_repo_node_id` | TEXT | No | — |
| `default_vm_size` | TEXT | No | — |
| `default_agent_type` | TEXT | No | — |
| `default_workspace_profile` | TEXT | No | — |
| `default_devcontainer_config_name` | TEXT | No | — |
| `default_provider` | TEXT | No | — |
| `default_location` | TEXT | No | — |
| `agent_defaults` | TEXT | No | — |
| `workspace_idle_timeout_ms` | INTEGER | No | — |
| `node_idle_timeout_ms` | INTEGER | No | — |
| `task_execution_timeout_ms` | INTEGER | No | — |
| `max_concurrent_tasks` | INTEGER | No | — |
| `max_dispatch_depth` | INTEGER | No | — |
| `max_sub_tasks_per_task` | INTEGER | No | — |
| `warm_node_timeout_ms` | INTEGER | No | — |
| `max_workspaces_per_node` | INTEGER | No | — |
| `node_cpu_threshold_percent` | INTEGER | No | — |
| `node_memory_threshold_percent` | INTEGER | No | — |
| `status` | TEXT | Yes | `'active'` |
| `last_activity_at` | TEXT | No | — |
| `active_session_count` | INTEGER | Yes | `0` |
| `created_by` | TEXT | Yes | — |
| `created_at` | TEXT | Yes | `CURRENT_TIMESTAMP` |
| `updated_at` | TEXT | Yes | `CURRENT_TIMESTAMP` |
| `repo_provider` | TEXT | Yes | `'github'` |
| `artifacts_repo_id` | TEXT | No | — |

\* `installation_id` reports as nullable from `PRAGMA table_info()` on the live DB, but `schema.ts` declares it `.notNull()` with a FK to `github_installations`. Migration 0047 explicitly preserves NOT NULL. The discrepancy is a SQLite DDL reflection artifact — treat this column as NOT NULL for compatibility planning.

**Note**: Column order reflects `PRAGMA table_info()` output. `repo_provider` and `artifacts_repo_id` appear last because they were added via `ALTER TABLE ADD COLUMN` (migration 0047), not in the original `CREATE TABLE`.
</details>

### 2b. Observability Database (`sam-observability-staging`)

| Property | Value |
| --- | --- |
| UUID | `8c2fa46c-3b89-428b-b235-d835b7914106` |
| File size | ~2.3 MB |
| Tables | `_cf_KV`, `d1_migrations`, `platform_errors`, `sqlite_sequence` |
| Total errors | 4,378 |

**Recent errors** (last 5, all identical):
```
source: api
level:  warn
message: "Orphaned node detected: running with no workspaces and not in warm pool"
```

These repeat every ~5 minutes (cron interval). **Pre-existing issue**: 1 running node with 0 workspaces is being flagged as orphaned by the cron sweep but not cleaned up automatically.

---

## 3. Durable Object Bindings & Migrations

From `apps/api/wrangler.toml` (checked into repo). These are top-level bindings; deploy-time `sync-wrangler-config.ts` copies them into the generated `[env.staging]` section.

| Binding Name | Class | Migration Tag | Storage |
| --- | --- | --- | --- |
| `PROJECT_DATA` | `ProjectData` | v1 | SQLite |
| `NODE_LIFECYCLE` | `NodeLifecycle` | v2 | Stateless |
| `ADMIN_LOGS` | `AdminLogs` | v3 | Stateless |
| `TASK_RUNNER` | `TaskRunner` | v4 | Stateless |
| `NOTIFICATION` | `NotificationService` | v5 | SQLite |
| `CODEX_REFRESH_LOCK` | `CodexRefreshLock` | v6 | Stateless |
| `TRIAL_COUNTER` | `TrialCounter` | v7 | SQLite |
| `TRIAL_EVENT_BUS` | `TrialEventBus` | v8 | In-memory |
| `TRIAL_ORCHESTRATOR` | `TrialOrchestrator` | v9 | SQLite |
| `PROJECT_ORCHESTRATOR` | `ProjectOrchestrator` | v10 | SQLite |
| `SAM_SESSION` | `SamSession` | v11 | SQLite |
| `PROJECT_AGENT` | `ProjectAgent` | v12 | SQLite |
| `SANDBOX` | `SandboxDO` | v13 | SQLite (Container) |

**Note**: DO internal SQLite migrations (per-instance) are managed within each DO class, not via D1. ProjectData has the most complex internal schema (19 migrations, 001-initial-schema through 019-project-policies).

### Container Binding

```toml
[[containers]]
class_name = "SandboxDO"
image = "./Dockerfile.sandbox"
instance_type = "basic"
max_instances = 3
```

---

## 4. KV Namespaces

| Namespace | ID |
| --- | --- |
| `sam-staging-sessions` | `cbeb633bc3794dd88a0b488d46a1922d` |

**Key count**: 2
**Key prefixes**: `platform`, `trials`

KV is used for: session tokens, rate limiting, feature flags, AI budget settings, trial state. The low key count (2) suggests most ephemeral state has expired or been cleaned up.

---

## 5. R2 Buckets

| Bucket | Created |
| --- | --- |
| `sam-pulumi-state` | 2026-03-01 |
| `sam-staging-assets` | 2026-03-01 |

### `sam-staging-assets` Contents (sample)

| Key | Size | Last Modified |
| --- | --- | --- |
| `agents/vm-agent-linux-amd64` | 13.5 MB | 2026-05-06T12:42Z |
| `agents/vm-agent-linux-arm64` | 12.6 MB | 2026-05-06T12:42Z |
| `experiments/harness-linux-amd64` | 6.1 MB | 2026-05-03T11:29Z |
| `library/<project-id>/<file-id>` (encrypted) | varies | various |

VM agent binaries were last updated during the most recent staging deploy (2026-05-06).

---

## 6. Deployment Pipeline Health

### Staging Deploys (last 5)

| Branch | Status | Date (UTC) |
| --- | --- | --- |
| `sam/compact-mode-lazy-load-tool-content` | success | 2026-05-06T12:34Z |
| `sam/stopped-workspace-auto-delete` | success | 2026-05-06T04:11Z |
| `sam/keep-running-errors-where-01kqxn` | success | 2026-05-06T04:03Z |
| `sam/use-skill-continue-sam-01kqx7` | success | 2026-05-06T02:26Z |
| `sam/use-sam-mcp-tools-01kqx2` | success | 2026-05-05T23:01Z |

All 5 most recent staging deploys succeeded. Pipeline is healthy.

### Production Deploys (last 5)

| Status | Date (UTC) |
| --- | --- |
| success | 2026-05-07T05:02Z |
| skipped | 2026-05-07T04:55Z |
| skipped | 2026-05-07T04:49Z |
| skipped | 2026-05-07T04:44Z |
| skipped | 2026-05-07T04:08Z |

The most recent production deploy succeeded. The "skipped" entries are from commits that didn't trigger a deploy (likely docs/task-only PRs with skip conditions).

### CI (last 5)

| Title | Status | Date (UTC) |
| --- | --- | --- |
| Add deep codebase evaluation reports (#922) | success | 2026-05-07T04:57Z |
| Add deep codebase evaluation reports | success | 2026-05-07T04:51Z |
| Add deep codebase evaluation reports | failure | 2026-05-07T04:39Z |
| Deep codebase evaluation... | failure | 2026-05-07T04:03Z |
| Deep codebase evaluation... | cancelled | 2026-05-07T04:03Z |

CI is green on the most recent merge to main. Earlier failures were during the evaluation report integration (resolved).

---

## 7. App / API Health

| Endpoint | Status | Response |
| --- | --- | --- |
| `https://api.sammy.party/health` | 200 | `{"status":"healthy","timestamp":"2026-05-07T05:19:01.636Z"}` |
| `https://app.sammy.party` | 200 | HTML page loads |

Both staging surfaces are healthy and responding.

---

## 8. Pre-Existing Issues

### 8a. Orphaned Running Node

One node remains in `running` status with zero associated workspaces. The cron sweep detects it every 5 minutes and logs a warning to the observability DB but does not destroy it. This is generating persistent low-priority noise (the most recent 5 errors in `platform_errors` are all this warning).

**Impact on evaluation work**: Low. This is a data cleanup issue, not a pipeline or schema issue. If Wave 1 work touches node lifecycle, this orphan may be cleaned up incidentally.

### 8b. One Workspace in Error State

One workspace is in `error` status (out of 50 total, 49 deleted). This is likely a stale record from a failed provisioning attempt.

**Impact on evaluation work**: None. Does not affect schema changes or deployments.

### 8c. Observability DB Error Volume

4,378 errors in the observability database, primarily the orphaned node warning repeating every 5 minutes. At ~288 entries/day, this will continue growing. Not blocking for evaluation work but worth noting for the performance/cost track.

### 8d. Staging Last Deployed from Feature Branch

The most recent staging deploy was from `sam/compact-mode-lazy-load-tool-content` (2026-05-06T12:34Z), not from `main`. Staging may have code that diverges slightly from the current `main` HEAD. Before any evaluation implementation deploys, consider deploying from `main` first to establish a clean baseline.

---

## 9. Compatibility Notes for Evaluation Implementation

### D1 Schema Changes

- Current migration level: `0048_missions.sql` (id 57)
- New migrations should use prefix `0049_` and follow `ALTER TABLE ADD COLUMN` pattern (never `DROP TABLE` on FK parents per rule 31)
- The CASCADE map should be checked before any table modifications: `pnpm quality:migration-safety`

### Durable Object Migrations

- Current: v13 (SandboxDO)
- New DO classes require a new `[[migrations]]` tag entry in `wrangler.toml`
- Existing DO internal SQLite migrations are incremental (ALTER TABLE ADD COLUMN pattern)

### KV

- Only 2 keys present; KV is used ephemerally. No compatibility concerns for evaluation work.

### R2

- VM agent binaries refreshed on each staging deploy. Library files are encrypted and project-scoped. No compatibility concerns unless R2 bucket structure changes.

### Deployment

- Pipeline is healthy (5/5 recent staging deploys succeeded)
- Deploy from `main` first before any evaluation branch deploys to sync staging with production

---

## Appendix: Command Reference

All commands use `$CF_TOKEN` and `$CF_ACCOUNT_ID` environment variables.

```bash
# Account ID
CF_ACCOUNT_ID=c4e4aebd980b626f6af43ac6b1edcede

# D1 main database
D1_MAIN_ID=1cfaf5d4-8226-47d8-bf26-6ba727ce5718

# D1 observability database
D1_OBS_ID=8c2fa46c-3b89-428b-b235-d835b7914106

# KV namespace
KV_ID=cbeb633bc3794dd88a0b488d46a1922d

# Zone (sammy.party)
ZONE_ID=ff189eb6d934a6c2b3f9f9595cafc256
```

See `.claude/rules/32-cf-api-debugging.md` for the full copy-paste cheat sheet.
