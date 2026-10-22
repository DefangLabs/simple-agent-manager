const API = 'https://api.sammy.party';
const PROJECT = '01KWHD8XS7MQ7R6KWXJYRHDVH4';
const token = process.env.SAM_PLAYWRIGHT_PRIMARY_USER;
if (!token) throw new Error('Managed staging credential required');
const login = await fetch(`${API}/api/auth/token-login`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
});
if (login.status !== 200) throw new Error(`Staging login HTTP ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const response = await fetch(`${API}/api/admin/project-events/${PROJECT}/inspector?limit=100`, {
  headers: { Cookie: cookie },
});
if (!response.ok) throw new Error(`Staging inspector HTTP ${response.status}`);
const body = await response.json();
console.log(JSON.stringify({
  generatedAt: body.generatedAt,
  totals: body.totals,
  subscriptions: body.subscriptions.filter((s) => s.owner?.id?.startsWith('workflow:')).map((s) => ({
    id: s.id, owner: s.owner, state: s.state, filter: s.filter, createdAt: s.createdAt,
    expiresAt: s.expiresAt, lastMatchedAt: s.lastMatchedAt,
  })),
  events: body.events.filter((e) => e.source === 'sam.workflow').map((e) => ({
    id: e.id, eventType: e.eventType, subject: e.subject, occurredAt: e.occurredAt,
    receivedAt: e.receivedAt,
  })),
  matches: body.matches,
  hasMore: body.hasMore,
}));
