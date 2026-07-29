import { Hono } from 'hono';

import type { Env } from '../env';
import { getUserId, requireApproved, requireAuth } from '../middleware/auth';
import { errors } from '../middleware/error';
import { jsonValidator } from '../schemas';
import { ReportIssueSchema } from '../schemas/report';
import { isReportEnabled, submitReport } from '../services/report-issue';

export const reportIssueRoutes = new Hono<{ Bindings: Env }>();

reportIssueRoutes.get('/config', requireAuth(), requireApproved(), (c) => {
  return c.json({ enabled: isReportEnabled(c.env) });
});

reportIssueRoutes.post('/', requireAuth(), requireApproved(), jsonValidator(ReportIssueSchema), async (c) => {
  if (!isReportEnabled(c.env)) {
    throw errors.notFound('Report issue feature is not configured');
  }

  const userId = getUserId(c);
  const body = c.req.valid('json');

  const result = await submitReport(
    c.env,
    userId,
    body.title,
    body.description,
    body.consentToAttachRefs,
    body.refs,
  );

  return c.json(result, 201);
});
