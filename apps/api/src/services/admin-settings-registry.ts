/** Phase 1 only. Existing readers are wired here after the recovery wave releases integration. */
import type { Env } from '../env';
import {
  CONNECTOR_DEFAULTS,
  type ConnectorSettingKey,
  validateConnectorSetting,
} from './connector-settings-definition';
import { ENV_KEYS, SECRET_KINDS, SETTING_KEYS } from './platform-config-store';

export type AdminSettingValue = boolean | number | string | readonly string[] | null;
export type AdminSettingType = 'boolean' | 'integer' | 'string' | 'string-list' | 'enum';
export type AdminSettingName =
  | `connector.${ConnectorSettingKey}`
  | 'integration.github.clientId'
  | 'integration.github.clientSecret'
  | 'integration.google.clientId'
  | 'integration.google.clientSecret'
  | 'integration.googleInfrastructure.clientId'
  | 'integration.googleInfrastructure.clientSecret'
  | 'integration.gitlab.host'
  | 'integration.gitlab.clientId'
  | 'integration.gitlab.clientSecret'
  | 'operations.cronSweepsEnabled'
  | 'operations.doAlarmsEnabled'
  | 'operations.stalledTaskClassifierEnabled'
  | 'trials.enabled';
export interface AdminSettingDefinition {
  readonly name: AdminSettingName;
  readonly type: AdminSettingType;
  readonly defaultValue: AdminSettingValue;
  readonly category: 'OAuth' | 'Connector' | 'Operations' | 'Trials';
  readonly description: string;
  readonly secret: boolean;
  readonly risky: boolean;
  readonly legacyEnvironment?: keyof Env;
  readonly legacyKv?: 'cron' | 'alarms' | 'trials';
  readonly credential?: { readonly provider: string; readonly kind: string };
  readonly range?: { readonly min: number; readonly max: number };
  readonly choices?: readonly string[];
  readonly validate: (value: unknown) => boolean;
}

const connectorDescriptions: Record<ConnectorSettingKey, string> = {
  enabled: 'Allow authenticated external clients to use the SAM Connector.',
  writeEnabled: 'Allow external Connector clients to perform write operations.',
  clientRegistration: 'Choose open or allowlisted OAuth client registration.',
  allowedRedirectHosts: 'Allowed OAuth redirect hosts; loopback allows local clients.',
  accessTokenTtlSeconds: 'Connector access token lifetime in seconds.',
  refreshTokenTtlSeconds: 'Connector refresh token lifetime in seconds.',
  readRateLimitPerMinute: 'Maximum Connector reads per minute.',
  writeRateLimitPerMinute: 'Maximum Connector writes per minute.',
  maxStartsPerUserPerHour: 'Maximum Connector task starts per user per hour.',
  maxStartsPerUserPerDay: 'Maximum Connector task starts per user per day.',
};

const connectorEnvironment: Record<ConnectorSettingKey, keyof Env> = {
  enabled: 'CONNECTOR_ENABLED',
  writeEnabled: 'CONNECTOR_WRITE_ENABLED',
  clientRegistration: 'CONNECTOR_CLIENT_REGISTRATION',
  allowedRedirectHosts: 'CONNECTOR_ALLOWED_REDIRECT_HOSTS',
  accessTokenTtlSeconds: 'CONNECTOR_ACCESS_TOKEN_TTL_SECONDS',
  refreshTokenTtlSeconds: 'CONNECTOR_REFRESH_TOKEN_TTL_SECONDS',
  readRateLimitPerMinute: 'CONNECTOR_READ_RATE_LIMIT_PER_MINUTE',
  writeRateLimitPerMinute: 'CONNECTOR_WRITE_RATE_LIMIT_PER_MINUTE',
  maxStartsPerUserPerHour: 'CONNECTOR_MAX_STARTS_PER_USER_PER_HOUR',
  maxStartsPerUserPerDay: 'CONNECTOR_MAX_STARTS_PER_USER_PER_DAY',
};

function connectorDefinition(key: ConnectorSettingKey): AdminSettingDefinition {
  const value = CONNECTOR_DEFAULTS[key];
  let type: AdminSettingType = 'integer';
  if (key === 'clientRegistration') type = 'enum';
  else if (Array.isArray(value)) type = 'string-list';
  else if (typeof value === 'boolean') type = 'boolean';
  return {
    name: `connector.${key}`,
    type,
    // Reuse the shipped defaults; integration will move their ownership here without duplication.
    defaultValue: Array.isArray(value) ? Object.freeze([...value]) : value,
    category: 'Connector',
    description: connectorDescriptions[key],
    secret: false,
    risky: true,
    legacyEnvironment: connectorEnvironment[key],
    ...(type === 'integer'
      ? { range: { min: key.endsWith('TtlSeconds') ? 60 : 1, max: 2147483647 } }
      : {}),
    ...(type === 'enum' ? { choices: ['open', 'allowlist'] } : {}),
    validate: (input) => validateConnectorSetting(key, input),
  };
}

