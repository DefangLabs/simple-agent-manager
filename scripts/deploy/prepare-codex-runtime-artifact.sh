#!/usr/bin/env bash
# Stage the same checksum-pinned archive for Instant baking and R2 publication.
# CODEX_RUNTIME_ARCHIVE permits an offline source; it cannot change identity.
set -euo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <container-artifact-directory>" >&2; exit 2; }
script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
repo_root=$(cd -- "$script_dir/../.." && pwd -P)
release='e85e7bfee875bb0bc0397a546073b324258d4cba2c0e54cb3808c3596825b292'
size=132578703
url='https://github.com/raphaeltm/simple-agent-manager/releases/download/acp-codex-runtime-c2.1-codemode2/codex-runtime-linux-amd64.tar.gz'
private=$(mktemp -d)
trap 'rm -rf -- "$private"' EXIT
if [[ -n ${CODEX_RUNTIME_ARCHIVE:-} ]]; then
  timeout 120 head -c "$((size + 1))" -- "$CODEX_RUNTIME_ARCHIVE" > "$private/runtime.tar.gz"
else
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --max-time 180 --max-filesize "$size" --output "$private/runtime.tar.gz" "$url"
fi
[[ $(stat -c %s "$private/runtime.tar.gz") == "$size" ]]
printf '%s  %s\n' "$release" "$private/runtime.tar.gz" | sha256sum --check --status
mkdir -p -- "$1"
# Install the trusted script from this checkout, never a downloaded executable script.
install -m 0644 "$private/runtime.tar.gz" "$1/codex-runtime-linux-amd64.tar.gz"
install -m 0755 "$repo_root/packages/vm-agent/internal/acp/codex_runtime_installer.sh" "$1/install-codex-runtime.sh"
echo 'Prepared pinned Codex runtime archive and reviewed installer'
