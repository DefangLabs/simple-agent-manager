const API = 'https://api.sammy.party';
const WORKSPACE = '01M5GJCBM24SDPT9Q07ACT350T';
const NODE = '01M5GJ78CZC5CMMVKTD79DG9BK';
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
const workspace = await remove(`/api/workspaces/${WORKSPACE}`);
if (workspace.status === 202) {
  console.log(JSON.stringify({ workspace, node: 'deferred until workspace deletion finishes' }));
} else {
  const node = await remove(`/api/nodes/${NODE}`);
  console.log(JSON.stringify({ workspace, node }));
}