function oauthDefinition(
  name: AdminSettingName,
  legacyEnvironment: keyof Env,
  description: string,
  credential?: AdminSettingDefinition['credential']
): AdminSettingDefinition {
  return {
    name,
    type: 'string',
    defaultValue: null,
    category: 'OAuth',
    description,
    secret: Boolean(credential),
    risky: true,
    legacyEnvironment,
    credential,
    validate: (value) => typeof value === 'string' && value.trim().length >= (credential ? 8 : 6),
  };
}

function switchDefinition(
  name: AdminSettingName,
  defaultValue: boolean,
  category: AdminSettingDefinition['category'],
  description: string,
  legacy: Pick<AdminSettingDefinition, 'legacyEnvironment' | 'legacyKv'>
): AdminSettingDefinition {
  return {
    name,
    type: 'boolean',
    defaultValue,
    category,
    description,
    secret: false,
    risky: true,
    ...legacy,
    validate: (value) => typeof value === 'boolean',
  };
}

function validGitLabHost(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value.trim());
    const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname);
    return (
      (url.protocol === 'https:' || (url.protocol === 'http:' && local)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/'
    );
  } catch {
    return false;
  }
}

const definitions: AdminSettingDefinition[] = [
  ...Object.keys(CONNECTOR_DEFAULTS).map((key) => connectorDefinition(key as ConnectorSettingKey)),
  oauthDefinition(
    SETTING_KEYS.githubClientId,
    ENV_KEYS.githubClientId,
    'GitHub login OAuth client ID.'
  ),
  oauthDefinition(
    'integration.github.clientSecret',
    ENV_KEYS.githubClientSecret,
    'GitHub login OAuth client secret.',
    { provider: 'github', kind: SECRET_KINDS.githubClientSecret }
  ),
  oauthDefinition(
    SETTING_KEYS.googleClientId,
    ENV_KEYS.googleClientId,
    'Google login OAuth client ID; separate from infrastructure access.'
  ),
  oauthDefinition(
    'integration.google.clientSecret',
    ENV_KEYS.googleClientSecret,
    'Google login OAuth client secret.',
    { provider: 'google', kind: SECRET_KINDS.googleClientSecret }
  ),
  oauthDefinition(
    SETTING_KEYS.googleInfrastructureClientId,
    ENV_KEYS.googleInfrastructureClientId,
    'Google infrastructure OAuth client ID; separate from login.'
  ),
  oauthDefinition(
    'integration.googleInfrastructure.clientSecret',
    ENV_KEYS.googleInfrastructureClientSecret,
    'Google infrastructure OAuth client secret.',
    { provider: 'google-infrastructure', kind: SECRET_KINDS.googleInfrastructureClientSecret }
  ),
  oauthDefinition(
    SETTING_KEYS.gitlabClientId,
    ENV_KEYS.gitlabClientId,
    'GitLab login OAuth client ID.'
  ),
  oauthDefinition(
    'integration.gitlab.clientSecret',
    ENV_KEYS.gitlabClientSecret,
    'GitLab login OAuth client secret.',
    { provider: 'gitlab', kind: SECRET_KINDS.gitlabClientSecret }
  ),
  {
    ...oauthDefinition(
      SETTING_KEYS.gitlabHost,
      ENV_KEYS.gitlabHost,
      'GitLab OAuth host, without paths or credentials.'
    ),
    validate: validGitLabHost,
  },
  switchDefinition(
    'operations.cronSweepsEnabled',
    true,
    'Operations',
    'Allow recurring cron recovery and cleanup sweeps.',
    { legacyKv: 'cron' }
  ),
  switchDefinition(
    'operations.doAlarmsEnabled',
    true,
    'Operations',
    'Allow Durable Object alarm work; disabled alarms re-arm for later.',
    { legacyKv: 'alarms' }
  ),
  switchDefinition(
    'trials.enabled',
    false,
    'Trials',
    'Allow anonymous trials. Fresh installs remain disabled.',
    { legacyKv: 'trials' }
  ),
  switchDefinition(
    'operations.stalledTaskClassifierEnabled',
    true,
    'Operations',
    'Allow stalled-task classification; existing liveness checks remain active.',
    { legacyEnvironment: 'STALLED_TASK_CLASSIFIER_ENABLED' }
  ),
];

export const ADMIN_SETTINGS_REGISTRY: readonly AdminSettingDefinition[] = Object.freeze(
  definitions.map((definition) =>
    Object.freeze({
      ...definition,
      ...(definition.range ? { range: Object.freeze(definition.range) } : {}),
      ...(definition.choices ? { choices: Object.freeze(definition.choices) } : {}),
      ...(definition.credential ? { credential: Object.freeze(definition.credential) } : {}),
    })
  )
);

/** Never resolve untrusted names through inherited object properties. */
export function findAdminSetting(name: string): AdminSettingDefinition | undefined {
  return ADMIN_SETTINGS_REGISTRY.find((definition) => definition.name === name);
}

/** Metadata only. Secret effective values must be separately projected to configured/source. */
export function publicAdminSettingDefinition(definition: AdminSettingDefinition) {
  return {
    name: definition.name,
    type: definition.type,
    defaultValue: definition.defaultValue,
    category: definition.category,
    description: definition.description,
    secret: definition.secret,
    risky: definition.risky,
    range: definition.range,
    choices: definition.choices,
  };
}
