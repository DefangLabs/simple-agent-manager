const API = 'https://api.sammy.party';
const PROJECT = '01KWHD8XS7MQ7R6KWXJYRHDVH4';
const PROFILE = '01KWHD9FNBP9E9GWKQ1VSPR9Y1';
const token = process.env.SAM_PLAYWRIGHT_PRIMARY_USER;
if (!token) throw new Error('Managed staging credential required');

const login = await fetch(`${API}/api/auth/token-login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token }),
});
if (login.status !== 200) throw new Error(`Staging login HTTP ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Staging login did not set a session cookie');

const matchedPlan = {
  title: 'Staging event wait: match and progress',
  goal: 'Prove a project event advances a workflow after the planning task ends.',
  steps: [
    {
      key: 'signal', title: 'Listen for completed step', kind: 'wait',
      wait: {
        description: 'A workflow step completes in this project', source: 'sam.workflow',
        eventTypes: ['workflow.step.completed'], subject: null, timeoutMs: 300000,
      },
    },
    {
      key: 'producer', title: 'Produce the matching event',
      instructions: 'This is a bounded staging fixture. Immediately call complete_task with summary: Staging producer finished.',
      agentProfileId: PROFILE,
    },
    {
      key: 'followup', title: 'Advance after the event', after: ['signal'],
      instructions: 'This is a bounded staging fixture. Immediately call complete_task with summary: Staging followup finished.',
      agentProfileId: PROFILE,
    },
  ],
};
const timeoutPlan = {
  title: 'Staging event wait: nonmatch and timeout',
  goal: 'Prove unrelated events do not match and timeout blocks a dependent.',
  steps: [
    {
      key: 'absent', title: 'Listen for absent failure event', kind: 'wait',
      wait: {
        description: 'A workflow step fails in this project', source: 'sam.workflow',
        eventTypes: ['workflow.step.failed'], subject: null, timeoutMs: 45000,
      },
    },
    {
      key: 'blocked', title: 'Must stay blocked', after: ['absent'],
      instructions: 'This staging task must never start. If it starts, report a workflow failure.',
      agentProfileId: PROFILE,
    },
  ],
};
const prompt = [
  'Bounded staging verification of durable workflow event waits. Do not change repository files, settings, pool, or token limits.',
  'Call start_workflow_run exactly once for each JSON below, in this order, using the given requestKey and plan. Do not alter either plan.',
  JSON.stringify({ requestKey: 'event-waits-stage-match-064f51efa', plan: matchedPlan }),
  JSON.stringify({ requestKey: 'event-waits-stage-timeout-064f51efa', plan: timeoutPlan }),
  'Then call complete_task for this controller task with a summary containing both run IDs. Do not wait for either run and do not create other tasks.',
].join('\n\n');
const response = await fetch(`${API}/api/projects/${PROJECT}/tasks/submit`, {
  method: 'POST',
  headers: { Cookie: cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ message: prompt, taskMode: 'task', agentProfileId: PROFILE }),
});
const body = await response.json().catch(() => null);
if (response.status !== 202) throw new Error(`Submit fixture HTTP ${response.status}: ${JSON.stringify(body)}`);
console.log(JSON.stringify({ status: response.status, taskId: body?.task?.id ?? body?.taskId ?? body?.id }));
