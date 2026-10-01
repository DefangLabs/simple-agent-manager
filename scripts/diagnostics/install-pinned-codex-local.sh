#!/usr/bin/env bash
# Local review installer for the exact patched artifacts. Never touches global npm paths.
set -euo pipefail

usage() {
  echo "usage: $0 install <cli-source> <adapter-source> <codex-binary> <adapter-dist-index.js> <install-root> | rollback <install-root>" >&2
  exit 2
}

script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
manifest="$script_dir/pinned-codex-local.sha256"
identity="sam-codex-acp-1.13.1-sam-c2.1+cli-0.156.1-sam-c2.1-3b2c67ac32ea"

case "${1:-}" in
  install)
    [[ $# -eq 6 ]] || usage
    cli_source=$4
    adapter_source=$5
    root=$6
    [[ -f "$cli_source" && -f "$adapter_source" ]] || usage
    "$script_dir/verify-pinned-codex-local.sh" "$2" "$3" "$cli_source" "$adapter_source" >/dev/null
    mkdir -p -- "$root/releases"
    root=$(cd -- "$root" && pwd -P)
    release="$root/releases/$identity"
    [[ ! -L "$release" ]] || { echo "release path is a symlink" >&2; exit 1; }
    if [[ ! -d "$release" ]]; then
      incoming=$(mktemp -d "$root/releases/.incoming.XXXXXX")
      trap 'rm -rf -- "$incoming"' EXIT
      mkdir -p -- "$incoming/payload" "$incoming/bin"
      cp -- "$cli_source" "$incoming/payload/codex"
      cp -- "$adapter_source" "$incoming/payload/adapter.js"
      cp -- "$manifest" "$incoming/payload/SHA256SUMS"
      cp -- "$script_dir/pinned-codex-local.provenance" "$incoming/payload/SOURCE-PROVENANCE"
      (cd "$incoming/payload" && sha256sum --check --status SHA256SUMS)
      cat > "$incoming/bin/codex" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
exec "$here/payload/codex" "$@"
EOF
      cat > "$incoming/bin/codex-acp" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
export CODEX_PATH="$here/bin/codex"
exec node "$here/payload/adapter.js" "$@"
EOF
      chmod 755 "$incoming/bin/codex" "$incoming/bin/codex-acp" "$incoming/payload/codex"
      mv -- "$incoming" "$release"
      trap - EXIT
    else
      cmp -s -- "$manifest" "$release/payload/SHA256SUMS" || {
        echo "installed checksum manifest differs from reviewed manifest" >&2; exit 1;
      }
      cmp -s -- "$script_dir/pinned-codex-local.provenance" "$release/payload/SOURCE-PROVENANCE" || {
        echo "installed source provenance differs from reviewed provenance" >&2; exit 1;
      }
      (cd "$release/payload" && sha256sum --check --status SHA256SUMS)
    fi
    if [[ -L "$root/current" ]]; then
      old=$(readlink -f -- "$root/current")
      [[ "$old" == "$root/releases/"* && -d "$old" ]] || {
        echo "current link outside install root" >&2; exit 1;
      }
      if [[ "$old" != "$release" ]]; then
        ln -sfn -- "$old" "$root/.previous.next"
        mv -Tf -- "$root/.previous.next" "$root/previous"
      fi
    elif [[ -e "$root/current" ]]; then
      echo "current path is not a symlink" >&2; exit 1
    fi
    ln -sfn -- "$release" "$root/.current.next"
    mv -Tf -- "$root/.current.next" "$root/current"
    echo "$identity"
    ;;
  rollback)
    [[ $# -eq 2 ]] || usage
    root=$2
    [[ -L "$root/current" && -L "$root/previous" ]] || { echo "no previous release" >&2; exit 1; }
    root=$(cd -- "$root" && pwd -P)
    current=$(readlink -f -- "$root/current")
    previous=$(readlink -f -- "$root/previous")
    [[ "$current" == "$root/releases/"* && "$previous" == "$root/releases/"* && -d "$previous" ]] || {
      echo "release link outside install root" >&2; exit 1;
    }
    (cd "$previous/payload" && sha256sum --check --status SHA256SUMS)
    ln -sfn -- "$previous" "$root/.current.next"
    mv -Tf -- "$root/.current.next" "$root/current"
    ln -sfn -- "$current" "$root/.previous.next"
    mv -Tf -- "$root/.previous.next" "$root/previous"
    echo "rolled back to $(basename -- "$previous")"
    ;;
  *) usage ;;
esac
