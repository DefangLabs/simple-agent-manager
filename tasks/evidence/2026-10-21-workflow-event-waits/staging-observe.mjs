const API = 'https://api.sammy.party';
const PROJECT = '01KWHD8XS7MQ7R6KWXJYRHDVH4';
const TASKS = ['01M5GJ6XEGA772608H8VHBWQQM', '01M5GJVH546BEPPNF0TA3CXC0H'];
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

async function request(path) {
  const response = await fetch(`${API}${path}`, { headers: { Cookie: cookie } });
  if (!response.ok) throw new Error(`GET ${path} HTTP ${response.status}`);
  return response.json();
}
const controllers = await Promise.all(TASKS.map(async (id) => {
  const result = await request(`/api/projects/${PROJECT}/tasks/${id}`);
  const row = result.task ?? result;
  return { id, status: row.status, workspaceId: row.workspaceId };
}));
const nodes = await request('/api/nodes');
const workspaces = await request(`/api/workspaces?projectId=${PROJECT}`);
const list = await request(`/api/projects/${PROJECT}/workflows?limit=10`);
const runs = (list.runs ?? []).filter((r) => r.title.startsWith('Staging event wait:') || r.title === 'Staging wait signal run');
const details = await Promise.all(runs.map(async (r) => {
  const detail = await request(`/api/projects/${PROJECT}/workflows/${r.id}`);
  const run = detail.run ?? detail;
  return {
    id: run.id,
    title: run.title,
    status: run.status,
    steps: run.steps.map((s) => ({
      key: s.key,
      kind: s.kind,
      status: s.status,
      reason: s.reason,
      taskId: s.taskId,
      sessionId: s.sessionId,
      wait: s.wait,
    })),
    activity: run.activity,
  };
}));
const stepTaskIds = [...new Set(details.flatMap((r) => r.steps.map((s) => s.taskId).filter(Boolean)))];
const stepTasks = await Promise.all(stepTaskIds.map(async (id) => {
  const result = await request(`/api/projects/${PROJECT}/tasks/${id}`);
  const row = result.task ?? result;
  return { id, status: row.status, workspaceId: row.workspaceId, executionStep: row.executionStep };
}));
console.log(JSON.stringify({
  controllers,
  nodes: nodes.map((n) => ({ id: n.id, status: n.status, workspaceCount: n.workspaceCount })),
  workspaces: workspaces.map((w) => ({ id: w.id, nodeId: w.nodeId, status: w.status })),
  stepTasks,
  runs: details,
}));
