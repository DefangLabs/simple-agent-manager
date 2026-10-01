#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 2 ]] || { echo "usage: $0 <codex-binary> <adapter-dist-index.js>" >&2; exit 2; }
script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/sam-pinned-install-test.XXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
cp -- "$2" "$tmp/tampered.js"
printf '\n// tampered\n' >> "$tmp/tampered.js"
if "$script_dir/install-pinned-codex-local.sh" install "$1" "$tmp/tampered.js" "$tmp/install" >/dev/null 2>&1; then
  echo "tampered adapter accepted" >&2; exit 1
fi
[[ ! -e "$tmp/install/current" ]] || { echo "failed install changed current" >&2; exit 1; }
"$script_dir/install-pinned-codex-local.sh" install "$1" "$2" "$tmp/install" >/dev/null
[[ "$("$tmp/install/current/bin/codex" --version)" == sam-codex-cli\ 0.156.1+c2-* ]]
[[ "$("$tmp/install/current/bin/codex-acp" --version)" == sam-codex-acp\ 1.13.1+c2-* ]]
current=$(readlink -f -- "$tmp/install/current")
cp -a --reflink=auto "$current" "$tmp/install/releases/verified-prior"
ln -sfn "$tmp/install/releases/verified-prior" "$tmp/install/current"
"$script_dir/install-pinned-codex-local.sh" install "$1" "$2" "$tmp/install" >/dev/null
[[ "$(readlink -f -- "$tmp/install/previous")" == "$tmp/install/releases/verified-prior" ]]
"$script_dir/install-pinned-codex-local.sh" rollback "$tmp/install" >/dev/null
[[ "$(readlink -f -- "$tmp/install/current")" == "$tmp/install/releases/verified-prior" ]]
echo "checksum rejection, distinct identity, install and rollback passed"
