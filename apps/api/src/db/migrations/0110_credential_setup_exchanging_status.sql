-- Keep the one-active guided-login invariant while Claude Code exchanges the
-- browser-displayed verification code inside its sandboxed CLI.
DROP INDEX IF EXISTS idx_acss_one_active;

CREATE UNIQUE INDEX idx_acss_one_active
  ON agent_credential_setup_sessions(user_id, agent_type)
  WHERE status IN (
    'creating',
    'admitting',
    'provisioning',
    'waiting_for_user',
    'exchanging',
    'capturing',
    'saving'
  );
