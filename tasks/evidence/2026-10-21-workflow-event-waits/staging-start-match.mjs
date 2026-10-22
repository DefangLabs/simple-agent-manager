const API = 'https://api.sammy.party';
const PROJECT = '01KWHD8XS7MQ7R6KWXJYRHDVH4';
const PROFILE = '01KWHD9FNBP9E9GWKQ1VSPR9Y1';
const token = process.env.SAM_PLAYWRIGHT_PRIMARY_USER;
if (!token) throw new Error('Managed staging credential required');
const login = await fetch(`${API}/api/auth/token-login`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
});
if (login.status !== 200) throw new Error(`Staging login HTTP ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Staging login did not set a session cookie');

const trigger = {
  requestKey: 'event-waits-stage-signal-v2-064f51efa',
  plan: {
    title: 'Staging wait signal run',
    goal: 'Emit a scoped workflow run needs-attention event after a finite wait timeout.',
    steps: [{
      key: 'timeout', title: 'Emit a timeout signal', kind: 'wait',
      wait: {
        description: 'A staging event that will not arrive', source: 'staging.fixture.absent',
        eventTypes: ['fixture.never'], subject: null, timeoutMs: 180000,
      },
    }],
  },
};
const matchedTemplate = {
  requestKey: 'event-waits-stage-match-v2-064f51efa',
  plan: {
    title: 'Staging event wait: correlated match',
    goal: 'Match the signal run by durable event identity and advance a dependent wait.',
    steps: [
      {
        key: 'signal', title: 'Match the specific timeout run', kind: 'wait',
        wait: {
          description: 'The specified staging workflow needs attention', source: 'sam.workflow',
          eventTypes: ['workflow.run.needs_attention'],
          subject: { type: 'workflow_run', id: 'REPLACE_WITH_FIRST_RUN_ID' }, timeoutMs: 900000,
        },
      },
      {
        key: 'advanced', title: 'Advance after the match', kind: 'wait', after: ['signal'],
        wait: {
          description: 'A second staging event that will not arrive', source: 'staging.fixture.absent',
          eventTypes: ['fixture.after-match'], subject: null, timeoutMs: 45000,
        },
      },
    ],
  },
};
const prompt = [
  'Bounded staging fixture. Do not change files, settings, pool, or token limits. Start exactly two workflows via start_workflow_run.',
  'First submit this exact timeout signal run:', JSON.stringify(trigger),
  'Copy the returned runId. In the second JSON, replace only REPLACE_WITH_FIRST_RUN_ID with that exact runId, then submit it:',
  JSON.stringify(matchedTemplate),
  'Immediately call complete_task for this controller with both run IDs in the summary. Do not wait for either run or create other tasks.',
].join('\n\n');
const response = await fetch(`${API}/api/projects/${PROJECT}/tasks/submit`, {
  method: 'POST', headers: { Cookie: cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ message: prompt, taskMode: 'task', agentProfileId: PROFILE }),
});
const body = await response.json().catch(() => null);
if (response.status !== 202) throw new Error(`Submit fixture HTTP ${response.status}`);
console.log(JSON.stringify({ status: response.status, taskId: body?.task?.id ?? body?.taskId ?? body?.id }));
