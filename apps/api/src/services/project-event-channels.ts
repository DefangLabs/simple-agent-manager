import type { ProjectEventSubscriptionAgentCaller } from '@simple-agent-manager/shared';
import { drizzle } from 'drizzle-orm/d1';

import * as schema from '../db/schema';
import type { Env } from '../env';
import { errors } from '../middleware/error';
import { requireProjectCapability } from '../middleware/project-auth';
import * as projectData from './project-data';
import { resolveSurfaceContext } from './project-event-subscriptions-access';

export async function channelCallerContext(
  env: Env,
  caller: ProjectEventSubscriptionAgentCaller,
  capability: 'task:read' | 'task:write' = 'task:read'
) {
  const context = await resolveSurfaceContext(env, caller);
  if (context.callerKind !== 'agent' || !context.target.sessionId) {
    throw errors.forbidden('An active task-backed session is required');
  }
  const sessionId = context.target.sessionId;
  const session = await projectData.getSession(env, context.projectId, sessionId);
  if (!session || session.status !== 'active' || session.taskId !== context.target.taskId) {
    throw errors.forbidden('The calling chat is not active for this task');
  }
  await requireProjectCapability(
    drizzle(env.DATABASE, { schema }),
    context.projectId,
    caller.userId,
    capability
  );
  return { ...context, target: { ...context.target, sessionId } };
}
