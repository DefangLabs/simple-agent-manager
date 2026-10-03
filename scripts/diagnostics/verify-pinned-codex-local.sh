#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 5 ]] || { echo "usage: $0 <cli-source> <adapter-source> <codex-binary> <adapter-dist-index.js> <codex-code-mode-host>" >&2; exit 2; }
script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
cli_source=$1
adapter_source=$2
cli_binary=$3
adapter_binary=$4
host_binary=$5
read -r cli_name cli_tag cli_commit cli_patch_hash < "$script_dir/pinned-codex-local.provenance"
read -r adapter_name adapter_tag adapter_commit adapter_patch_hash < <(sed -n '2p' "$script_dir/pinned-codex-local.provenance")
read -r host_name host_tag host_commit host_source_kind < <(sed -n '3p' "$script_dir/pinned-codex-local.provenance")
read -r archive_name archive_file archive_hash archive_binary_hash < <(sed -n '4p' "$script_dir/pinned-codex-local.provenance")
read -r signature_name signature_file signature_hash signature_identity < <(sed -n '5p' "$script_dir/pinned-codex-local.provenance")
[[ "$cli_name" == cli && "$adapter_name" == adapter && "$host_name" == official-code-mode-host ]] || exit 1
[[ "$host_tag" == "$cli_tag" && "$host_commit" == "$cli_commit" && "$host_source_kind" == unpatched-upstream ]] || exit 1
[[ "$archive_name" == official-host-archive && "$archive_file" == codex-code-mode-host-x86_64-unknown-linux-musl.tar.gz && "$archive_hash" == a929daa9f6a0bddc00c0c9e6402df117b125acd96f9d554f6c99c32c7e66c608 ]] || exit 1
[[ "$signature_name" == official-host-sigstore && "$signature_file" == codex-code-mode-host-x86_64-unknown-linux-musl.sigstore && "$signature_hash" == 0904ffcab71b13a942bb2cae30dde5f6fad9609d8958699c2b4b40778b63ddfa && "$signature_identity" == https://github.com/openai/codex/.github/workflows/rust-release.yml@refs/tags/rust-v0.156.1 ]] || exit 1
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
[[ "$(sha256sum "$host_binary" | cut -d' ' -f1)" == "$(sed -n '3s/ .*//p' "$script_dir/pinned-codex-local.sha256")" ]]
[[ "$archive_binary_hash" == "$(sed -n '3s/ .*//p' "$script_dir/pinned-codex-local.sha256")" ]]
[[ -x "$host_binary" ]]
[[ "$("$cli_binary" --version)" == "codex-cli 0.156.1-sam-c2.1" ]]
[[ "$(node "$adapter_binary" --version)" == "@agentclientprotocol/codex-acp 1.13.1-sam-c2.1" ]]
echo "pinned HEAD/tag commits, scoped unstaged diffs (CLI excludes Cargo.lock), patch/artifact hashes and runtime identities verified"
