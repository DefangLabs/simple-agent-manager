#!/usr/bin/env bash
# Install only the reviewed runtime archive; source verification happens at build time.
set -euo pipefail
[[ $# -eq 2 ]] || { echo "usage: $0 <reviewed-archive.tar.gz> <install-root>" >&2; exit 2; }
archive=$(realpath -- "$1")
root=$2
identity='sam-codex-acp-1.13.1-sam-c2.1+cli-0.156.1-sam-c2.1-codemode2'
archive_hash='e85e7bfee875bb0bc0397a546073b324258d4cba2c0e54cb3808c3596825b292'
archive_size=132578703
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
  (( (8#$(stat -c %a -- "$ancestor") & 0011) == 0011 )) || {
    echo 'destination ancestor is not publicly traversable' >&2; exit 1;
  }
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

verify_notices() {
  local base=$1 notices="$1/notices/$identity" manifest="${2:-$1/catalog/$identity.notices.sha256}"
  [[ -d "$notices" && ! -L "$notices" && -f "$manifest" && ! -L "$manifest" ]] || return 1
  [[ -z $(find "$notices" \( -type l -o ! -user "$EUID" -o -perm /022 \) -print -quit) ]] || return 1
  printf '%s  %s\n' '9f84f8c07cc6b2a3dfe7df75816e18896575e0a8f622b2cb778b826f8db4e056' "$manifest" | sha256sum --check --status || return 1
  [[ $(cd "$notices" && find . -type f -printf '%P\n' | sort) == "$(awk '{print $2}' "$manifest" | sort)" ]] || return 1
  [[ -z $(find "$notices" -type d ! -perm -0055 -print -quit) ]] || return 1
  [[ -z $(find "$notices" -type f ! -perm -0044 -print -quit) ]] || return 1
  (cd "$notices" && sha256sum --check --status "$manifest")
}

public_release() {
  local release=$1
  [[ -z $(find "$release" -type d ! -perm -0055 -print -quit) ]] || return 1
  [[ -z $(find "$release" -type f ! -perm -0044 -print -quit) ]] || return 1
  local executable
  for executable in bin/codex bin/codex-acp payload/codex payload/codex-code-mode-host; do
    (( (8#$(stat -c %a -- "$release/$executable") & 0055) == 0055 )) || return 1
  done
}
public_path() {
  (( (8#$(stat -c %a -- "$1") & "$2") == "$2" ))
}

verify_release "$incoming"
verify_notices "$incoming"
# The archive was assembled under a private mktemp directory. Keep the
# staging parent private, but publish traversable public runtime directories
# so a root installation can be executed by the workspace user.
find "$incoming/releases/$identity" -type d -exec chmod 755 -- {} +
public_release "$incoming/releases/$identity"
public_path "$incoming/catalog/$identity.sha256" 0044
public_path "$root" 0055
[[ ! -L "$root/releases" && ! -L "$root/catalog" && ! -L "$root/notices" ]] || exit 1
mkdir -p -- "$root/releases" "$root/catalog" "$root/notices"
trusted_directory "$root/releases" && trusted_directory "$root/catalog" && trusted_directory "$root/notices" || exit 1
public_path "$root/releases" 0055 && public_path "$root/catalog" 0055 && public_path "$root/notices" 0055 || exit 1
if [[ -e "$root/releases/$identity" ]]; then
  existing_catalog="$root/catalog/$identity.sha256"
  [[ -f "$existing_catalog" && ! -L "$existing_catalog" && $(stat -c %u "$existing_catalog") == "$EUID" ]] || exit 1
  (( (8#$(stat -c %a "$existing_catalog") & 0022) == 0 )) || exit 1
  public_path "$existing_catalog" 0044
  public_release "$root/releases/$identity" || exit 1
  verify_release "$root" || exit 1
fi
# This candidate has never been distributed. Replacing another active identity
# needs its corresponding reviewed migration/rollback procedure, not a fallback.
if [[ -e "$root/current" || -L "$root/current" ]]; then
  [[ -L "$root/current" && $(readlink -f -- "$root/current") == "$root/releases/$identity" ]] || {
    echo 'different active release; explicit migration required' >&2; exit 1;
  }
fi
notices="$root/notices/$identity"
notices_manifest="$root/catalog/$identity.notices.sha256"
# Each piece is independently checked against incoming pinned evidence, so
# interrupted publication can finish without replacing any existing bytes.
if [[ -e "$notices" || -L "$notices" ]]; then
  verify_notices "$root" "$incoming/catalog/$identity.notices.sha256" || exit 1
fi
if [[ -e "$notices_manifest" || -L "$notices_manifest" ]]; then
  [[ -f "$notices_manifest" && ! -L "$notices_manifest" ]] || exit 1
  cmp -- "$notices_manifest" "$incoming/catalog/$identity.notices.sha256"
  [[ $(stat -c %u "$notices_manifest") == "$EUID" ]] || exit 1
  (( (8#$(stat -c %a "$notices_manifest") & 0022) == 0 )) || exit 1
  public_path "$notices_manifest" 0044
fi
catalog="$root/catalog/$identity.sha256"
if [[ -e "$catalog" || -L "$catalog" ]]; then
  [[ -f "$catalog" && ! -L "$catalog" ]] || exit 1
  [[ $(stat -c %u -- "$catalog") == "$EUID" ]] || exit 1
  (( (8#$(stat -c %a -- "$catalog") & 0022) == 0 )) || exit 1
  printf '%s  %s\n' "$catalog_hash" "$catalog" | sha256sum --check --status
  public_path "$catalog" 0044
else
  mv -- "$incoming/catalog/$identity.sha256" "$catalog"
fi
release="$root/releases/$identity"
if [[ ! -e "$release" && ! -L "$release" ]]; then
  mv -- "$incoming/releases/$identity" "$release"
fi
if [[ ! -e "$notices" ]]; then
  mv -- "$incoming/notices/$identity" "$notices"
fi
if [[ ! -e "$notices_manifest" ]]; then
  mv -- "$incoming/catalog/$identity.notices.sha256" "$notices_manifest"
fi
verify_notices "$root"
verify_release "$root"
# Existing installations must also be usable without the installer's UID.
public_release "$release"
ln -s -- "releases/$identity" "$incoming/current.next"
mv -Tf -- "$incoming/current.next" "$root/current"
echo "$identity"
