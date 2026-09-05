# Fix: concurrent `upsertAppRouteDNSRecord` create race wedges deployments

**Status:** implemented, PR open
**Discovered:** 2026-09-05, debugging a stuck deployment on the `defanglabs.ca` install

## Problem

A deployment environment stalled with no app-route DNS record and no TLS certificate.
The node had booted fine and was heartbeating. The control plane had logged exactly one
error in the whole window:

```
  time    : 12:55:58
  source  : api
  node    : 01M1RS3F0SKBQSPMRVSJQSSMF2
  message : An identical record already exists.
  context : {"path":"/api/nodes/01M1RS3F…/deploy-release","method":"GET","status":500}
  stack   : Error: An identical record already exists.
                at upsertAppRouteDNSRecord (index.js:137759)
                at async Promise.all (index 0)
```

`GET /api/nodes/:id/deploy-release` is the handler the deployment node calls to fetch its
release payload. It upserts every app-route DNS record before returning that payload. One
upsert threw, so the whole request 500'd and the node never received its release — the
deployment stalled *upstream* of anything cert-related.

## Root cause

`upsertAppRouteDNSRecord` (`apps/api/src/services/dns.ts`) is a check-then-act with an
`await` in the gap:

```ts
const existing = await findDNSRecordByName(hostname, env);   // CHECK
...
method: existing ? 'PUT' : 'POST',                            // ACT
```

It is invoked concurrently — `deploy-release-callback.ts:306` and `:328` upsert every route
through `Promise.all`, and overlapping node release fetches run that whole handler more than
once. Two callers both observe "no record", both `POST`, and Cloudflare rejects the loser
with 81058. `!response.ok` threw straight out through `Promise.all`.

### Evidence this is a race, not a stale-record bug

1. The lookup is an exact `?type=A&name=` match, so "not found, then rejected as duplicate"
   can only mean the record appeared between the two calls.
2. Cloudflare's "An identical record already exists" (81058) means same name **and** type
   **and** content — a different-type collision returns 81053 instead. Identical content =
   the same node IP = two identical concurrent POSTs.
3. `deployment_release_events` for a live environment shows the handler running concurrently:
   two `fetch_started` events 1s apart, two `fetch_completed`, and `seq=4` written twice by
   two invocations that each allocated it independently.
4. The sibling `deleteAppRouteDNSRecord` is already documented as tolerant of "a record
   already removed by a concurrent caller". The delete path was hardened for concurrency;
   the create path never was.

## Fix

Treat Cloudflare's duplicate-record codes on the **create** path as a lost race: re-resolve
once and update the record in place. Bounded to a single retry.

- Scoped to codes `81057` / `81058` only. `81053` (different-type collision) is a genuine
  misconfiguration that retrying cannot fix and must keep surfacing.
- Scoped to the create path (`!existing`) — only that path can lose this race.
- `readCloudflareErrorDetail` reads `{ code, message }` in one pass, because a `Response`
  body can only be consumed once. `readCloudflareError` delegates to it, so every other
  call site is unchanged.

## Also fixed: the sibling in the same module

`createNodeBackendDNSRecord` (same file) had the identical race with a worse failure mode,
found by the architecture reviewer against this PR's own rule 68 §6. It was a blind POST
with no lookup at all. Two paths create that record — node provisioning
(`services/nodes.ts:373`) and the heartbeat backfill (`routes/node-lifecycle.ts:446`) — and
the loser threw. The catch at `node-lifecycle.ts:460` only stamps `nodes.error_message` and
leaves `backend_dns_record_id` NULL, so:

- every later heartbeat retried the same losing POST, forever (no backfill job exists), and
- node deletion, which deletes by that id, left the real record orphaned in the zone.

Now resolves the winner on conflict and returns its id, so the id gets persisted — which
fixes both consequences. 81057 does not guarantee matching content, so the IP is converged
with a `PUT` before the id is handed back.

## Tests

`apps/api/tests/unit/services/dns-app-routes.test.ts` (14 → 23):

- recovers when a concurrent caller wins the create (81057 and 81058)
- **control:** the UPDATE path does NOT retry on the same code — enforces rule 68 §4
- **control:** still throws on 81053 different-type collision, with no retry
- **control:** still throws on an unrelated failure (auth error)
- **regression:** `code: null` / stringified code preserve the real Cloudflare message
- retries at most once, then surfaces the duplicate error (no unbounded loop)
- two concurrent callers for the SAME hostname converge on one record, driven against a
  shared fake CF store so the interleaving picks the winner
