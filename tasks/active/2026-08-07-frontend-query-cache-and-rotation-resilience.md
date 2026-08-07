# Frontend Query Cache and Rotation Resilience

## Problem

The authenticated control-plane UI feels slow because responsive transitions and route navigation often restart component-local fetches instead of reusing already-loaded data. The clearest production symptom is phone rotation: rotating a 390×844 phone to 844×390 crosses the app's 767px breakpoint and can unmount the routed page subtree, destroying local state and triggering fresh loaders.

The current production deployment (`71e97323ee499743df099aa5cdca9867e5a87b30`) matches the audited `main` commit, so this is present in the live code rather than only a local hypothesis.

## Research Findings

### Dispatched SOL research

- `01KZF578YJ1JG4APXDA4J29EYX`: confirmed that `apps/web/src/components/AppShell.tsx` swaps structurally different mobile and desktop sibling trees. The routed `<main>` occupies different reconciliation positions, so a breakpoint transition discards the page/chat subtree while the root QueryClient and AuthProvider remain mounted.
- `01KZF57GTQW3Q6RW3JPP47QRM2`: recommended shared in-memory TanStack Query caching and intent prefetch first. Persisting the entire QueryClient is unsafe; any browser persistence must be a per-user allowlist with logout/account-switch cleanup, version busting, and sensitive-data exclusions.
- `01KZF57MDCMN7KT94MFSDEF5C5`: recommended converging destination reads on shared query keys before prefetching, then using bounded hover/focus/touch intent prefetch. Recommended a delayed decorative top-edge indicator for background refetches only.

The original Instant dispatches (`01KZF559Y5BF6D5900W4RFP04C`, `01KZF55E37QM2Z8NMPD63PVQF1`, `01KZF55HMGDQKRW5EVB2QW9A4Z`) failed before agent startup because SAM attempted to clone unpushed generated branches. Corrected retries explicitly checked out remote `main`.

### Local code evidence

- `apps/web/src/components/AppShell.tsx` branches on `useIsMobile()`. The mobile routed `<main>` is the third root child; the desktop routed `<main>` follows the sidebar. Without stable sibling identity, React unmounts it when crossing the breakpoint.
- `apps/web/src/hooks/useProjectData.ts` uses component-local `useState`/`useEffect` loaders. `AppShell`, `Dashboard`, and `Projects` mount independent `useProjectList({ limit: 50 })` instances, causing duplicate requests and independent polling for the same data.
- `apps/web/src/pages/Project.tsx` hand-loads project detail and blocks the child outlet on the first request. A project-card prefetch would not help until the destination reads the same shared cache key.
- TanStack Query v5.101.2 is already configured in `apps/web/src/lib/query-client.ts`, but only Nodes, Workspaces, and AdminDiagnosis currently use it.
- `tasks/archive/2026-08-05-namespace-library-cache-by-user.md` documents a real cross-user metadata leak from un-namespaced `localStorage`. Generic persisted query caching must not repeat that failure.
- The service worker caches the app shell and static assets, not authenticated API responses, so it does not provide data reuse across remounts.

### Official documentation

- TanStack Query prefetching: https://tanstack.com/query/latest/docs/framework/react/guides/prefetching
- TanStack Query `useQuery` cache lifetime: https://tanstack.com/query/latest/docs/framework/react/reference/useQuery
- TanStack Query persistence and cache busting: https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient

## UI Variants Considered

1. **Delayed top-edge activity line** — global, layout-neutral, visible on mobile and desktop, and does not compete with page content.
2. **Compact “Refreshing” chrome pill** — clearer text but consumes scarce mobile-header space and can become noisy during polling.
3. **Per-section spinners only** — precise but inconsistent across pages and cannot cover shared prefetch/background work.

Selected: variant 1, with a screen-reader status message. Existing local spinners remain where they already add useful section-level context.

## Selected First PR

This PR deliberately combines the direct rotation fix with the smallest cache/prefetch slice that has cross-UI leverage:

- Preserve routed content identity across AppShell mobile/desktop breakpoint transitions.
- Move project list and project detail reads onto shared TanStack Query option/key factories.
- Deduplicate the project list used by AppShell, Dashboard, and Projects.
- Prefetch project detail on hover, keyboard focus, and touch intent from project cards and sidebar entries.
- Keep stale project data visible during background revalidation.
- Show a delayed, unobtrusive global indicator only when cached query data is being refreshed.
- Clear the in-memory query cache on clean auth identity transitions.
- Capture broader query migration and safe persistence as explicit follow-up work.

## Implementation Checklist

- [x] Add a failing AppShell regression test proving breakpoint changes preserve child mount/state.
- [x] Give the shared routed `<main>` stable identity across the mobile and desktop shell branches.
- [x] Add shared project list/detail/GitHub-installation query keys and query options.
- [x] Migrate `useProjectList` and `useProjectDetail` to TanStack Query while preserving their public hook contracts.
- [x] Migrate the `Project` parent to cached detail/installation data and keep the outlet visible on background errors/refetches.
- [x] Add bounded project-detail intent prefetch from project cards and sidebar project buttons.
- [x] Add a delayed global background-fetch indicator above AppShell.
- [x] Clear query data on clean signout/session-expiry/account-switch transitions, not transient auth refetch errors.
- [x] Add unit tests for deduplication, cache reuse, stale-data preservation, auth cleanup, indicator behavior, and intent prefetch.
- [x] Add Playwright coverage for portrait→landscape rotation, request counts, indicator rendering, overflow, and mobile/desktop screenshots.
- [x] Update Rule 48 with the responsive-shell identity requirement.
- [ ] Run full validation, specialist reviews, staging verification, and create a draft PR without merging.

## Acceptance Criteria

- Rotating across 767px does not remount the routed page/chat subtree or discard its local state.
- AppShell plus Dashboard/Projects issue one initial project-list request for the shared key, not duplicate requests.
- Re-entering a recently loaded project/list surface renders cached data immediately; stale data remains visible while revalidation runs.
- Hover/focus/touch intent on a project destination populates the exact query key consumed by `Project`.
- Background revalidation shows a subtle top-edge activity cue without replacing visible content or changing layout.
- Clean auth identity changes clear query data; transient auth refetch errors preserve it.
- No generic QueryClient data is written to `localStorage` or `sessionStorage` in this PR.
- Mobile and desktop visual/behavioral checks pass with no horizontal overflow.

## Out of Scope

- Migrating every remaining hand-rolled loader in one PR.
- Persisting authenticated query data across full document reloads.
- Prefetching chat histories, messages, logs, diagnostics, credentials, secrets, environment values, or large file/library payloads.
