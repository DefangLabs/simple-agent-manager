#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 4 ]] || { echo "usage: $0 <cli-source> <adapter-source> <codex-binary> <adapter-dist-index.js>" >&2; exit 2; }
script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/sam-pinned-install-test.XXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
cp -- "$4" "$tmp/tampered.js"
printf '\n// tampered\n' >> "$tmp/tampered.js"
if "$script_dir/install-pinned-codex-local.sh" install "$1" "$2" "$3" "$tmp/tampered.js" "$tmp/install" >/dev/null 2>&1; then
  echo "tampered adapter accepted" >&2; exit 1
fi
[[ ! -e "$tmp/install/current" ]] || { echo "failed install changed current" >&2; exit 1; }
"$script_dir/install-pinned-codex-local.sh" install "$1" "$2" "$3" "$4" "$tmp/install" >/dev/null
[[ "$("$tmp/install/current/bin/codex" --version)" == "codex-cli 0.156.1-sam-c2.1" ]]
[[ "$("$tmp/install/current/bin/codex-acp" --version)" == "@agentclientprotocol/codex-acp 1.13.1-sam-c2.1" ]]
[[ "$("$tmp/install/current/bin/codex" --version)" != "codex-cli 0.156.1" ]]
[[ "$("$tmp/install/current/bin/codex-acp" --version)" != "@agentclientprotocol/codex-acp 1.13.1" ]]
current=$(readlink -f -- "$tmp/install/current")
cp -a --reflink=auto "$current" "$tmp/install/releases/verified-prior"
ln -sfn "$tmp/install/releases/verified-prior" "$tmp/install/current"
"$script_dir/install-pinned-codex-local.sh" install "$1" "$2" "$3" "$4" "$tmp/install" >/dev/null
[[ "$(readlink -f -- "$tmp/install/previous")" == "$tmp/install/releases/verified-prior" ]]
"$script_dir/install-pinned-codex-local.sh" rollback "$tmp/install" >/dev/null
[[ "$(readlink -f -- "$tmp/install/current")" == "$tmp/install/releases/verified-prior" ]]
echo "checksum rejection, distinct identity, install and rollback passed"
