# Reliability A: remove platform publication, preserve snapshots

## Problem
Successful agent turns automatically stage all files, commit, push and create review requests. Publication must remain agent-directed while independent sleep snapshots preserve work.

## Research
- Shared VM/Instant callback in `internal/server/server.go` is the sole production caller of `gitPushWorkspaceChanges`.
- `agent_ws.go` wires contextual completion for both harnesses; `workspaces.go` terminal prompts use that same callback.
- Standalone/container snapshot WIP paths use temporary GIT_INDEX_FILE and commit-tree; preserve these.
- Coordinator owns consolidated staging and merge. Use assigned snapshot-supported root branch rather than unpreserved sibling worktree. Task kept on assigned branch to avoid independent main mutation during coordinated release.

## Checklist
- [ ] Audit VM/Instant, both harnesses and actual completion.
- [ ] Remove automatic staging/commits/push/review creation.
- [ ] Preserve explicit git/PR tools and completion reporting.
- [ ] Test dirty/staged/workflow/local-commit preservation and absence of publication.
- [ ] Update docs, run checks and independent local reviews.
- [ ] Draft PR and consolidated staging plan/evidence handoff.

## Acceptance
Turn end and actual completion never publish. Snapshot-supported workspace paths preserve tracked/untracked/staged/workflow files and local commits across capture/restore. No claim of sibling worktree preservation. Agent-directed git and complete_task evidence remain available.
