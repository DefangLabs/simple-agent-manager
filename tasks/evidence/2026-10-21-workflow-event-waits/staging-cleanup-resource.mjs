const API = 'https://api.sammy.party';
const [workspaceId, nodeId] = process.argv.slice(2);
if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(workspaceId ?? '') ||
    !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(nodeId ?? '')) {
  throw new Error('Expected exact workspace and node ULIDs');
}
const token = process.env.SAM_PLAYWRIGHT_PRIMARY_USER;
if (!token) throw new Error('Managed staging credential required');
const login = await fetch(`${API}/api/auth/token-login`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
});
if (login.status !== 200) throw new Error(`Staging login HTTP ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Staging login did not set a session cookie');
async function remove(path) {
  const response = await fetch(`${API}${path}`, { method: 'DELETE', headers: { Cookie: cookie } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`DELETE ${path} HTTP ${response.status}`);
  return { status: response.status, body };
}
const workspace = await remove(`/api/workspaces/${workspaceId}`);
const node = workspace.status === 202 ? 'deferred' : await remove(`/api/nodes/${nodeId}`);
console.log(JSON.stringify({ workspaceId, nodeId, workspace, node }));
