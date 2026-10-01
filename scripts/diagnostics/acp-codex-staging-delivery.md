# Isolated Codex C2 staging candidate — review before mutation

The branch adds an explicit VM-agent selector, `SAM_CODEX_C2_CANDIDATE=1`, for one
staging fixture VM. With the variable absent, the stock npm pins and exact stock
version guard remain in use. An invalid value fails selection. The selected
candidate runs `/opt/sam-codex-c2/current/bin/codex-acp`; it never invokes npm
or falls back to stock when candidate verification fails. It is checked before
selection and again before every start/restart, including crash recovery. The
adapter wrapper pins `CODEX_PATH` to its paired CLI. This is not a production
default, container-image change, or shared Sol change.

## Reviewed artifact and supported runtime

- Identity: `sam-codex-acp-1.13.1-sam-c2.1+cli-0.156.1-sam-c2.1-3b2c67ac32ea`.
- Trusted six-file catalog: [`pinned-codex-catalog/sam-codex-acp-1.13.1-sam-c2.1+cli-0.156.1-sam-c2.1-3b2c67ac32ea.sha256`](pinned-codex-catalog/sam-codex-acp-1.13.1-sam-c2.1+cli-0.156.1-sam-c2.1-3b2c67ac32ea.sha256); its SHA-256 `5f6f8fe7256a682c2465ab334042c241992418050b8c7cec564bb7877a9e3218` is compiled into the VM agent. The catalog is outside the release. Runtime verification checks this hash, the exact release file set, symlink/executable constraints, every catalog digest, and actual wrapper versions. A release-owned `SHA256SUMS` cannot authorize changed bytes.
- Local delivery tar: `.codex/tmp/sam-codex-c2-delivery/sam-codex-acp-1.13.1-sam-c2.1+cli-0.156.1-sam-c2.1-3b2c67ac32ea.tar`, SHA-256 `e0e8616c432d8c5fa625f48e52abf47ca8db5ce05595cb2786eebd847f7d12cf`. It contains `current` (relative link), `catalog/`, and `releases/`; it has not been uploaded or distributed.
- Runtime: Linux x86_64, glibc with OpenSSL 3 and system libraries used by the built CLI, Node 22 or newer, `sh`, `find`, `sort`, `readlink`, `cut`, and `sha256sum`. The VM-agent check enforces x86_64 and Node 22+, runs both versions to catch missing dynamic libraries, and verifies file bytes. Use the existing Debian-based SAM devcontainer; no ARM or musl claim is made. The bundled adapter JavaScript was exercised by the installed-entrypoint Go process harness.

## Serialized staging procedure after coordinator review

1. Confirm #2207 stack head and exact #2210 candidate SHA, no active `deploy-staging` run or competing staging owner, staging flags initially false, and zero non-deleted nodes. Keep all three PRs draft. Deploy the reviewed branch once through `deploy-staging.yml`; record the run and SHA. This publishes the opt-in VM agent but leaves stock behavior active everywhere until one isolated fixture VM is configured.
2. Provision one exclusive fixture workspace/VM with the standard x86_64 Debian devcontainer. Record workspace, node, container, session, and MCP-connection IDs. Before selecting Codex, transfer the reviewed tar through the operator's existing authenticated VM transfer channel to that one VM host. Compare the tar SHA-256 there with the value above. Copy it into that devcontainer and extract as root under `/opt/sam-codex-c2` (for example, `docker cp <verified-tar> <container>:/tmp/c2.tar`, then `docker exec -u root <container> sh -c 'mkdir -p /opt/sam-codex-c2 && tar -C /opt/sam-codex-c2 -xf /tmp/c2.tar'`). Keep the catalog outside `releases/` and preserve the relative `current` link. Do not fetch a floating npm package or run an unreviewed build on the VM.
3. On **only that idle fixture VM**, set `SAM_CODEX_C2_CANDIDATE=1` in its VM-agent service environment and restart that service before Codex selection. Record the service PID/build and selector readback without secrets. Do not enable the selector fleet-wide. Verify the installed wrappers report `codex-cli 0.156.1-sam-c2.1` and `@agentclientprotocol/codex-acp 1.13.1-sam-c2.1`; the ACP initialize agentInfo must also report `1.13.1-sam-c2.1`. Deliberately failing the catalog check on a disposable copy must stop selection before a stock fallback; restore the reviewed bytes before the live case. Never run a live prompt if identity or verification fails.
4. Enable only the required staging ACP interaction and URL flags and read them back. In one Codex session, run the Cloudflare-backed matrix: trusted loopback and accepted HTTPS URL; persisted receipt and human answer; service completion both before and after answer; accepted answer without service completion remains incomplete; decline and cancel; late, duplicate, wrong-ID, cross-server, stale/replayed completion; flag-off rejection; header-canary secrecy, retry, and project authorization. Record safe request/response IDs, result categories, timestamps, and exact session/connection identity, never URLs, tokens, headers, or prompts. The ACP completion callback alone is insufficient: verify Cloudflare receipt and durable answer separately. Claude's missing MCP URL capability remains a separate blocker and must not be called passed from this run.
5. Stop the test session. Remove the selector from that fixture VM-agent service and restart it; confirm stock `codex-acp`/`codex` exact versions (install the stock npm pins through the existing SAM path if absent) and that a fresh stock selection uses the stock guard. Delete the fixture session/MCP connection/workspace/node and any duplicate provisioning IDs. Remove staging flag overrides, run the dormant restore deployment, read back all three flags false, and query D1 for **zero non-deleted staging nodes**. Record exact deployment/run IDs and cleanup evidence. Keep drafts and merge hold for coordinator personal review.

No staging step above has been executed for this candidate. The local process
recorder is not evidence of live Cloudflare persistence, and Claude remains
unresolved.
