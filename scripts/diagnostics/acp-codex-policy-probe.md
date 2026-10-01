# ACP Codex policy probe (PR #2210)

This local probe uses the **exact pinned `codex-cli 0.156.1` binary**. It starts an isolated app-server, an in-process MCP fixture, and a synthetic Responses API. It sends no request to a real model or Cloudflare. Output contains only versions, policy enums, method names, presence/absence fields, and outcomes. Canary assertions forbid URL and token values in the output.

Run with `CODEX_BIN` pointing to the pinned executable:

```sh
CODEX_BIN=/path/to/codex node scripts/diagnostics/acp-codex-policy-probe.mjs
CODEX_BIN=/path/to/codex PROBE_TOOL=command node scripts/diagnostics/acp-codex-policy-probe.mjs
CODEX_BIN=/path/to/codex PROBE_POLICY=granular node scripts/diagnostics/acp-codex-policy-probe.mjs
```

Observed on 2026-10-01:

| Policy                                 | Probe            | App-server result                                                                      | MCP fixture result                    |
| -------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- | ------------------------------------- |
| `never`, danger-full-access            | ordinary command | no approval request; command output returned to model                                  | none                                  |
| `never`, danger-full-access            | URL MCP tool     | no elicitation request                                                                 | requested, then declined              |
| granular, only `mcp_elicitations=true` | URL MCP tool     | first a tool-approval **form**, then URL elicitation after the probe accepts that form | requested, then declined by the probe |

The granular policy preserves the tested ordinary command, but adds a tool-approval form ahead of this MCP URL tool. It is therefore **not** a drop-in replacement for SAM's current `never` policy while forms are disabled.

The current SAM configuration selects `INITIAL_AGENT_MODE=agent-full-access` in `packages/vm-agent/internal/acp/session_host_startup.go` and `approval_policy="never"` in `codex_config.go`. The pinned `codex-acp` maps that mode to a `turn/start` request with `approvalPolicy=never`. The real pinned Codex CLI read-back confirms `never` and `dangerFullAccess`. At [`codex-rs/codex-mcp/src/elicitation.rs` on `rust-v0.156.1`](https://github.com/openai/codex/blob/rust-v0.156.1/codex-rs/codex-mcp/src/elicitation.rs), `elicitation_is_rejected_by_policy(Never)` returns true before `router.request_user_interaction`. This reproduces the live fixture's immediate `declined` outcome before a Cloudflare receipt.

## Reviewable compatible-path diff proposal

A pinned CLI backport plus a matching pinned adapter patch is the narrow option. Draft source diffs are [Codex CLI 0.156.1](patches/codex-cli-rust-v0.156.1-explicit-mcp.patch) and [Codex ACP 1.13.1](patches/codex-acp-v1.13.1-explicit-mcp.patch). They have **not been built or applied to a distributed binary**; this workspace has no Rust toolchain. Keep `approvalPolicy=never` and `dangerFullAccess` for commands and tool approvals. The adapter declares a private app-server initialize extension containing only the ACP modes SAM advertised (`form` and/or `url`). The CLI filters that extension from MCP-server-advertised capabilities, copies its mode booleans into the session's elicitation router, and bypasses the `Never` decline **only** for a server-originated MCP form/URL request of an enabled mode with no `codex_approval_kind` tool-approval metadata. Its existing `auto_deny`, authority, server permission-profile, cancellation, and stale-turn checks still run. The existing ACP adapter then forwards `elicitation/create` to SAM; SAM persists the request and answer through Cloudflare. URL acceptance remains distinct from the later completion notification.

Core policy hunk (against the exact tag, not yet applied to a distributed binary):

```diff
- if elicitation_is_rejected_by_policy(approval_policy) {
+ if elicitation_is_rejected_by_policy(approval_policy)
+     && !router.explicit_mcp_mode_enabled_for(&elicitation)
+ {
      return Ok(ElicitationResponse { action: ElicitationAction::Decline, ... });
  }
```

`explicit_mcp_mode_enabled_for` must return false for MCP tool approvals, user verification, unsupported modes, missing client opt-in, child/untrusted session sources, and disabled ACP capabilities. The CLI and adapter changes need exact-pin builds and process tests before this can ship. No global `on-request` or granular policy switch is proposed.

The Claude failure is separate: `claude-agent-acp 0.81.2` receives SAM's ACP URL capability and attaches its `onElicitation` callback, but live Claude Code `2.1.281` did not advertise MCP URL elicitation to the fixture. The fixture's completion notifier failed before the adapter callback. A compatible Claude SDK/CLI fix or pin change is required; changing SAM's ACP advertisement alone cannot make that MCP initialize capability appear.

## Required validation before staging

Build the compatible patched CLI and adapter, then extend this probe to assert ordinary commands still execute under `never` without an approval request; server-originated MCP form and URL each reach ACP and Cloudflare when enabled; missing mode capability declines before receipt; denial, cancellation, stale/replay, and disabled capability fail closed; and URL completion works both before and after the human answer without treating acceptance as completion. Repeat canary assertions on all method/outcome logs. Existing Go ACP interaction tests cover the SAM-side lifecycle but do not prove the pinned CLI boundary.
