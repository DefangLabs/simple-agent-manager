#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 4 ]] || { echo "usage: $0 <cli-source> <adapter-source> <codex-binary> <adapter-dist-index.js>" >&2; exit 2; }
script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
cli_source=$1
adapter_source=$2
cli_binary=$3
adapter_binary=$4
read -r cli_name cli_tag cli_commit cli_patch_hash < "$script_dir/pinned-codex-local.provenance"
read -r adapter_name adapter_tag adapter_commit adapter_patch_hash < <(sed -n '2p' "$script_dir/pinned-codex-local.provenance")
[[ "$cli_name" == cli && "$adapter_name" == adapter ]] || exit 1
[[ "$(git -C "$cli_source" rev-parse HEAD)" == "$cli_commit" ]]
[[ "$(git -C "$cli_source" rev-parse "$cli_tag^{commit}")" == "$cli_commit" ]]
[[ "$(git -C "$adapter_source" rev-parse HEAD)" == "$adapter_commit" ]]
[[ "$(git -C "$adapter_source" rev-parse "$adapter_tag^{commit}")" == "$adapter_commit" ]]
cli_patch="$script_dir/patches/codex-cli-rust-v0.156.1-explicit-mcp.patch"
adapter_patch="$script_dir/patches/codex-acp-v1.13.1-explicit-mcp.patch"
[[ "$(sha256sum "$cli_patch" | cut -d' ' -f1)" == "$cli_patch_hash" ]]
[[ "$(sha256sum "$adapter_patch" | cut -d' ' -f1)" == "$adapter_patch_hash" ]]
cmp -s "$cli_patch" <(git -C "$cli_source" diff -U0 -- codex-rs ':!codex-rs/Cargo.lock')
cmp -s "$adapter_patch" <(git -C "$adapter_source" diff -U0 -- src package.json package-lock.json)
[[ "$(sha256sum "$cli_binary" | cut -d' ' -f1)" == "$(sed -n '1s/ .*//p' "$script_dir/pinned-codex-local.sha256")" ]]
[[ "$(sha256sum "$adapter_binary" | cut -d' ' -f1)" == "$(sed -n '2s/ .*//p' "$script_dir/pinned-codex-local.sha256")" ]]
[[ "$("$cli_binary" --version)" == "codex-cli 0.156.1-sam-c2.1" ]]
[[ "$(node "$adapter_binary" --version)" == "@agentclientprotocol/codex-acp 1.13.1-sam-c2.1" ]]
echo "pinned sources, exact diffs, patches, artifacts and runtime identities verified"
