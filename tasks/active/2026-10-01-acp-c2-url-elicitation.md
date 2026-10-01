# ACP C2 URL elicitation

## Problem

SAM currently advertises and handles ACP forms only. A remote MCP service that asks a pinned wrapper to open an HTTPS authorization URL cannot receive a durable creator decision in chat, and its independent completion notification has no authoritative Cloudflare record.

## Research

- The approved v2 plan is at idea `01M3P2E0JJNQRXX020P65ZRKEJ`; #2206 is the merged C1 base.
- Pinned `claude-agent-acp@0.81.2` forwards remote MCP URL requests and emits `elicitation/complete` after server-side `elicitation_complete`; its localhost OAuth startup is a distinct branch. Pinned `codex-acp@1.13.1` sends URL requests, tracks accepted IDs, and emits completion on `serverRequest/resolved`.
- `acp-go-sdk@v0.13.5` decodes URL requests and completion notifications, but loses optional scope fields. SessionHost prompt/generation is the authority.
- InteractionStore owns encrypted request/answer, idempotency, attention projection, expiry, and no-wake delivery. URL completion must be recorded independently from consent and delivery.
- ACP draft spec: https://github.com/agentclientprotocol/agent-client-protocol/blob/main/docs/rfds/elicitation.mdx

## Checklist

- [x] Add dormant URL-specific capability/start contract and conservative HTTPS request validation in Worker and Go.
- [x] Add encrypted URL detail and bounded creator decision with safe host display and explicit open gesture; reject loopback-dependent flows.
- [x] Record authenticated generation-fenced `elicitation/complete` independently, including early and duplicate notification races.
- [ ] Exercise pinned wrappers through deterministic externally completing HTTPS service fixtures; cover cancellation, reconnect, stale/no-waiter and privacy canaries.
- [x] Add real chat UI, desktop/mobile screenshots, and public docs with supported and unsupported behavior.
- [ ] Run Go/Worker/TS checks and local specialist reviews; send parent exact draft head and evidence, then wait for staging slot.

## Acceptance

Only a live bound creator can review and answer a bounded remote HTTPS URL request. The Worker remains the sole request/answer authority. Opening a URL means consent to navigate, not completed authentication. A matching wrapper completion is tracked independently and never resurrects a stale runtime. Full URL and human data remain encrypted and owner-only; generic state stays safe. The branch remains draft, dormant by default, unmerged, and undeployed to production.

## D auth diagnostics handoff

D should use static safe reason codes such as `model_credentials_missing`, `mcp_service_auth_required`, `url_callback_unsupported`, `interaction_expired`, and `runtime_interrupted`. Native model credentials link to existing credential settings or guided provider login; MCP endpoint authentication links to that service's settings and only a verified remote URL flow where available. Never put raw URLs, tokens, schema text, provider error bodies, or inferred credentials into events or diagnostics. A URL `accepted` receipt says the user consented to navigate; `urlCompletedAt` records the separate upstream completion notification and does not by itself assert that a provider account was authorized.

## UI audit

This is a component update in production chat. Considered (1) a modal, (2) a chat card with inline full URL, and (3) a chat card with safe host and owner-only detail loading. Chose (3) to keep the decision in conversation and hide URL query secrets until the creator opens the link. The long request collapses after 240 characters so mobile actions remain visible; this was fixed after the first screenshot pass. Final Playwright capture covers 30 history messages, Unicode/HTML-like text, owner and noncreator states, completion, uncertain receipt retry, and 320px overflow. Rubric: hierarchy 4/5, clarity 4/5, mobile 4/5, accessibility 4/5, consistency 5/5. A screenshot of the mobile card still shows the chat's existing sticky header above it, but the action controls remain visible and operable. Evidence is in `docs/notes/acp-c2-screenshots/`.

Parent review also found an asynchronous decision race. The card now checks current creator authority, interaction state, deadline, and identity after the digest resolves; Playwright holds the digest while the request settles or access is revoked, then verifies no answer is sent. The URL rollout flag and deadline are forwarded through both deployment workflow config-sync passes, with a workflow regression that checks override propagation and the false checked-in default.

The mobile audit now includes a top-of-card capture showing title, status, deadline, and request, plus a scrolled-action capture showing the destination and buttons. The long card is vertically scrollable within the existing chat; both parts are reachable. The Go URL registry retains bounded generation-lifetime ID tombstones, so a late duplicate completion cannot bind a reused ID. A shared JSON URL corpus is run by Go and TypeScript. URL length, elicitation-ID length, and explicit redirect depth are lower-only configurable limits, forwarded through the deployment workflow and public configuration docs.

## Verification boundary

Layer tests currently exercise installed Claude URL forwarding and external HTTPS completion, pinned Codex URL/completion source checks, the pinned Go SDK wire through SessionHost, Cloudflare InteractionStore and callback handling, and production chat under Playwright. They do not yet form one live wrapper → Go → Worker → browser test. The published Codex CLI is not executed against an external service. Keep URL capability dormant and do not advertise verified runtime support until that gap is closed or the parent explicitly narrows the acceptance gate.

A disposable external HTTPS MCP service is prepared at `tests/fixtures/acp-c2-remote-service.mjs`, with an operational staging and cleanup plan beside it. `pnpm test:acp-c2-remote-service` passes against a real MCP SDK client, including service completion before answer, duplicate/replay notifications, and MCP endpoint authorization. This is fixture readiness only; the staged pinned-wrapper/VM/Worker/browser gate remains outstanding and no staging resources have been changed.
