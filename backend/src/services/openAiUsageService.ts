import { insertOpenAiUsage } from '../repositories/core/openAiUsageRepository';

type OpenAiUsageInput = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

const pricingByModel: Record<string, { promptPerMillion: number; completionPerMillion: number }> = {
  'gpt-4o': { promptPerMillion: 5, completionPerMillion: 15 },
  'gpt-4o-mini': { promptPerMillion: 0.15, completionPerMillion: 0.6 },
  'gpt-4.1': { promptPerMillion: 5, completionPerMillion: 15 },
  'gpt-4.1-mini': { promptPerMillion: 0.3, completionPerMillion: 1.2 },
  'gpt-4.1-nano': { promptPerMillion: 0.15, completionPerMillion: 0.6 },
};

const getUsageTotals = (usage?: any): OpenAiUsageInput | null => {
  if (!usage) return null;
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  const totalTokens = Number(usage.total_tokens ?? promptTokens + completionTokens);

  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) {
    return null;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
};

const calculateCostCents = (model: string | undefined, totals: OpenAiUsageInput): number => {
  if (!model) return 0;
  const pricing = pricingByModel[model];
  if (!pricing) return 0;
  const promptCost = (totals.promptTokens / 1_000_000) * pricing.promptPerMillion;
  const completionCost = (totals.completionTokens / 1_000_000) * pricing.completionPerMillion;
  return Math.round((promptCost + completionCost) * 100);
};

export const logOpenAiUsage = async (payload: {
  workspaceId?: string | null;
  userId?: string | null;
  model?: string | null;
  usage?: any;
  requestId?: string | null;
}) => {
  const workspaceId = payload.workspaceId ? String(payload.workspaceId) : '';
  if (!workspaceId) return;

  const totals = getUsageTotals(payload.usage);
  if (!totals) return;

  const costCents = calculateCostCents(payload.model ?? undefined, totals);

  try {
    await insertOpenAiUsage({
      workspaceId,
      userId: payload.userId ?? null,
      model: payload.model ?? null,
      promptTokens: totals.promptTokens,
      completionTokens: totals.completionTokens,
      totalTokens: totals.totalTokens,
      costCents,
      requestId: payload.requestId ?? null,
    });
  } catch (error) {
    console.warn('OpenAI usage logging failed:', error);
  }
};
