# Keep chat session lists ordered by real conversation activity

## Problem

Old project chats can jump to the top of the session list when lifecycle or retention work updates the session's `updated_at`, even though no new conversation activity occurred. This makes stale tasks and sessions look current and can affect which sessions users see first.

## Research findings

- Earlier research tasks `01M2W7SE12S74DPHT1E5VW8SSJ` and `01M2X10Y8QSJSXP7SDZ4JCCJEP` identified snapshot-expiry terminalization as a source of synthetic `updated_at` bumps. Both tasks failed without creating a PR; neither fix shipped.
- Production D1, queried 2026-10-04: among sessions updated in the prior 14 days, there were 200 stopped sessions; 159 have `updated_at` more than two days later than `last_message_at`, and 154 are within one hour of a seven-day gap. This is consistent with snapshot TTL terminalization.
- `session_summaries` already has `last_message_at`, populated from compact-archive metadata or the latest message timestamp. The per-project D1 index still orders by `updated_at DESC` and maps `lastMessageAt` from `updated_at`.
- The authoritative ProjectData list is also sorted/mapped using `updated_at`; the response may come from the D1 accelerator or fall back to this DO path. Both paths and cross-project recent lists must preserve equivalent ordering and cursor/page behavior.
- User messages currently update frontend `lastMessageAt` optimistically; refetch and live updates must continue to move a session after genuine conversation activity. Sessions with no messages need a stable creation/start timestamp fallback.
- Historical D1 `last_message_at` values already provide the real activity timestamp. Prefer changing read semantics over rewriting existing rows.

## Implementation checklist

- [ ] Trace every project and cross-project session-list query, cursor/page ordering, sort key and row mapper; ensure D1 index and DO fallback are equivalent.
- [ ] Use the newest real conversation message timestamp as the primary rank, with a stable creation/start fallback for sessions without messages; keep deterministic tie-breaking.
- [ ] Preserve actual new-message ordering across D1 sync, WebSocket/refetch and optimistic UI merge paths.
- [ ] Add focused regressions for lifecycle timestamp bumps, archived-message timestamp use, empty sessions, stable pagination, and genuine new messages.
- [ ] Run relevant API tests and the full required checks, complete specialist reviews, deploy to unoccupied staging and verify list behavior end-to-end.
- [ ] Open the PR with specialist and CodeRabbit evidence, resolve review/CI findings, merge, and verify the production deploy.

## Acceptance criteria

- Stopping or expiring an old sleeping session does not move it ahead of a session with more recent actual conversation activity.
- A newly persisted user/assistant conversation message moves its session to the top as expected.
- D1-index and ProjectData fallback results return the same ordering and do not skip/repeat sessions across pages.
- Empty sessions keep a stable order based on creation/start time.
- No data rewrite is needed to correct existing stale rows.

## References

- `apps/api/src/services/session-summary-index.ts`
- `apps/api/src/durable-objects/project-data/session-summary-sync.ts`
- `apps/api/src/durable-objects/project-data/sessions.ts`
- `apps/web/src/pages/project-chat/useProjectChatState.ts`
- `.claude/rules/17-ui-visual-testing.md`
- `.claude/rules/25-review-merge-gate.md`
