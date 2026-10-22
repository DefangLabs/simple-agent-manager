const API = 'https://api.sammy.party';
const PROJECT = '01KWHD8XS7MQ7R6KWXJYRHDVH4';
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

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { Cookie: cookie, 'content-type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} HTTP ${response.status}`);
  return body;
}

const [me, project, profiles, runs] = await Promise.all([
  request('/api/auth/me'),
  request(`/api/projects/${PROJECT}`),
  request(`/api/projects/${PROJECT}/agent-profiles`),
  request(`/api/projects/${PROJECT}/workflows?limit=3`),
]);
console.log(JSON.stringify({
  actorId: (me.user ?? me).id,
  projectId: project.id ?? project.project?.id,
  profiles: (profiles.items ?? profiles.profiles ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    agentType: p.agentType,
    runtime: p.runtime,
  })),
  recentRuns: (runs.runs ?? []).map((r) => ({ id: r.id, status: r.status })),
}));
