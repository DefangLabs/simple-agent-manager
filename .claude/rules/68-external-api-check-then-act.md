# A Conflict From a Remote Uniqueness Constraint Is a Signal, Not a Failure

## When This Applies

Any "create it if it isn't there" against an **external API that enforces its own
uniqueness constraint** — Cloudflare DNS records, cloud provider resources with unique
names, registry tags, Stripe idempotency keys, GitHub labels/branches. The shape is:

```ts
const existing = await find(name);        // CHECK
await (existing ? update(existing) : create());  // ACT  — await in the gap
```

It applies with full force when the call site is a fan-out (`Promise.all`, a sweep, a
retried handler), or when the same endpoint can run concurrently for the same resource.

## Why This Rule Exists

`upsertAppRouteDNSRecord` looked up an app-route A record and created it when absent.
`GET /api/nodes/:id/deploy-release` upserts every route through `Promise.all` before
returning the node's release payload, and overlapping release fetches ran that handler
concurrently. Two callers both saw "no record", both POSTed, and Cloudflare rejected the
loser with 81058 `An identical record already exists.`

That throw propagated out of `Promise.all`, 500'd the release fetch, and the node never
received its payload. A **self-correcting** condition — the record now exists, which is
exactly what the caller wanted — became a permanent deployment wedge, three layers
upstream of the symptom anyone could see (a missing TLS certificate).

The tell was already in the file: the sibling `deleteAppRouteDNSRecord` carried a comment
about tolerating "a record already removed by a concurrent caller", and had a test for it.
The delete path had been hardened for concurrency. The create path, with the identical
race, had not.

## Class of Bug

**Check-then-act against a remote uniqueness constraint, with the conflict treated as
fatal.** This is the cross-isolate sibling of `.claude/rules/45` (Durable Object
check-then-act across `await`).

A mutex is usually the *wrong* remedy here, but not an impossible one — a Durable Object
keyed on the resource can serialize callers across isolates. Reject it deliberately rather
than by assumption: it adds a hop, a failure mode, and a hot key to a path that the remote
API already adjudicates correctly and in one round trip. Where a cheap in-process dedup
already exists on the *caller* side, though, preventing the overlap is strictly better than
tolerating it — it removes all the other duplicated work too, not just the one operation
loud enough to fail. Check for that before settling for tolerance, and record which you
chose and why.

Tells:

- A `find` → `if (found) update else create` with an `await` between the two.
- A call site that fans the helper out over a list, or a handler that can run twice for the
  same resource (retry, poll, duplicate heartbeat).
- Error handling that treats every non-2xx identically (`if (!res.ok) throw`).
- A sibling function in the same file already documented as concurrency-tolerant.

## Hard Requirements

1. **Treat the "already exists" conflict as success-with-a-different-shape.** Re-resolve
   once and update in place, or return the existing resource. Do not fail the caller — the
   post-condition it asked for now holds.

2. **Distinguish "someone beat me to it" from "this can never work".** Branch on the
   provider's numeric/typed error code, not on message text. An identical-record conflict is
   recoverable; a *different-type* collision (Cloudflare 81053: an A/AAAA/CNAME already
   occupies that host), a quota error, or an auth error is not, and must keep surfacing.
   Enumerate the tolerated codes explicitly and comment why each neighbour is excluded
   (`.claude/rules/67`).

3. **Bound the recovery.** Exactly one re-resolve-and-update retry. A resource that keeps
   duplicating must surface the error rather than loop.

4. **Scope the tolerance to the path that can actually race.** Only the create path loses
   this race; do not widen the tolerance to the update path, where the same code means
   something else.

5. **Read the error body once.** A `Response` body can only be consumed once, so a helper
   that branches on the code must read code and message together rather than calling a
   message-only reader and then re-reading.

6. **Check the sibling operations in the same module, and fix them in the same change.**
   If delete is concurrency-tolerant and create is not (or vice versa), that asymmetry is
   the bug, not a style difference. This requirement caught a second live instance in the
   PR that introduced this rule: `createNodeBackendDNSRecord` in the same file was a blind
   POST with no lookup at all, and its loser's failure mode was worse — the caller stamps
   `nodes.error_message`, leaves `backend_dns_record_id` NULL, retries the same losing POST
   on every heartbeat forever, and orphans the real record at delete time because deletion
   keys on that null id. Do not ship the rule without applying it to its own module.

7. **Prefer prior art in this repo over a new invention.** `ensureBranchExists`
   (`apps/api/src/services/github-app.ts`) already solved this class against the GitHub API,
   treating a `422` on create as `status: 'exists'`. Match the existing shape.

## Required Tests

- **The race, per tolerated code:** lookup returns empty, create returns the conflict,
  re-resolve returns the winner's resource, update succeeds. Assert the returned id and that
  the retry used `PUT` against the winner.
- **A control per excluded neighbour:** the different-type collision and an unrelated
  failure (auth/quota) must still throw, with **no** retry attempted.
- **Boundedness:** a create that keeps conflicting surfaces the error after one retry.
- **The `!create`-path guard has its own control.** Assert the *update* path still throws on
  the same code. Without it, deleting the `!existing &&` conjunct — a one-token diff that
  widens the tolerance exactly as requirement 4 forbids — leaves the suite fully green.
- **The real call-site shape:** run the helper through the same `Promise.all` fan-out
  production uses, with one member losing the race, and assert the whole batch resolves.
  Drive it against a small shared fake store keyed by resource name, so the interleaving
  decides the winner rather than a pre-scripted call sequence; a scripted "loser" over two
  *different* resources proves only that there is no cross-call state leakage.
- **A route/handler-level test at the real entry point.** Testing the helper alone does not
  prove the endpoint survives: on the pre-fix code every one of the 31 existing tests for
  the affected route passed while production was returning 500 (rule 35, rule 62).
- **Proven discriminating:** disable the tolerance and confirm exactly the race tests go red
  while every control stays green. Verify this once.

## Quick Compliance Check

- [ ] The conflict response is treated as convergence, not failure
- [ ] Tolerated codes are enumerated by code, with excluded neighbours justified in a comment
- [ ] Recovery is bounded to a single retry
- [ ] Tolerance is scoped to the create path only
- [ ] The error body is read once for both code and message
- [ ] Sibling operations in the module were checked for the same asymmetry
- [ ] Race tests, per-neighbour controls, boundedness, and a fan-out test all exist
- [ ] The race tests were verified to fail with the tolerance removed

## References

- Task: `tasks/active/2026-09-05-fix-app-route-dns-upsert-race.md`
- Implementation: `apps/api/src/services/dns.ts` (`upsertAppRouteDNSRecord`,
  `CF_DNS_DUPLICATE_RECORD_CODES`); call sites `apps/api/src/routes/deploy-release-callback.ts:306,328`
- `.claude/rules/45-durable-object-concurrency-mutex.md` — the same bug within one DO, where
  a mutex *is* the remedy
- `.claude/rules/67-shared-predicates-that-trigger-actions.md` — keep the tolerated set no
  coarser than the evidence
- `.claude/rules/11-fail-fast-patterns.md` — fail closed, but only on genuinely fatal conditions
