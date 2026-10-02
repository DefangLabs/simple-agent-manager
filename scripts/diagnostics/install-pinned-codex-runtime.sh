#!/usr/bin/env bash
# Install only the reviewed runtime archive; source verification happens at build time.
set -euo pipefail
[[ $# -eq 2 ]] || { echo "usage: $0 <reviewed-archive.tar> <install-root>" >&2; exit 2; }
archive=$(realpath -- "$1")
root=$2
identity='sam-codex-acp-1.13.1-sam-c2.1+cli-0.156.1-sam-c2.1-codemode2'
archive_hash='73b9126c830a01a353997e6bd4daee2657446a5d1519d2faddec850dd78ad42b'
archive_size=476395520
catalog_hash='c984a43334aab0968f8a728e8944fd36f99a613e9402eef77243d5ca3ff56d09'
[[ $(uname -m) == x86_64 && $(node -p 'process.versions.node.split(".")[0]') -ge 22 ]] || {
  echo 'candidate requires Linux x86_64 and Node 22+' >&2; exit 1;
}
[[ $(uname -s) == Linux && -f "$archive" && ! -L "$root" ]] || exit 1
# Pin bytes in a private directory before verification or waiting for a lock.
# Bound even a replaced/growing input, then never reopen the caller's archive.
# Ignore caller TMPDIR: a writable non-sticky parent could replace the private
# directory itself. Linux /tmp must be root-owned and non-writable or sticky.
[[ -d /tmp && ! -L /tmp && $(stat -c %u /tmp) == 0 ]] || exit 1
tmp_mode=$(stat -c %a /tmp)
(( (8#$tmp_mode & 0022) == 0 || (8#$tmp_mode & 01000) != 0 )) || exit 1
private=$(mktemp -d /tmp/sam-codex-runtime.XXXXXX)
incoming=''
trap 'rm -rf -- "$private"; [[ -z "$incoming" ]] || rm -rf -- "$incoming"' EXIT
timeout 120 head -c "$((archive_size + 1))" -- "$archive" > "$private/archive.tar"
[[ $(stat -c %s -- "$private/archive.tar") == "$archive_size" ]] || exit 1
printf '%s  %s\n' "$archive_hash" "$private/archive.tar" | sha256sum --check --status

# Only the installing user/root may control destination paths. A root-owned
# sticky parent (such as /tmp during tests) cannot replace our owned child.
trusted_directory() {
  local path=$1 allow_sticky=${2:-false} owner mode
  [[ -d "$path" && ! -L "$path" ]] || return 1
  owner=$(stat -c %u -- "$path")
  mode=$(stat -c %a -- "$path")
  [[ "$owner" == "$EUID" || "$owner" == 0 ]] || return 1
  (( (8#$mode & 0022) == 0 )) || {
    [[ "$allow_sticky" == true && "$owner" == 0 ]] && (( (8#$mode & 01000) != 0 ))
  }
}
parent=$(cd -- "$(dirname -- "$root")" && pwd -P)
root="$parent/$(basename -- "$root")"
ancestor=$parent
while :; do
  trusted_directory "$ancestor" true || { echo 'untrusted destination ancestor' >&2; exit 1; }
  [[ "$ancestor" != / ]] || break
  ancestor=$(dirname -- "$ancestor")
done
umask 022
mkdir -p -- "$root"
trusted_directory "$root" || { echo 'untrusted install root' >&2; exit 1; }
[[ $(stat -c %u -- "$root") == "$EUID" ]] || exit 1
root=$(cd -- "$root" && pwd -P)
lock="$root/.install.lock"
if [[ -e "$lock" || -L "$lock" ]]; then
  [[ -f "$lock" && ! -L "$lock" && $(stat -c %h -- "$lock") == 1 && $(stat -c %u -- "$lock") == "$EUID" ]] || exit 1
fi
# Non-truncating open, after directory trust excludes another user's races.
exec 9>>"$lock"
echo 'Verified runtime archive; waiting for installation lock.'
flock -x 9
incoming=$(mktemp -d "$root/.incoming.XXXXXX")
tar --extract --file "$private/archive.tar" --directory "$incoming" --no-same-owner

verify_release() {
  local base=$1 release="$1/releases/$identity" catalog="$1/catalog/$identity.sha256"
  [[ -d "$release" && ! -L "$release" && -f "$catalog" && ! -L "$catalog" ]] || return 1
  # Never execute a valid-at-check-time file that another user can replace.
  [[ -z $(find "$release" \( ! -user "$EUID" -o -perm /022 \) -print -quit) ]] || return 1
  printf '%s  %s\n' "$catalog_hash" "$catalog" | sha256sum --check --status || return 1
  [[ -z $(find "$release" -type l -print -quit) ]] || return 1
  [[ $(cd "$release" && find . -type f -printf '%P\n' | sort) == "$(printf '%s\n' bin/codex bin/codex-acp payload/SHA256SUMS payload/SOURCE-PROVENANCE payload/adapter.js payload/codex payload/codex-code-mode-host | sort)" ]] || return 1
  (cd "$release" && sha256sum --check --status "$catalog") || return 1
  [[ -x "$release/bin/codex" && -x "$release/bin/codex-acp" && -x "$release/payload/codex" && -x "$release/payload/codex-code-mode-host" ]] || return 1
  [[ $("$release/bin/codex" --version) == 'codex-cli 0.156.1-sam-c2.1' ]] || return 1
  [[ $("$release/bin/codex-acp" --version) == '@agentclientprotocol/codex-acp 1.13.1-sam-c2.1' ]] || return 1
}

verify_release "$incoming"
[[ ! -L "$root/releases" && ! -L "$root/catalog" ]] || exit 1
mkdir -p -- "$root/releases" "$root/catalog"
trusted_directory "$root/releases" && trusted_directory "$root/catalog" || exit 1
# This candidate has never been distributed. Replacing another active identity
# needs its corresponding reviewed migration/rollback procedure, not a fallback.
if [[ -e "$root/current" || -L "$root/current" ]]; then
  [[ -L "$root/current" && $(readlink -f -- "$root/current") == "$root/releases/$identity" ]] || {
    echo 'different active release; explicit migration required' >&2; exit 1;
  }
fi
catalog="$root/catalog/$identity.sha256"
if [[ -e "$catalog" || -L "$catalog" ]]; then
  [[ -f "$catalog" && ! -L "$catalog" ]] || exit 1
  [[ $(stat -c %u -- "$catalog") == "$EUID" ]] || exit 1
  (( (8#$(stat -c %a -- "$catalog") & 0022) == 0 )) || exit 1
  printf '%s  %s\n' "$catalog_hash" "$catalog" | sha256sum --check --status
else
  mv -- "$incoming/catalog/$identity.sha256" "$catalog"
fi
release="$root/releases/$identity"
if [[ ! -e "$release" && ! -L "$release" ]]; then
  mv -- "$incoming/releases/$identity" "$release"
fi
verify_release "$root"
ln -s -- "releases/$identity" "$incoming/current.next"
mv -Tf -- "$incoming/current.next" "$root/current"
echo "$identity"
