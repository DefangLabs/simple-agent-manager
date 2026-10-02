#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 1 ]] || { echo "usage: $0 <reviewed-archive.tar>" >&2; exit 2; }
archive=$(realpath -- "$1")
scripts=$(cd -- "$(dirname -- "$0")" && pwd -P)
test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT
installer="$scripts/install-pinned-codex-runtime.sh"
root="$test_dir/runtime"
printf 'not the reviewed archive' > "$test_dir/invalid.tar"
if "$installer" "$test_dir/invalid.tar" "$root" >/dev/null 2>&1; then
  echo 'unapproved archive accepted' >&2; exit 1
fi
[[ ! -e "$root" ]]
"$installer" "$archive" "$root" >/dev/null
current=$(readlink -- "$root/current")
[[ "$current" == releases/* ]]
"$installer" "$archive" "$root" >/dev/null
[[ $(readlink -- "$root/current") == "$current" ]]

cp -- "$root/$current/bin/codex-acp" "$test_dir/original-wrapper"
printf '\n# tampered\n' >> "$root/$current/bin/codex-acp"
if "$installer" "$archive" "$root" >/dev/null 2>&1; then
  echo 'existing tampered wrapper replaced or accepted' >&2; exit 1
fi
[[ $(readlink -- "$root/current") == "$current" ]]
cp -- "$test_dir/original-wrapper" "$root/$current/bin/codex-acp"

catalog=$(find "$root/catalog" -type f -name '*.sha256')
cp -- "$catalog" "$test_dir/original-catalog"
printf '\n# tampered\n' >> "$catalog"
if "$installer" "$archive" "$root" >/dev/null 2>&1; then
  echo 'changed trust catalog replaced or accepted' >&2; exit 1
fi
[[ $(readlink -- "$root/current") == "$current" ]]
cp -- "$test_dir/original-catalog" "$catalog"

rm -- "$root/current"
ln -s releases/another-release "$root/current"
if "$installer" "$archive" "$root" >/dev/null 2>&1; then
  echo 'different active identity replaced' >&2; exit 1
fi
[[ $(readlink -- "$root/current") == releases/another-release ]]
rm -- "$root/current"
ln -s "$current" "$root/current"
"$installer" "$archive" "$root" >/dev/null

ln -s "$root" "$test_dir/redirected-root"
if "$installer" "$archive" "$test_dir/redirected-root" >/dev/null 2>&1; then
  echo 'symlink root accepted' >&2; exit 1
fi

printf 'unrelated canary\n' > "$test_dir/canary"
rm -- "$root/.install.lock"
ln -s "$test_dir/canary" "$root/.install.lock"
if "$installer" "$archive" "$root" >/dev/null 2>&1; then
  echo 'symlink lock accepted' >&2; exit 1
fi
[[ $(cat "$test_dir/canary") == 'unrelated canary' ]]
rm -- "$root/.install.lock"
ln -- "$test_dir/canary" "$root/.install.lock"
if "$installer" "$archive" "$root" >/dev/null 2>&1; then
  echo 'hardlinked lock accepted' >&2; exit 1
fi
[[ $(cat "$test_dir/canary") == 'unrelated canary' ]]
rm -- "$root/.install.lock"

# Block activation after the private copy has been verified, then replace the
# caller-owned path. Installation must use the verified private bytes.
cp --reflink=auto -- "$archive" "$test_dir/mutable.tar"
exec 8>"$root/.install.lock"
flock -x 8
"$installer" "$test_dir/mutable.tar" "$root" > "$test_dir/waiting.log" 2>&1 &
install_pid=$!
ready=false
for _ in {1..200}; do
  if grep -q 'waiting for installation lock' "$test_dir/waiting.log"; then ready=true; break; fi
  sleep 0.1
done
if [[ "$ready" != true ]]; then
  flock -u 8
  kill "$install_pid" 2>/dev/null || true
  wait "$install_pid" 2>/dev/null || true
  echo 'installer did not reach lock' >&2; exit 1
fi
printf 'replacement is not a tar' > "$test_dir/mutable.tar"
flock -u 8
exec 8>&-
wait "$install_pid"
[[ $(readlink -- "$root/current") == "$current" ]]

"$installer" "$archive" "$root" > "$test_dir/concurrent-a.log" 2>&1 &
first_pid=$!
"$installer" "$archive" "$root" > "$test_dir/concurrent-b.log" 2>&1 &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
[[ $(readlink -- "$root/current") == "$current" ]]
echo 'runtime install, tamper rejection, lock safety, archive race and concurrent install passed'