- a losing route does not fail the `Promise.all` batch that gates the release fetch
- five tests for the `createNodeBackendDNSRecord` sibling (happy path, winner resolution,
  IP convergence on 81057, unrelated-failure control, unresolvable-winner control)

`apps/api/tests/unit/routes/deploy-release-callback.test.ts` (31 → 32):

- **vertical slice:** the endpoint still returns 200 when a route loses the create race

**Proven discriminating** (each verified once, then reverted):

| Mutation | Result |
|---|---|
| tolerance disabled | 4 race tests red, 10 controls green |
| `!existing` removed (widen to update path) | exactly the update-path control red |
| sibling conflict-recovery disabled | exactly the 2 sibling recovery tests red |
| `code: v.optional(v.number())` restored | exactly the 2 message-preservation tests red |
| pre-fix `dns.ts` + route suite | the new route test red; **the other 31 all passed** |

That last row is the point: the route suite could not observe the production 500 before
this PR added a test at the real entry point.

Full API unit suite: 8052/8053 passing, 0 collection errors, total reconciled 8043 → 8053
(+10). The single failure — `wakeSessionForSnapshotRecovery ... authorized restorable
claim` — is pre-existing and unrelated, verified by stashing these changes and re-running.

## Post-mortem

- **What broke:** deployments stalled with no DNS record and no certificate. The visible
  symptom (missing cert) was three layers downstream of the actual failure.
- **Root cause:** check-then-act against an external API that enforces its own uniqueness
  constraint, with the conflict treated as fatal.
- **Why it wasn't caught:** the existing tests covered create-when-absent and
  update-when-present — the two *sequential* outcomes. Nothing exercised two callers
  interleaving, even though the only production call site is a `Promise.all` fan-out.
- **Class of bug:** *check-then-act against a remote uniqueness constraint.* The local
  analogue (rule 45) is about Durable Object `await` interleaving and is solved with a
  mutex. A mutex is not proportionate across isolates when the remote API already
  adjudicates the conflict in one round trip, so the control-plane fix converges on its
  answer instead. Review then showed the overlap itself was preventable one layer up, on
  the caller: this PR does both — remove the cause (dedup guard) and survive it anyway
  (tolerance), because old agents keep retrying until they are replaced.
- **Aggravating factor:** the conflict was fatal on a path that gates an entire
  deployment. A recoverable, self-correcting condition became a permanent wedge.
- **Second class of bug, same incident:** *a watchdog fed by a signal that cannot observe
  the work it is guarding.* The apply idle timer was reset only by release events, and the
  longest step in an apply emits none — so the guard was structurally blind to exactly the
  operation most likely to be slow. The generalisation is rule 53's "a signal that cannot
  answer the question being asked of it", applied to a child process rather than a column.

## Process fix

`.claude/rules/68-external-api-check-then-act.md` — added.

## Live production evidence for both fixes (env `pr18-preview-3`, 2026-09-05)

Captured from `deployment_release_events` while this branch was being written. A
single environment, one node, 13:53 → 15:19:

```
 12x deployment.apply.fetch_started         13:53:16 -> 15:18:16
 11x deployment.apply.fetch_completed       13:53:18 -> 15:18:20
  6x deployment.apply.started               13:53:19 -> 15:18:21
  6x deployment.apply.compose_up_started    13:55:48 -> 15:19:20
  0x  (no compose_up_completed, ever)
```

Two independent confirmations:

1. **12 fetches for 6 applies — an exact 2:1 ratio.** Every apply is preceded by
   two `fetch_started`. The duplicate goroutine's `Apply()` is rejected by the
   engine's `applyMu.TryLock()`, which is why applies are half the fetches — but
   the fetch itself has already run, and the fetch is what upserts DNS. Those are
   12 opportunities to lose the create race, on one environment, in 85 minutes.
2. **6 compose_up starts, zero completions**, cycling roughly every 14 minutes —
   matching `DefaultDeployApplyIdleTimeout` of 15 minutes. Each apply reaches
   compose up, emits no further `ApplyProgressEvent`, and is SIGKILLed by the
   idle watchdog mid-pull.

