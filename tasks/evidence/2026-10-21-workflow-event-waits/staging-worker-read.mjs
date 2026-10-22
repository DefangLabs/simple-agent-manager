const token = process.env.CF_TOKEN;
const accountId = process.env.CF_ACCOUNT_ID;
if (!token || !accountId) throw new Error('Managed Cloudflare credential and account required');
async function get(path) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`,
    {
      headers: { authorization: `Bearer ${token}` },
    }
  );
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(
      `Cloudflare API HTTP ${response.status}: ${(body.errors ?? []).map((e) => e.code).join(',')}`
    );
  }
  return body.result;
}
const scripts = await get('/workers/scripts');
const apiScripts = scripts.filter((script) =>
  /api|workspaces|sam/i.test(script.id ?? script.name ?? '')
);
const schedules = await Promise.all(
  apiScripts.map(async (script) => ({
    script: script.id,
    schedules: await get(`/workers/scripts/${script.id}/schedules`),
  }))
);
console.log(
  JSON.stringify({ scripts: scripts.map((script) => script.id ?? script.name), schedules })
);
