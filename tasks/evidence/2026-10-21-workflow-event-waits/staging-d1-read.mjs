const token = process.env.CF_TOKEN;
const accountId = process.env.CF_ACCOUNT_ID;
if (!token || !accountId) throw new Error('Managed Cloudflare credential and account required');
const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database`;
async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(
      `Cloudflare API HTTP ${response.status}: ${(body.errors ?? []).map((e) => e.code).join(',')}`
    );
  }
  return body.result;
}
const databases = await api('');
const staging = databases.find((db) => db.name === 'sam-staging');
if (!staging) throw new Error('Staging D1 database not found');
const query = async (sql, params) => {
  const result = await api(`/${staging.uuid}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql, params }),
  });
  return result[0]?.results ?? [];
};
const trigger = '9281a50a-7327-491d-b201-ee1eff84f6a3';
const follower = '6b0a157b-9122-44ad-bb3a-5eb454cb93b8';
const [outbox, events, runs, steps, outboxSummary, failedSummary] = await Promise.all([
  query(
    `SELECT id,source,event_type,subject_id,delivery_key,state,attempt_count,next_attempt_at,
            expires_at,admitted_event_id,admission_outcome,last_error,created_at,updated_at
       FROM project_event_source_outbox WHERE subject_id IN (?,?) ORDER BY created_at`,
    [trigger, follower]
  ),
  query(
    `SELECT id,mission_id,event_type,created_at FROM mission_workflow_events
      WHERE mission_id IN (?,?) ORDER BY created_at`,
    [trigger, follower]
  ),
  query(`SELECT id,status,updated_at,workflow_deadline_at FROM missions WHERE id IN (?,?)`, [
    trigger,
    follower,
  ]),
  query(
    `SELECT mission_id,step_key,state,wait_subscription_id,wait_registration_at,
            wait_listening_at,wait_timeout_at,wait_matched_event_json,updated_at
       FROM mission_steps WHERE mission_id IN (?,?) ORDER BY mission_id,ordinal`,
    [trigger, follower]
  ),
  query(
    `SELECT source,state,COUNT(*) AS count,MIN(created_at) AS oldest,MAX(updated_at) AS latest
       FROM project_event_source_outbox GROUP BY source,state ORDER BY source,state`,
    []
  ),
  query(
    `SELECT id,event_type,state,attempt_count,next_attempt_at,last_error,created_at,updated_at
       FROM project_event_source_outbox WHERE source='sam.workflow' AND state='retryable_failed'
       ORDER BY updated_at DESC LIMIT 10`,
    []
  ),
]);
console.log(JSON.stringify({ outbox, events, runs, steps, outboxSummary, failedSummary }));
