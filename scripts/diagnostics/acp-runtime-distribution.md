# Codex C2 runtime distribution preparation

This work is isolated from the live-test candidate `67e3aedd6`. Nothing here
publishes an artifact, downloads a runtime, changes startup behavior or activates
ACP flags.

## Offline installer

`install-pinned-codex-runtime.sh <archive> <root>` installs only the reviewed
`codemode2` archive (476395520 bytes, SHA-256
`73b9126c830a01a353997e6bd4daee2657446a5d1519d2faddec850dd78ad42b`). It verifies
an installer-owned private copy before extraction, checks destination ownership
and permissions, serializes activation with a non-truncating lock, verifies the
external catalog and exact seven-file release, checks executable versions and
atomically changes `current`. A different active identity or modified existing
release is rejected. It does not perform migration or rollback.

The installer requires Linux x86_64, Node 22+, glibc/OpenSSL compatible with the
reviewed CLI, Bash, GNU coreutils/tar and util-linux `flock`. It needs write access
to its chosen install root. The production VM install boundary runs as root;
Instant must install during image construction before `USER node`.

`test-install-pinned-codex-runtime.sh <archive>` exercises initial and repeated
installation, unapproved archives, modified catalogs/wrappers, a different
active identity, root symlinks, lock symlinks/hardlinks preserving an unrelated
canary, archive replacement while blocked on a lock, and concurrent installers.
Independent review found and reverified fixes for the input verification race
and truncating lock open. Same-user/root adversaries are outside the filesystem
trust boundary; another user must not control the destination or its ancestors.

## Remaining integration

- Preserve reviewed binaries and build/source provenance, lockfiles and licenses
  beyond the seven-day Actions retention. The local manual-test tar above is not
  the final publication package: production packaging must also carry the
  license/provenance metadata and receive a separately reviewed archive digest.
- Reuse immutable R2 publication with compare-before-write and no floating key.
  Provide durable checksum-pinned bootstrap assets for clean self-hosted installs.
- Reuse the Worker binary streaming route with an allowlisted release/platform.
- Add bounded checksum-verifying download at the existing serialized root VM
  install boundary, preserving session opt-in and verification on each restart.
- Bake the identical reviewed release into Instant through existing container
  build preparation. Reject unsupported ARM/musl runtimes explicitly.
- Verify operational rollback with the matching selector/image, or remove the
  fixture marker and start a fresh stock session. Retaining the prior catalog
  alone is not operational rollback.
- Complete the real Cloudflare request/answer/completion and browser matrix
  before publishing/activating production behavior.
