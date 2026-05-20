# Cloudflare Devcontainer Cache Handoff

Date: 2026-05-11
PR: <https://github.com/raphaeltm/simple-agent-manager/pull/963>
Branch: `sam/cloudflare-devcontainer-cache-experiments-01krb4`

## Current Conclusion

Use Cloudflare managed Containers Registry as the production replacement for
GHCR-based devcontainer cache images.

The managed registry is the best fit because SAM's VM agent already uses a
Docker-native flow:

1. `docker pull` previous cache image, if present
2. pass `cacheFrom` into the devcontainer build
3. `docker tag` the resulting image
4. `docker push` the cache image for the next run

Cloudflare managed registry preserves this flow. R2 tarballs and BuildKit S3
cache both worked in experiments, but each requires a larger implementation
change.

## Evidence

Detailed experiment notes:

- `docs/notes/2026-05-11-cloudflare-devcontainer-cache-experiments.md`
- Workflow experiments: `.github/workflows/devcontainer-cache-experiments.yml`

Successful SAM real-devcontainer stress test:

- Run: <https://github.com/raphaeltm/simple-agent-manager/actions/runs/25672922644>
- Real SAM devcontainer image size: 2,741,386,134 bytes / 2,614.4 MiB
- Full job duration: 4 minutes 18 seconds
- Build phase: about 2 minutes 25 seconds
- Push/pull phase: about 85 seconds from push start to successful pull
- Digest: `sha256:baeb7e14758e5b4284cd7b9b2faec8e736ed97fd1c37b153614ce06306cfc07e`

Earlier synthetic experiment:

- Verified Cloudflare managed registry push/pull with plain Docker after
  Wrangler minted credentials.
- Verified R2 Docker tarball save/upload/download/load.
- Verified R2 as a BuildKit S3 cache backend.

## Important Implementation Constraint

Do not install Wrangler on VM agent nodes for production behavior.

Wrangler was useful only in GitHub Actions experiments. Production should mint
short-lived registry credentials from the API/control plane and pass Docker
registry credentials to the VM agent.

The relevant Cloudflare endpoint is the same endpoint Wrangler uses:

```text
POST /accounts/{account_id}/containers/registries/registry.cloudflare.com/credentials
```

Expected body shape:

```json
{
  "expiration_minutes": 120,
  "permissions": ["pull", "push"]
}
```

The response includes registry host, username, and password. Treat the password
as sensitive and never log it.

## Suggested Production Shape

Add configuration for Cloudflare managed registry caching, using environment
variables rather than hardcoded values. Suggested names are illustrative; follow
existing env naming conventions after inspecting `apps/api/src/env.ts`,
deployment scripts, and docs:

- Cloudflare account ID for the registry account
- Cloudflare API token with permission to mint managed registry credentials
- Registry namespace/repository prefix, if needed
- Credential expiration minutes, configurable with a safe default

API/control plane responsibilities:

1. Detect whether Cloudflare devcontainer cache config is present.
2. Mint short-lived pull/push credentials before VM agent bootstrap.
3. Build the registry image reference, for example:
   `registry.cloudflare.com/<account-id>/<owner>-<repo>:devcontainer-cache`
4. Pass `DEVCONTAINER_CACHE_REGISTRY`, cache image ref, username, and password
   into the VM agent bootstrap environment.
5. Preserve existing GHCR/no-cache behavior as fallback when Cloudflare config is
   absent.

VM agent responsibilities:

1. Use supplied Docker registry credentials for `docker login`.
2. Pull cache image if present and tolerate cache misses.
3. Pass cache ref into devcontainer build.
4. Tag and push the resulting image when build succeeds.
5. Avoid logging registry passwords or tokens.

## Areas To Inspect First

Start by reading these files/directories:

- `packages/vm-agent/`
- `apps/api/src/durable-objects/task-runner/`
- `apps/api/src/services/task-runner-do.ts`
- `apps/api/src/env.ts`
- deployment/secrets documentation and scripts
- `.github/workflows/devcontainer-cache-experiments.yml`
- `docs/notes/2026-05-11-cloudflare-devcontainer-cache-experiments.md`

Search terms that should help:

- `DEVCONTAINER_CACHE`
- `cacheFrom`
- `GHCR`
- `docker login`
- `docker push`
- `devcontainer`

## Testing Expectations

Add focused unit tests for:

- Cloudflare registry credential minting request construction
- sensitive value redaction/no logging behavior where applicable
- fallback behavior when Cloudflare registry config is absent
- VM agent environment/config parsing for registry credentials

If practical, keep the experiment workflow available as a manual validation
path, but the production implementation should not depend on Wrangler.

## Non-Goals

- Do not merge PR #963.
- Do not replace the devcontainer build system wholesale.
- Do not switch production to R2 tarballs unless Cloudflare managed registry
  proves impossible during implementation.
- Do not hardcode account IDs, repo names, registry URLs beyond stable provider
  host constants, credential TTLs, or secrets.
