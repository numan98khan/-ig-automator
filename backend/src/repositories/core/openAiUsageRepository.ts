import { postgresQuery } from '../../db/postgres';

export type OpenAiUsageRecord = {
  workspaceId: string;
  userId?: string | null;
  model?: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costCents: number;
  requestId?: string | null;
};

export type OpenAiUsageSummary = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costCents: number;
};

export const insertOpenAiUsage = async (record: OpenAiUsageRecord) => {
  await postgresQuery(
    `INSERT INTO core.openai_usage (
      workspace_id,
      user_id,
      model,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      cost_cents,
      request_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8
    )`,
    [
      record.workspaceId,
      record.userId ?? null,
      record.model ?? null,
      record.promptTokens,
      record.completionTokens,
      record.totalTokens,
      record.costCents,
      record.requestId ?? null,
    ]
  );
};

export const getWorkspaceOpenAiUsageSummary = async (
  workspaceId: string,
  startAt: Date,
  endAt: Date
): Promise<OpenAiUsageSummary> => {
  const result = await postgresQuery(
    `SELECT
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COALESCE(SUM(cost_cents), 0) AS cost_cents
    FROM core.openai_usage
    WHERE workspace_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [workspaceId, startAt, endAt]
  );
  const row = result.rows[0] || {};
  return {
    promptTokens: Number(row.prompt_tokens) || 0,
    completionTokens: Number(row.completion_tokens) || 0,
    totalTokens: Number(row.total_tokens) || 0,
    costCents: Number(row.cost_cents) || 0,
  };
};
