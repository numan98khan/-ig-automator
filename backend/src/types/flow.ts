import { TriggerConfig, TriggerType } from './automation';

export type FlowDsl = Record<string, any>;
export type CompiledFlow = Record<string, any>;

export type FlowDraftStatus = 'draft' | 'archived';
export type FlowTemplateStatus = 'active' | 'archived';
export type FlowTemplateVersionStatus = 'published' | 'archived';

export type FlowFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multi_select'
  | 'json'
  | 'text';

export type FlowFieldOption = {
  label: string;
  value: string;
};

export type FlowFieldUi = {
  placeholder?: string;
  helpText?: string;
  group?: string;
  order?: number;
  widget?: string;
};

export type FlowFieldValidation = {
  min?: number;
  max?: number;
  pattern?: string;
};

export type FlowFieldSource = {
  nodeId: string;
  path: string;
};

export type FlowExposedField = {
  key: string;
  label: string;
  type: FlowFieldType;
  description?: string;
  required?: boolean;
  defaultValue?: any;
  options?: FlowFieldOption[];
  ui?: FlowFieldUi;
  validation?: FlowFieldValidation;
  source?: FlowFieldSource;
};

export type FlowTriggerDefinition = {
  type: TriggerType;
  config?: TriggerConfig;
  label?: string;
  description?: string;
};

export type FlowPreviewMessage = {
  from: 'bot' | 'customer';
  message: string;
};

export type FlowTemplateDisplay = {
  outcome?: string;
  goal?: 'Bookings' | 'Sales' | 'Leads' | 'Support' | 'General';
  industry?: 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General';
  setupTime?: string;
  collects?: string[];
  icon?: string;
  previewConversation?: FlowPreviewMessage[];
};

export type FlowDraftInput = {
  templateId?: string;
  name: string;
  description?: string;
  dsl: FlowDsl;
  triggers?: FlowTriggerDefinition[];
  exposedFields?: FlowExposedField[];
  display?: FlowTemplateDisplay;
};

export type FlowTemplateInput = {
  name: string;
  description?: string;
  status?: FlowTemplateStatus;
};

export type FlowTemplatePublishInput = {
  templateId?: string;
  compiled?: CompiledFlow;
  dslSnapshot?: FlowDsl;
  triggers?: FlowTriggerDefinition[];
  exposedFields?: FlowExposedField[];
  display?: FlowTemplateDisplay;
  versionLabel?: string;
};

export type AutomationInstanceInput = {
  name: string;
  description?: string;
  workspaceId: string;
  templateId?: string;
  templateVersionId?: string;
  userConfig?: Record<string, any>;
  isActive?: boolean;
};
