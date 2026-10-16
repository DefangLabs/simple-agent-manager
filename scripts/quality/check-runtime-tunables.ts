/** Ratchet legacy Worker tunables while Phase 1 moves admin controls into D1. */
import { parse } from '@iarna/toml';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project, type Type } from 'ts-morph';

function isScalar(type: Type): boolean {
  if (type.isUnion()) return type.getUnionTypes().every(isScalar);
  return (
    type.isString() ||
    type.isStringLiteral() ||
    type.isNumber() ||
    type.isNumberLiteral() ||
    type.isBoolean() ||
    type.isBooleanLiteral() ||
    type.isUndefined() ||
    type.isNull()
  );
}

export function scalarEnvironmentNames(project: Project, path: string): string[] {
  const source = project.getSourceFileOrThrow(path);
  const contract = source.getInterfaceOrThrow('Env');
  return contract
    .getType()
    .getProperties()
    .filter((property) => isScalar(property.getTypeAtLocation(contract)))
    .map((property) => property.getName())
    .sort();
}

export function findNewTunables(
  current: readonly string[],
  legacy: readonly string[],
  bootstrapExceptions: Record<string, string>
): string[] {
  const allowed = new Set(legacy);
  return current.filter((name) => !allowed.has(name) && !bootstrapExceptions[name]?.trim());
}

export function checkRuntimeTunables(root: string): string[] {
  const baseline = JSON.parse(
    readFileSync(resolve(root, 'scripts/quality/runtime-tunables-baseline.json'), 'utf8')
  ) as {
    legacyEnvironment: string[];
    bootstrapExceptions: Record<string, string>;
  };
  const project = new Project({
    tsConfigFilePath: resolve(root, 'apps/api/tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });
  const path = resolve(root, 'apps/api/src/env.ts');
  project.addSourceFileAtPath(path);
  const scalar = scalarEnvironmentNames(project, path);
  const config = parse(readFileSync(resolve(root, 'apps/api/wrangler.toml'), 'utf8'));
  // Untyped vars must not evade the Env ratchet. Existing resource bindings are not scalars.
  const vars = Object.keys((config.vars ?? {}) as Record<string, unknown>);
  const newNames = findNewTunables(
    [...new Set([...scalar, ...vars])],
    baseline.legacyEnvironment,
    baseline.bootstrapExceptions
  );
  return newNames.map(
    (name) =>
      `${name}: add runtime controls to the admin settings registry; bootstrap-only exceptions need a documented reason in runtime-tunables-baseline.json.`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const issues = checkRuntimeTunables(resolve(import.meta.dirname, '../..'));
  if (issues.length) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
  } else console.log('Runtime tunable ratchet passed.');
}