This is why both fixes are in this PR: the DNS tolerance stops the race being
fatal, the dedup guard stops it being attempted twice per cycle, and the compose
liveness signal stops the apply being killed while it is genuinely working.

## Also fixed: the duplicate-spawn root cause (vm-agent)

`health.go:319-339` spawned a new `runDetachedDeploymentApply` goroutine on every
heartbeat for every pending release, with no in-flight check. `observed.AppliedSeq`
only advances after a *fully successful* apply, so any release slower than one
heartbeat interval accumulated another concurrent apply per tick — each re-running
the whole control-plane fetch (re-decrypting secrets, re-minting a registry
credential, regenerating presigned artifact URLs, re-signing the payload, and
racing on DNS).

Added `claimJob(jobID)`, an atomic claim over a shared in-flight set, applied to
both the apply path and the route-config path (which had the same defect). The
release runs via `defer` so a panicking apply cannot wedge a job id permanently —
that would silently stop the node applying that release at all.

## Also fixed: compose killed mid-pull by the apply idle watchdog

`runDetachedDeploymentApply` bounds the apply with a 15-minute **idle** timer that
is reset only by `ApplyProgressEvent`s — the same events that become
`deployment_release_events` rows. `docker compose up` emits exactly one
(`compose_up_started`) and then nothing until it returns, so a legitimately slow
image pull was indistinguishable from a hung apply and got SIGKILLed.

Compose streams pull/extract progress to stderr continuously, so that output is
now the liveness signal: `runCompose` wraps stderr in a `livenessWriter` that pokes
the watchdog on every write without persisting an event. This mirrors
`newIdleProgressReader`, which already does exactly this for artifact downloads.
Retained output is capped at 64 KiB for the error message, but the signal keeps
firing past the cap — otherwise a very chatty pull would be killed *because* it
produced too much output.

The cap retains the **tail**, not the head. The first cut kept the head, which the
go-specialist review caught: compose prints megabytes of "Pulling fs layer" and
then the actual failure (`manifest unknown`, `no such image`, `no space left on
device`) on its last lines, so head-retention would have discarded precisely the
diagnostic this buffer exists to preserve — silently re-introducing the
diagnosability bug being fixed three paragraphs above. Compaction is amortized
(the buffer is allowed to reach 2x the cap before trimming) so a multi-megabyte
pull costs O(total) copying rather than O(total x limit).

Also fixed the diagnostic that hid this: `health.go` overwrote the accurate
`"deployment apply stalled: no progress for 15m0s"` with the child's
`signal: killed`, which is a *consequence* of our own cancel. The stall is now the
primary error with the child result as context, so a self-inflicted timeout is no
longer indistinguishable from an OOM kill.

## Known limitation: the DNS fix tolerates the race rather than preventing it

The `dns.ts` tolerance is retained even though the dedup guard now prevents the overlap,
because `GET /deploy-release` is deliberately retry-tolerant by design — a node must be
able to re-fetch after a lost response, and old agents will keep doing so until they are
replaced (rule 54: the control-plane fix must stand alone for already-deployed agents).
Defence in depth is the point: the guard removes the cause, the tolerance survives it.

**Still unexplained:** the two original `fetch_started` events were 1 second apart, which
does not match the 60s default `HEARTBEAT_INTERVAL`. The `pr18-preview-3` data shows the
2:1 fetch/apply ratio the goroutine-per-heartbeat bug predicts, but the 1-second spacing
suggests a second trigger (a manual retry, a `deployment-env` poll, or a heartbeat burst)
that was not identified. The dedup guard closes the window regardless of which path spawned
the duplicate, since it keys on the job id rather than the caller.

## Related finding (NOT fixed here — separate issue)

**`deployment_volumes.status` is never re-polled.** It is written once from the
provider's transient attach response, and only the *detach* path ever writes
`available` (`deployment-volumes.ts:583-592` vs `:675-684`). A volume attached
mid-provision reads `creating` forever. Cosmetic — the heartbeat gate
`deploymentVolumesReadyForNode()` keys on `attached_server_id`, not `status` — but
actively misleading while debugging, and it cost real time during this
investigation. Filed as an idea; not bundled because it is unrelated to the
deployment-stall chain and would need its own provider-polling design.
