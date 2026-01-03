import { postgresQuery } from './postgres';

const CORE_SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password TEXT,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  instagram_user_id TEXT UNIQUE,
  instagram_username TEXT,
  is_provisional BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  default_workspace_id TEXT,
  billing_account_id TEXT,
  tier_id TEXT,
  tier_limit_overrides JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  billing_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_user_id_unique ON core.workspaces (user_id);

CREATE TABLE IF NOT EXISTS core.workspace_members (
  id BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_workspace_id_idx ON core.workspace_members (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON core.workspace_members (user_id);

CREATE TABLE IF NOT EXISTS core.tiers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tiers_default_status_idx ON core.tiers (is_default, status);

CREATE TABLE IF NOT EXISTS core.billing_accounts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_accounts_owner_status_idx ON core.billing_accounts (owner_user_id, status);

CREATE TABLE IF NOT EXISTS core.subscriptions (
  id TEXT PRIMARY KEY,
  billing_account_id TEXT NOT NULL,
  tier_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  canceled_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscriptions_billing_status_idx ON core.subscriptions (billing_account_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS core.usage_counters (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  tier_id TEXT,
  workspace_id TEXT,
  resource TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, resource, period_start)
);
CREATE INDEX IF NOT EXISTS usage_counters_resource_period_idx ON core.usage_counters (resource, period_start);
CREATE INDEX IF NOT EXISTS usage_counters_workspace_idx ON core.usage_counters (workspace_id);

CREATE TABLE IF NOT EXISTS core.openai_usage (
  id BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT,
  model TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS openai_usage_workspace_idx ON core.openai_usage (workspace_id, created_at);
CREATE INDEX IF NOT EXISTS openai_usage_workspace_model_idx ON core.openai_usage (workspace_id, model, created_at);
`;

export const ensureCoreSchema = async () => {
  await postgresQuery(CORE_SCHEMA_SQL);
};
