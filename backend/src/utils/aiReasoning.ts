export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

const GPT5_ALLOWED = new Set<ReasoningEffort>(['minimal', 'low', 'medium', 'high']);

export const normalizeReasoningEffort = (model?: string, effort?: ReasoningEffort) => {
  if (!effort || effort === 'none') return undefined;
  const normalized = effort;
  if (/^gpt-5/i.test(model || '')) {
    if (normalized === 'xhigh') return 'high';
    return GPT5_ALLOWED.has(normalized) ? normalized : undefined;
  }
  return normalized;
};
