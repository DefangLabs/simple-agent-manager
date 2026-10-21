/**
 * Custom Valibot validator hook for Hono that formats validation errors
 * to match the existing API error response format: { error: string, message: string }.
 */
import { vValidator } from '@hono/valibot-validator';
import type { MiddlewareHandler } from 'hono';
import type {
  GenericSchema,
  GenericSchemaAsync,
  InferInput,
  InferOutput,
} from 'valibot';
import * as v from 'valibot';

import { log } from '../lib/logger';

/**
 * `vValidator`'s own return type is inferred through several internal,
 * unexported Hono types, which TS can't name in a declaration file. This
 * public-facing shape is what callers actually rely on: a 'json' validator
 * middleware that narrows `c.req.valid('json')` to the schema's output.
 */
type JsonValidatorMiddleware<T extends GenericSchema | GenericSchemaAsync> = MiddlewareHandler<
  any,
  string,
  { in: { json: InferInput<T> }; out: { json: InferOutput<T> } }
>;

/**
 * Formats Valibot issues into a human-readable error message string.
 */
export function formatIssues(issues: v.BaseIssue<unknown>[]): string {
  return issues
    .map((issue) => {
      const path = issue.path?.map((p) => p.key).join('.') || 'body';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Wraps `vValidator` with a custom error hook that returns 400 with the standard
 * `{ error: "BAD_REQUEST", message: "..." }` format on validation failure.
 *
 * Use for routes where the request body is required and must be valid JSON.
 *
 * Also wraps the middleware in a try/catch to handle JSON parse errors from
 * invalid request bodies (vValidator calls c.req.json() which throws on bad JSON).
 */
export function jsonValidator<T extends GenericSchema | GenericSchemaAsync>(
  schema: T
): JsonValidatorMiddleware<T> {
  const validator = vValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: 'BAD_REQUEST',
          message: formatIssues(result.issues),
        },
        400
      );
    }
  });

  // Wrap to catch JSON parse errors (SyntaxError from c.req.json())
  const wrapped = async (c: Parameters<typeof validator>[0], next: Parameters<typeof validator>[1]) => {
    try {
      return await validator(c, next);
    } catch (err) {
      if (err instanceof SyntaxError || (err instanceof Error && err.message.includes('JSON'))) {
        return c.json(
          {
            error: 'BAD_REQUEST',
            message: 'Invalid JSON in request body',
          },
          400
        );
      }
      throw err;
    }
  };
  return wrapped as JsonValidatorMiddleware<T>;
}

/**
 * Parses and validates an optional JSON body using Valibot.
 * Returns the fallback value if the body cannot be parsed as JSON or fails validation.
 *
 * Only use for schemas where ALL fields are optional. If any field is required
 * and missing, use jsonValidator() middleware instead — it returns 400 to the client.
 *
 * Use for routes where the body may be empty/missing (the `.catch(() => ...)` pattern).
 */
export async function parseOptionalBody<T extends GenericSchema>(
  req: Request,
  schema: T,
  fallback: InferOutput<T>
): Promise<InferOutput<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fallback;
  }
  const result = v.safeParse(schema, raw);
  if (!result.success) {
    // Log for observability — client sent valid JSON but wrong shape
    log.warn('parseOptionalBody_validation_failed', {
      issues: result.issues.map((i) => i.message),
    });
    return fallback;
  }
  return result.output;
}

/** Type helper to extract the validated output type from a schema */
export type ValidatedBody<T extends GenericSchema | GenericSchemaAsync> = InferOutput<T>;
