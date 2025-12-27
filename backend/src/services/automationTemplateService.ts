import AutomationTemplate, { AutomationTemplateAiReplyConfig, AutomationTemplateCategorizationConfig } from '../models/AutomationTemplate';
import { AutomationTemplateId } from '../types/automation';

export type AutomationTemplateConfig = {
  templateId: AutomationTemplateId;
  name: string;
  description?: string;
  aiReply: Required<AutomationTemplateAiReplyConfig>;
  categorization: Required<AutomationTemplateCategorizationConfig>;
  updatedAt?: Date;
};

export const AUTOMATION_TEMPLATE_DEFAULTS: Record<AutomationTemplateId, AutomationTemplateConfig> = {
  sales_concierge: {
    templateId: 'sales_concierge',
    name: 'Sales Concierge',
    description: 'Guided sales concierge flow with AI-assisted replies.',
    aiReply: {
      model: 'gpt-4o-mini',
      temperature: 0.35,
      maxOutputTokens: 420,
      reasoningEffort: 'none',
    },
    categorization: {
      model: 'gpt-4o-mini',
      temperature: 0.1,
      reasoningEffort: 'none',
    },
  },
};

export const isAutomationTemplateId = (value: string): value is AutomationTemplateId =>
  Object.prototype.hasOwnProperty.call(AUTOMATION_TEMPLATE_DEFAULTS, value);

const mergeTemplateConfig = (
  defaults: AutomationTemplateConfig,
  stored?: {
    aiReply?: AutomationTemplateAiReplyConfig;
    categorization?: AutomationTemplateCategorizationConfig;
    updatedAt?: Date;
  },
): AutomationTemplateConfig => ({
  ...defaults,
  aiReply: {
    ...defaults.aiReply,
    ...(stored?.aiReply || {}),
  },
  categorization: {
    ...defaults.categorization,
    ...(stored?.categorization || {}),
  },
  updatedAt: stored?.updatedAt,
});

export async function getAutomationTemplateConfig(templateId: AutomationTemplateId): Promise<AutomationTemplateConfig> {
  const defaults = AUTOMATION_TEMPLATE_DEFAULTS[templateId];
  const stored = await AutomationTemplate.findOne({ templateId }).lean();
  return mergeTemplateConfig(defaults, stored || undefined);
}

export async function listAutomationTemplateConfigs(): Promise<AutomationTemplateConfig[]> {
  const templateIds = Object.keys(AUTOMATION_TEMPLATE_DEFAULTS) as AutomationTemplateId[];
  const storedTemplates = await AutomationTemplate.find({ templateId: { $in: templateIds } }).lean();
  const storedMap = new Map(storedTemplates.map((template: any) => [template.templateId, template]));

  return templateIds.map((templateId) => {
    const defaults = AUTOMATION_TEMPLATE_DEFAULTS[templateId];
    const stored = storedMap.get(templateId);
    return mergeTemplateConfig(defaults, stored);
  });
}
