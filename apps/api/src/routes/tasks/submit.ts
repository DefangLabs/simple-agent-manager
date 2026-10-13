import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';

import * as schema from '../../db/schema';
import type { Env } from '../../env';
import { markTaskSubmitOperation } from '../../lib/task-submit-diagnostics';
import { getAuth, requireApproved, requireAuth } from '../../middleware/auth';
import { errors } from '../../middleware/error';
import { requireProjectCapability } from '../../middleware/project-auth';
import { jsonValidator, SubmitTaskSchema } from '../../schemas';
import { cliOperationReceipt } from '../../services/cli-operation-receipts';
import { submitTask } from '../../services/submit-task';
import { requireRepositoryUserAccess } from '../projects/_helpers';
const submitRoutes = new Hono<{ Bindings: Env }>();
submitRoutes.post(
  '/submit',
  requireAuth(),
  requireApproved(),
  jsonValidator(SubmitTaskSchema),
  async (c, next) => {
    const projectId = c.req.param('projectId');
    if (!projectId) throw errors.badRequest('projectId is required');
    try {
      await requireProjectCapability(
        drizzle(c.env.DATABASE, { schema }),
        projectId,
        getAuth(c).user.id,
        'task:write'
      );
    } catch (error) {
      markTaskSubmitOperation(error, 'route_project_authorization');
      throw error;
    }
    return cliOperationReceipt(c, next);
  },
  async (c) => {
    const projectId = c.req.param('projectId');
    if (!projectId) throw errors.badRequest('projectId is required');
    return c.json(
      await submitTask(
        c.env,
        getAuth(c).user,
        projectId,
        c.req.valid('json'),
        (promise) => c.executionCtx.waitUntil(promise),
        'web',
        undefined,
        (project) =>
          requireRepositoryUserAccess(
            c,
            drizzle(c.env.DATABASE, { schema }),
            project,
            getAuth(c).user.id
          )
      ),
      202
    );
  }
);

export { submitRoutes };
