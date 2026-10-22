const API = 'https://api.sammy.party';
const token = process.env.SAM_PLAYWRIGHT_PRIMARY_USER;
if (!token) throw new Error('Managed staging credential required');
const login = await fetch(`${API}/api/auth/token-login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token }),
});
if (login.status !== 200) throw new Error(`Staging login HTTP ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const response = await fetch(`${API}/api/admin/runtime-controls`, { headers: { Cookie: cookie } });
const body = await response.json().catch(() => null);
console.log(JSON.stringify({ status: response.status, body }));
