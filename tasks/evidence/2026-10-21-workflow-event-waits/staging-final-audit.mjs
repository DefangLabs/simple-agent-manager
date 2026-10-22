// One token login for the post-window read-only audit. Do not submit fixtures here.
import { createRequire } from 'node:module';

const API = 'https://api.sammy.party';
const PROJECT = '01KWHD8XS7MQ7R6KWXJYRHDVH4';
const RUNS = ['9281a50a-7327-491d-b201-ee1eff84f6a3', '6b0a157b-9122-44ad-bb3a-5eb454cb93b8'];
const token = process.env.SAM_PLAYWRIGHT_PRIMARY_USER;
if (!token) throw new Error('Managed staging credential required');
const login = await fetch(`${API}/api/auth/token-login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token }),
});
if (login.status !== 200) {
  throw new Error(
    `Staging login HTTP ${login.status}; retry-after=${login.headers.get('retry-after') ?? 'none'}`
  );
}
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Staging login did not set a session cookie');
async function get(path) {
  const response = await fetch(`${API}${path}`, { headers: { Cookie: cookie } });
  if (!response.ok) throw new Error(`GET ${path} HTTP ${response.status}`);
  return response.json();
}
const [trigger, follower, nodes, workspaces, inspector] = await Promise.all([
  ...RUNS.map((id) => get(`/api/projects/${PROJECT}/workflows/${id}`).then((r) => r.run ?? r)),
  get('/api/nodes'),
  get(`/api/workspaces?projectId=${PROJECT}`),
  get(`/api/admin/project-events/${PROJECT}/inspector?limit=100`).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  })),
]);
function projectRun(run) {
  return {
    id: run.id,
    status: run.status,
    steps: run.steps.map((step) => ({
      key: step.key,
      kind: step.kind,
      status: step.status,
      reason: step.reason,
      taskId: step.taskId,
      sessionId: step.sessionId,
      wait: step.wait,
    })),
    activity: run.activity,
  };
}
async function browserAudit() {
  const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
  const { chromium, devices } = require('@playwright/test');
  const separator = cookie.indexOf('=');
  const name = cookie.slice(0, separator);
  const value = cookie.slice(separator + 1);
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  try {
    for (const viewport of [undefined, devices['iPhone 13']]) {
      const context = await browser.newContext(viewport ? { ...viewport } : undefined);
      await context.addCookies([{ name, value, url: API }]);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const response = await page.goto(
        `https://app.sammy.party/projects/${PROJECT}/automation/workflows/${RUNS[1]}`,
        { waitUntil: 'domcontentloaded', timeout: 45000 }
      );
      await page
        .getByText('Staging event wait: correlated match')
        .first()
        .waitFor({ timeout: 30000 });
      const body = await page.locator('body').innerText();
      checks.push({
        viewport: viewport ? 'phone' : 'desktop',
        httpStatus: response?.status() ?? null,
        hasWaitDescription: body.includes('The specified staging workflow needs attention'),
        hasAdvancedStep: body.includes('Advance after the match'),
        pageErrors: errors,
      });
      await context.close();
    }
    return checks;
  } finally {
    await browser.close();
  }
}
const browser = await browserAudit().catch((error) => ({
  error: error instanceof Error ? error.message : String(error),
}));
console.log(
  JSON.stringify({
    observedAt: new Date().toISOString(),
    runs: [projectRun(trigger), projectRun(follower)],
    nodes: nodes.map((node) => ({ id: node.id, status: node.status })),
    workspaces: workspaces.map((workspace) => ({ id: workspace.id, status: workspace.status })),
    inspector: inspector.error
      ? { error: inspector.error }
      : {
          generatedAt: inspector.generatedAt,
          subscriptions: inspector.subscriptions
            .filter(
              (subscription) =>
                subscription.owner?.id?.startsWith('workflow:') &&
                RUNS.some((id) => subscription.owner.id.includes(id))
            )
            .map((subscription) => ({
              id: subscription.id,
              owner: subscription.owner,
              state: subscription.state,
              filter: subscription.filter,
              lastMatchedAt: subscription.lastMatchedAt,
            })),
          events: inspector.events
            .filter((event) => event.source === 'sam.workflow' && RUNS.includes(event.subject?.id))
            .map((event) => ({
              id: event.id,
              eventType: event.eventType,
              subject: event.subject,
              occurredAt: event.occurredAt,
              receivedAt: event.receivedAt,
            })),
          matches: inspector.matches,
          hasMore: inspector.hasMore,
        },
    browser,
  })
);
