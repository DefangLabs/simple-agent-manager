# Codex C2 runtime distribution preparation

This work is isolated from the live-test candidate `67e3aedd6`. It prepares an
explicit publisher, download route, and opt-in VM bootstrap; none has been deployed
or used to publish artifacts. Default agent selection and ACP flags are unchanged.

## Offline installer

`install-pinned-codex-runtime.sh <archive> <root>` installs only the reviewed
`codemode2` distribution archive (132578703 bytes, SHA-256
`e85e7bfee875bb0bc0397a546073b324258d4cba2c0e54cb3808c3596825b292`). It verifies
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

- Publish the verified distribution archive to retain reviewed binaries, licenses
  and provenance beyond the seven-day Actions retention. The old manual-test
  tar is not the final publication package.
- Reuse immutable R2 publication with compare-before-write and no floating key.
  Provide durable checksum-pinned bootstrap assets for clean self-hosted installs.
- Reuse the Worker binary streaming route with an allowlisted release/platform.
- Validate the bounded VM bootstrap against the deployed immutable archive route.
- Bake the identical reviewed release into Instant through existing container
  build preparation. Reject unsupported ARM/musl runtimes explicitly.
- Verify operational rollback with the matching selector/image, or remove the
  fixture marker and start a fresh stock session. Retaining the prior catalog
  alone is not operational rollback.
- Complete the real Cloudflare request/answer/completion and browser matrix
  before publishing/activating production behavior.

## Licensed distribution archive

The final package is distinct from the earlier manual-test tar. The deterministic
`package-pinned-codex-runtime.sh` verifies private copies of the reviewed build
manifest and the unchanged seven-file runtime catalog. It retains CLI/adapter
licenses, source/build provenance, dependency lockfiles, and the upstream helper
signature under `notices/<identity>` with a separately pinned catalog.

Two independent uncompressed assemblies were byte-identical; deterministic
`gzip -n` produces the publication archive: 132578703 bytes, SHA-256
`e85e7bfee875bb0bc0397a546073b324258d4cba2c0e54cb3808c3596825b292`.
The installer now accepts only this archive and verifies/retains its metadata.
Root-install/unprivileged-execution, tamper rejection, permissions, concurrency,
and interrupted notices publication recovery pass locally.

The explicit `scripts/deploy/publish-codex-runtime-artifact.sh` uses only the
content-addressed R2 key, refuses a differing existing object or ambiguous lookup
failure, and verifies a post-upload readback. Its six scenarios pass with a mocked
R2 CLI. No artifact has been published yet. The download route accepts only the
exact release and Linux amd64; unsupported platforms and absent storage fail
closed. The existing Worker binary streaming helper provides immutable headers.

Remaining: actual publication/bootstrap integration, Instant image installation,
operational rollback verification, and the real Cloudflare/browser matrix. None
of these local results enables or activates production ACP.

The compressed archive is below pinned Wrangler’s 300 MiB REST upload limit;
the publisher and mocked transport both enforce that bound before upload.

## Opt-in VM bootstrap

Explicit C2 candidate sessions verify the release as the container user on every
start. Missing or invalid files enter the same serialized installation gate as
stock agents; the embedded, reviewed installer downloads only the pinned archive
from the configured control plane and runs as root. Other users cannot replace
its destination or catalog. Instant remains verification-only at runtime.

`CODEX_RUNTIME_INSTALL_TIMEOUT` (default `5m`) includes queue wait, verification,
download and installation. Every Docker exec command also carries a remaining-time
container deadline because killing the Docker client does not stop its child
processes. `CODEX_RUNTIME_INSTALL_KILL_GRACE` (default `5s`) bounds the grace between
TERM and KILL inside the container; processes may persist only for that grace after
the deadline. Abrupt cancellation before the deadline leaves the independent
container deadline in force. A failed bootstrap never falls back to stock while
claiming the patched identity. The shared gate now respects cancellation while
queued. Local tests cover concurrent installation, a stalled verifier/downloader,
a nearly exhausted queue budget, and Instant refusing a missing baked release.
