# Codex C2 runtime distribution preparation

This work is isolated from the live-test candidate `67e3aedd6`. It prepares an
explicit publisher, download route, opt-in VM bootstrap and Instant image preparation.
The reviewed archive is published as an experimental GitHub prerelease; R2 and runtime
deployment remain unverified. Default agent selection and ACP flags are unchanged.

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
R2 CLI. The archive has been published to the experimental GitHub prerelease and its anonymous HTTPS download verified; R2 publication remains untested live. The download route accepts only the
exact release and Linux amd64; unsupported platforms and absent storage fail
closed. The existing Worker binary streaming helper provides immutable headers.

Remaining: actual R2 publication/VM bootstrap, Instant image installation,
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

## Instant and clean-install preparation

`make -C packages/vm-agent prepare-container` stages the exact archive and canonical
installer before building the VM binary. The default source is the dedicated
`acp-codex-runtime-c2.1-codemode2` GitHub release asset, always checked against the
fixed SHA and size. `CODEX_RUNTIME_ARCHIVE` allows an offline local archive with
the same identity; it cannot override the accepted digest. No artifact credential
or already-deployed Worker is required for a fresh installation.

The Dockerfile installs in a separate Node22/glibc stage and copies only the
verified runtime tree into the final image before `USER node`. The compressed
archive is not retained in final image layers. Stock binaries remain present;
only an explicitly selected C2 candidate uses the patched runtime. Deployment
publishes that same prepared archive to the stack's R2 before Worker publication,
including first installation and skip-agent deployments.

**Publication verified:** the canonical GitHub prerelease asset is available at
https://github.com/raphaeltm/simple-agent-manager/releases/tag/acp-codex-runtime-c2.1-codemode2 .
Anonymous HTTPS preparation downloaded it and verified the exact size/digest.
Local offline preparation and mocked download/failure checks also pass; this workspace has no Docker
executable, so actual image installation remains a deployment verification gate.

## First staging deployment finding

Run `37093512280` passed Pulumi Up, archive preparation, migrations and VM binary
publication, then failed while reading the Pulumi R2-backed state in the new
runtime publication step. That step lacked the two AWS credential mappings
already used by the adjacent VM publication step. The runtime publisher itself
was not reached; API Worker deployment and smoke tests were skipped. Readback
confirmed the prior Worker and all three ACP flags false; staging Environment
ACP overrides were removed. No test compute was provisioned.

The workflow now forwards the same existing R2 credentials for its state lookup.
Independent review passed and all 48 deployment workflow tests passed, including
a regression for the missing credentials and publication ordering. Actual R2
runtime publication and image/runtime verification remain pending a corrected run.

The corrected run `37094388787` published and read-back verified the immutable
R2 archive. An anonymous download through the deployed Worker route matched the
pinned SHA. However, the Instant install stage lacked `libssl.so.3` and its binary
version check failed. Worker publication had already applied the candidate and
flags before Docker failure; root removed the overrides and started rollback
`37095050543`. No test compute was created.

Both Docker stages now explicitly install the CLI's non-glibc shared libraries:
`libssl3`, `liblzma5`, and `libgcc-s1`. Independent dependency review passed. The
actual install stage built locally in Docker, then payload checksums and exact
CLI/adapter versions passed as unprivileged `node`. The reusable
`scripts/ci/verify-codex-runtime-image.sh` also passed locally and now runs in VM
Agent Integration CI, including when the Dockerfile or preparation changes.
This checks the install stage; final-image staging verification is still required.
