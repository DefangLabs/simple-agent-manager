# Reliability A: remove platform publication, preserve snapshots

## Problem

Successful agent turns automatically stage all files, commit, push and create review requests. Publication must remain agent-directed while independent sleep snapshots preserve work.

## Research

- Shared VM/Instant callback in `internal/server/server.go` is the sole production caller of `gitPushWorkspaceChanges`.
- `agent_ws.go` wires contextual completion for both harnesses; `workspaces.go` terminal prompts use that same callback.
- Standalone/container snapshot WIP paths use temporary GIT_INDEX_FILE and commit-tree; preserve these.
- Coordinator owns consolidated staging and merge. Use assigned snapshot-supported root branch rather than unpreserved sibling worktree. Task kept on assigned branch to avoid independent main mutation during coordinated release.

## Checklist

- [x] Static audit VM/Instant, both harnesses and actual completion.
- [x] Remove automatic staging/commits/push/review creation.
- [x] Preserve explicit git/PR tools and completion reporting.
- [x] Unit test dirty/staged/workflow/local-commit preservation and absence of publication.
- [ ] Update docs, run checks and independent local reviews.
- [ ] Draft PR and consolidated staging plan/evidence handoff.

## Acceptance

Turn end and actual completion never publish. Snapshot-supported workspace paths preserve tracked/untracked/staged/workflow files and local commits across capture/restore. No claim of sibling worktree preservation. Agent-directed git and complete_task evidence remain available.

## Evidence and remaining runtime proof

- Implementation pushed: 99c8ca22a. Shared `agent_ws.go:getOrCreateSessionHost` binds both callbacks independently of agent type; ACP `session_host_attempt.go` delivers completion for Claude Code and Codex. `workspaces.go:startAgentWithPrompt` uses the same callback. No alternate publication caller remains.
- Actual terminal `apps/api/src/routes/mcp/task-tools.ts` preserves supplied summary/PR/evidence and calls `cleanupTerminalTaskResources`; `services/task-terminal-cleanup.ts` tears down runtime without Git publication. These interfaces are unchanged.
- Targeted callback/cold-wake/WIP tests pass. Independent reviewer confirmed snapshot tests preserve local commits, dirty/untracked files, staged and unstaged content, and workflow files through both standalone/container implementations.
- Direct callback repository mutation proof is standalone; workspace-role callback rejects publication errors but does not execute Docker. Harness wiring/actual terminal paths are statically audited, not yet live-proven.
- Independent local Go/test/completion review: no production defect; stale docs corrected; constitution check and diff whitespace pass. Reviewer review_a.
- Coordinator runtime sweep remains REQUIRED: pin candidate across VM/Instant and Claude/Codex; create local unpushed commit plus staged/unstaged and workflow files; record HEAD/index/status/remote refs/PRs before turn end and complete_task, assert no publication; sleep/wake supported root, compare all content and staged state. Verify VM heartbeat and workspace/terminal access; clean up immediately. Do not claim arbitrary sibling-worktree recovery.
- Keep task active and PR draft pending coordinated runtime evidence. No independent deployment or merge.

## A release ownership transfer — 2026-10-16

Raphaël transfers sole release execution to Sol task `01M5344FTRACH9093B26A3M56C`, through normal production deployment. This supersedes the historical coordinator/draft-only restrictions above; original A remains sleeping and relinquished. Release target is existing PR2363, not an accidental autosave PR. Preserve original WIP and evidence.

Production main `8778abe1ce6cc003eb0f50428ede5c2b6a9a6093` was normally merged into PR2363 at `b5394835c`; B2358 and incident2368 remain intact. The unrelated speech factory refactor was restored exactly to main. Documentation preserves upstream Instant branch exceptions for attachments, Execute and explicit resource overrides.

- [x] Documentation complete and source checks/reviews recovered from PR2355.
- [x] Fresh integrated local Go/security reviews: `A2363-GO-20261016-01`, `A2363-SEC-20261016-01` PASS. Completion/docs/constitution `A_completion_20261016` findings addressed.
- [x] Go1.26.6 targeted completion/callback/cold-wake/WIP/snapshot selection PASS (10.255s), server vet and all-package build PASS.
- [x] Affected API callback suite 8 tests PASS, affected ESLint PASS, API typecheck PASS; www build 242 pages PASS; runtime-state check PASS. Initial API invocation failed before tests because shared package was not built; standard dependency build resolved it.
- [ ] Final current-head CI/Sonar/security and trusted CodeRabbit ready-state request/wait.
- [ ] Explicit shared staging slot after PR2305 → PR2304, final deployment and bounded missing A runtime proof.
- [ ] Merge, canonical automatic production deploy, live SHA/version/health and actual normal agent rollout.

Historical original receipts recovered from channel `reliability.2026-10-15`, sequences 141–155 and later source reviews: Instant Codex original preparation/turn/sleep-wake/actual completion and same-context postterminal remote refs/PR inventory covered; independent artifact provenance review is not independent runtime execution. Failed attempts and deadline misses remain failures. Claude VM WIP recovery and initial actual complete_task covered; its composite independent publication observer FAILED. Later supplement MCP download failed before probe, cause unknown. Codex VM coverage not done. None of these gaps is upgraded to PASS by source/unit checks.

Smallest remaining live plan: one fresh configured-pool VM Codex fixture, actual turn/completion nonpublication and supported local commit/staged/unstaged/untracked/workflow snapshot recovery, with retained original receipts before Sleep and independent observer in the already retained Instant context. Max one staging VM, no sizing/pool/security overrides. Finite 45-minute action/export window plus normal cleanup tail; refresh capacity and catalogue before admission. Prior catalogue two-rounded-hour compute estimate EUR0.0176–0.0512, excluding IP/tax/Instant/storage/provider delays. Do not expand into another matrix or destroy preserved fixtures. C activation remains separate.
