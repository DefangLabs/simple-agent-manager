# Repair R2 CORS schema blocking Reliability A production

Canonical deployment38973836161 of merged A mainbde4f982 failed at22:10:12 before API/agent publication. Cloudflare HTTP400/code10029 rejects `exposed_headers` and `max_age_seconds`. Official raw REST schema requires `exposeHeaders` and `maxAgeSeconds`: https://developers.cloudflare.com/api/resources/r2/subresources/buckets/subresources/cors/methods/update/.

- [x] Preserve the failed release and original A acceptance/coverage limits; retain sole production ownership, no duplicate deployment.
- [x] Correct exactly the two JSON field names; preserve the app origin, PUT-only method, wildcard request headers, ETag exposure and3600-second cache policy.
- [x] Scenario regression executes real Bash with strict fake Cloudflare request validation: old script RED1failed/1passed; corrected script GREEN2passed. HTTP400 continues failing deployment. No network/secrets in tests.
- [x] Independent Cloudflare/security review `A-R2-CORS-CFSEC-20261016-01` PASS; focused test reviewer PASS. Bash syntax/diff checks PASS.
- [ ] Bounded staging configuration write/readback after explicit shared-slot handoff; no new compute or VM matrix.
- [ ] Exact-head CI/Sonar and trusted CodeRabbit request/wait, fix any actual findings, normal PR merge.
- [ ] Canonical automatic production deployment, matching live Worker/version/health and normal actual agent rollout; report actual SHA/run and release sequence back to2304.

User authorization covers completing Reliability A through production and necessary release fixes. This is a schema correction, not a CORS policy expansion. No secret, storage-object, pool, user-work or container-security changes. Original A live acceptance and failed Codex setup remain documented in PR2363; no new PASS is inferred from this fix.
