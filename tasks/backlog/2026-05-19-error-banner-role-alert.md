# Add role="alert" to error banner in project chat

## Problem

The glass-chrome error banner in `ProjectMessageView` (showing "Task failed: ...") does not have `role="alert"`, so screen readers won't automatically announce it when it renders. The existing resume-error banner at line ~164 of `index.tsx` correctly uses `role="alert"`, but the task-failure `ErrorBanner` component does not.

## Context

Discovered during UI/UX specialist review of PR #1056 (error banner glass-chrome styling). Filed as a follow-up since the PR was already merged.

## Implementation Checklist

- [ ] Add `role="alert"` to the `ErrorBanner` component in `apps/web/src/components/project-message-view/index.tsx`
- [ ] Add a unit test asserting the error banner has `role="alert"`

## Acceptance Criteria

- [ ] Error banner div has `role="alert"` attribute
- [ ] Screen readers announce the error message when it appears
- [ ] Unit test verifies the attribute is present
