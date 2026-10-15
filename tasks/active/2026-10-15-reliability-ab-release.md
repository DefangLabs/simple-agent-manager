# Reliability A/B release option — 2026-10-15

Existing Sol B task assembles this coordinator-requested release option; no extra implementation task. Draft only, no independent deployment or merge.

Source manifest: A clean PR2355 `3d45a2d1c981cc10be572b5b1d19ca9769a17edf`, B clean draftPR2358 `f71e79b81b3b3f9d01f765d66db3be26c808212d`, merged at `b467f3898`. Reviewed startup fix uses only tts.ts from `c3e0bb75ad7337986618537c473aa6f1e65c2369` (cherry-picked as `2f28fc3e9`); lazy speech agent deduplication is `29e9c1dc1`, equivalent to reviewed integration commit `6f6dcf1da`.

Branch `release/reliability-ab-2026-10-15` is separate from live root original B HEAD and contains no runtime-state files. Entire VM-agent tree and Git authorization sources match the tested full integration tree; TTS behavior remains identical, with a clarified lazy-loading comment after the main merge; complete integrated Go test/vet/build PASS applies to identical bytes. Original A/B suites/reviews and CI are green per coordinator; affected API/typecheck/scanner checks are recorded in the PR. TTS2files94PASS and independent `INTEGRATION-API-STARTUP-20261015-04` PASS preserve lazy startup/retry/fallback behavior under the existing800-line limit.

This candidate includes publication removal/snapshot preservation, bounded Git credential retries/budgets and fresh repository authorization, and the narrow speech startup fix. C implementation/migrations/activation remain preserved in draftPR2361, outside this branch; this is an independent A/B release option, not completion of the full C hot-KV objective.

Coordinator retains shared staging, exact-head CI/Sonar/security/CodeRabbit, merge and production/runtime rollout. Consolidated configured-pool sweep must verify no automatic publication while snapshot/sleep/wake survives, actual installed helper30s on fresh/recreated/standalone runtime (old readonly helper can retain5s after binary-only update), heartbeat/clone/terminal/push/gh, transient success/exhaustion/cancel/revocation and cleanup. Never blanket restart/recreate unrelated user work. No container security boundary or nested Docker changes.

Final local AB evidence: affected API5files151tests PASS; APItypecheck PASS; CI-pinned current-tree Gitleaks50reviewed0new PASS; runtime-state check PASS; local Workerbundle dry-run PASS with container rollout disabled only for this build check. No Docker declaration changes. Independent `AB-COMPOSITION-COMPLETION-20261015-05` PASS at29e9c1dc1, prior source reviews remain applicable to identical code. Final exact-head coordinator CI/Sonar/security/CodeRabbit and shared staging remain pending.

## Current main integration

Supersedes the old4b33 pin: normal merge commit `f635e5643685b472ebebaa1719a359f67db2bb03` includes upstream main `0b0dd3ce3c8eec10fe84135b400908f49fa75f5a` (merged upload2359). Ancestry PASS. All33 upstream non-TTS paths are byte-identical to main; the only conflict was TTS inline initialization/comment shortening against the reviewed lazy factory. Resolution keeps the factory and single explanatory comment; no runtime behavior change. Entire Go and Git authorization paths remain byte-identical to4b33. Upstream upload behavior enters as normal main baseline, not new release scope. C2361 remains draft/activation blocked.

Fresh read-only reviews at merge headf635e5643: `AB-MAIN-INTEGRATION-20261015-06` PASS and `security-review-reliability-ab-mainmerge-f635e564-2026-10-15` PASS. Fresh affected API/typecheck/scanner/build/size/state/lint results follow in the PR; coordinator owns final exact-head CI/Sonar/security/CodeRabbit/staging/release. Task remains active.
