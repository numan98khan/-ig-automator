import React from 'react';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Search,
} from 'lucide-react';
import {
  AutomationInstance,
  FlowExposedField,
  FlowTemplate,
  TriggerConfig,
} from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AutomationPreviewPhone, PreviewMessage } from './AutomationPreviewPhone';
import { FLOW_GOAL_FILTERS, TRIGGER_METADATA } from './constants';

type AutomationsCreateViewProps = {
  createViewTitle: string;
  isCreateSetupView: boolean;
  editingAutomation: AutomationInstance | null;
  allowCustomCreation: boolean;
  creationMode: 'templates' | 'custom';
  currentStep: 'gallery' | 'setup' | 'review';
  selectedTemplate: FlowTemplate | null;
  templates: FlowTemplate[];
  templateSearch: string;
  goalFilter: 'all' | (typeof FLOW_GOAL_FILTERS)[number];
  industryFilter: 'all' | 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General';
  exposedFields: FlowExposedField[];
  configValues: Record<string, any>;
  saving: boolean;
  accountDisplayName: string;
  accountHandle: string;
  accountAvatarUrl?: string;
  accountInitial: string;
  onClose: () => void;
  onSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  onSelectTemplate: (template: FlowTemplate) => void;
  onChangeCreationMode: (mode: 'templates' | 'custom') => void;
  onChangeTemplateSearch: (value: string) => void;
  onChangeGoalFilter: (goal: 'all' | (typeof FLOW_GOAL_FILTERS)[number]) => void;
  onBackToGallery: () => void;
  onBackToSetup: () => void;
  onContinueToReview: () => void;
  onUpdateConfigValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  previewMessages: PreviewMessage[];
  previewInputValue: string;
  previewStatus?: string | null;
  previewSessionStatus?: 'active' | 'paused' | 'completed' | 'handoff' | null;
  previewLoading?: boolean;
  previewSendDisabled?: boolean;
  onPreviewInputChange: (value: string) => void;
  onPreviewSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onPreviewPause: () => void;
  onPreviewStop: () => void;
  onPreviewReset: () => void;
};

const formatConfigValue = (value: any) => {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (value === undefined || value === null || value === '') return 'Not set';
  return String(value);
};

const formatTriggerConfigSummary = (config?: TriggerConfig) => {
  if (!config) return '';
  const parts: string[] = [];

  if (config.triggerMode && config.triggerMode !== 'any') {
    parts.push(`Mode: ${config.triggerMode}`);
  }
  if (config.keywordMatch) {
    parts.push(`Keyword match: ${config.keywordMatch}`);
  }
  if (config.keywords && config.keywords.length > 0) {
    parts.push(`Keywords: ${config.keywords.join(', ')}`);
  }
  if (config.excludeKeywords && config.excludeKeywords.length > 0) {
    parts.push(`Exclude: ${config.excludeKeywords.join(', ')}`);
  }
  if (config.outsideBusinessHours) {
    parts.push('Outside business hours');
  }
  const matchOn: string[] = [];
  if (config.matchOn?.link) matchOn.push('links');
  if (config.matchOn?.attachment) matchOn.push('attachments');
  if (matchOn.length > 0) {
    parts.push(`Match on: ${matchOn.join(', ')}`);
  }
  if (config.businessHours) {
    parts.push('Business hours');
  }
  if (typeof config.burstBufferSeconds === 'number' && config.burstBufferSeconds > 0) {
    parts.push(`Burst buffer: ${config.burstBufferSeconds}s`);
  }

  return parts.join(' | ');
};

export const AutomationsCreateView: React.FC<AutomationsCreateViewProps> = ({
  createViewTitle,
  isCreateSetupView,
  editingAutomation,
  allowCustomCreation,
  creationMode,
  currentStep,
  selectedTemplate,
  templates,
  templateSearch,
  goalFilter,
  industryFilter,
  exposedFields,
  configValues,
  saving,
  accountDisplayName,
  accountHandle,
  accountAvatarUrl,
  accountInitial,
  onClose,
  onSubmit,
  onSelectTemplate,
  onChangeCreationMode,
  onChangeTemplateSearch,
  onChangeGoalFilter,
  onBackToGallery,
  onBackToSetup,
  onContinueToReview,
  onUpdateConfigValues,
  previewMessages,
  previewInputValue,
  previewStatus,
  previewSessionStatus,
  previewLoading,
  previewSendDisabled,
  onPreviewInputChange,
  onPreviewSubmit,
  onPreviewPause,
  onPreviewStop,
  onPreviewReset,
}) => {
  const [showAdvanced, setShowAdvanced] = React.useState(Boolean(editingAutomation));
  const automationName = editingAutomation?.name
    || selectedTemplate?.name
    || 'Automation';
  const automationDescription = editingAutomation?.description
    || selectedTemplate?.currentVersion?.display?.outcome
    || selectedTemplate?.description
    || 'Automation template';

  const updateConfigValues = (updates: Record<string, any>) => {
    onUpdateConfigValues((prev) => ({ ...prev, ...updates }));
  };

  const version = selectedTemplate?.currentVersion;
  const display = version?.display;
  const templatePreviewMessages = display?.previewConversation || [];
  const triggers = version?.triggers || [];

  const orderedFields = [...exposedFields];

  const groupedFields = orderedFields.reduce((acc, field) => {
    const group = field.ui?.group || 'Configuration';
    if (!acc[group]) acc[group] = [];
    acc[group].push(field);
    return acc;
  }, {} as Record<string, FlowExposedField[]>);
  const advancedGroups = new Set(['Triggers', 'AI Reply', 'AI Agent']);
  const groupedFieldEntries = Object.entries(groupedFields);
  const hasAdvancedFields = groupedFieldEntries.some(([group]) => advancedGroups.has(group));
  const visibleGroupedFields = groupedFieldEntries.filter(
    ([group]) => showAdvanced || !advancedGroups.has(group),
  );
  const triggerModeField = exposedFields.find((field) =>
    field.source?.path?.includes('triggers') && field.source?.path?.includes('config.triggerMode'),
  );
  const triggerModeValue = triggerModeField ? configValues[triggerModeField.key] : undefined;
  const isTriggerModeKeywords = triggerModeValue === 'keywords';
  const isTriggerModeIntent = triggerModeValue === 'intent';

  const renderField = (field: FlowExposedField) => {
    if (field.ui?.group === 'Triggers' && field.source?.path) {
      if (field.source.path.includes('config.keywords') && !isTriggerModeKeywords) {
        return null;
      }
      if (field.source.path.includes('config.excludeKeywords') && !isTriggerModeKeywords) {
        return null;
      }
      if (field.source.path.includes('config.keywordMatch') && !isTriggerModeKeywords) {
        return null;
      }
      if (field.source.path.includes('config.intentText') && !isTriggerModeIntent) {
        return null;
      }
    }
    if (field.source?.nodeId && field.source?.path?.includes('burstBufferSeconds')) {
      const waitField = exposedFields.find((candidate) => (
        candidate.source?.nodeId === field.source?.nodeId
        && typeof candidate.source?.path === 'string'
        && candidate.source.path.includes('waitForReply')
      ));
      if (waitField && !Boolean(configValues[waitField.key])) {
        return null;
      }
    }
    const value = configValues[field.key];
    const description = field.description || field.ui?.helpText;

    if (field.type === 'boolean') {
      return (
        <label key={field.key} className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => updateConfigValues({ [field.key]: event.target.checked })}
            className="rounded border-border"
          />
          <span>{field.label}</span>
          {description && <span className="text-xs text-muted-foreground">{description}</span>}
        </label>
      );
    }

    if (field.type === 'select') {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium mb-1.5">
            {field.label}{field.required ? ' *' : ''}
          </label>
          <select
            value={value ?? ''}
            onChange={(event) => updateConfigValues({ [field.key]: event.target.value })}
            className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          >
            <option value="">Select...</option>
            {(field.options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        </div>
      );
    }

    if (field.type === 'multi_select') {
      const options = field.options || [];
      const selected = Array.isArray(value) ? value : [];
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium mb-1.5">
            {field.label}{field.required ? ' *' : ''}
          </label>
          <div className="space-y-2">
            {options.map((option) => (
              <label key={option.value} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(option.value)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((item: string) => item !== option.value);
                    updateConfigValues({ [field.key]: next });
                  }}
                  className="rounded border-border"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        </div>
      );
    }

    if (field.type === 'text' || field.type === 'json') {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium mb-1.5">
            {field.label}{field.required ? ' *' : ''}
          </label>
          <textarea
            value={value ?? ''}
            onChange={(event) => updateConfigValues({ [field.key]: event.target.value })}
            placeholder={field.ui?.placeholder}
            rows={field.type === 'json' ? 4 : 3}
            className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          />
          {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        </div>
      );
    }

    const inputType = field.type === 'number' ? 'number' : 'text';
    return (
      <Input
        key={field.key}
        label={`${field.label}${field.required ? ' *' : ''}`}
        type={inputType}
        value={value ?? ''}
        onChange={(event) => updateConfigValues({ [field.key]: event.target.value })}
        placeholder={field.ui?.placeholder}
      />
    );
  };

  return (
    <div className={`flex-1 min-h-0 ${isCreateSetupView ? 'flex flex-col gap-4 overflow-hidden' : 'space-y-4'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            onClick={onClose}
            className="hover:text-foreground transition-colors"
          >
            Automations
          </button>
          <ArrowRight className="w-4 h-4" />
          <span className="text-foreground font-medium">{createViewTitle}</span>
        </div>

        <div className="flex items-center gap-2">
          {currentStep === 'setup' && selectedTemplate ? (
            editingAutomation ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  leftIcon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onSubmit()}
                  isLoading={saving}
                >
                  Save Changes
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onBackToGallery}
                  leftIcon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onContinueToReview}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Continue to Review
                </Button>
              </>
            )
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
          )}
        </div>
      </div>

      {currentStep === 'setup' && selectedTemplate ? (
        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 flex-1 min-h-0 overflow-hidden">
            <div className="bg-card dark:bg-white/5 border border-border dark:border-white/10 rounded-2xl p-4 space-y-4 h-full min-h-0 overflow-y-auto shadow-sm">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{createViewTitle}</h4>
                <p className="text-xs text-muted-foreground dark:text-slate-400">
                  {editingAutomation ? 'Update your automation settings and save changes.' : 'Configure the template details before activation.'}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Triggers
                </div>
                {triggers.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    Triggers are defined in the template.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {triggers.map((trigger, index) => {
                      const meta = TRIGGER_METADATA[trigger.type];
                      const summary = formatTriggerConfigSummary(trigger.config);
                      return (
                        <div
                          key={`${trigger.type}-${index}`}
                          className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 p-2"
                        >
                          <div className="p-2 bg-primary/10 text-primary rounded-lg">
                            {meta?.icon || <Sparkles className="w-5 h-5" />}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">
                              {trigger.label || meta?.label || trigger.type}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {trigger.description || meta?.description || 'Trigger configured in the template.'}
                            </div>
                            {summary && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {summary}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {hasAdvancedFields && (
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">Advanced options</div>
                    <div className="text-xs text-muted-foreground">
                      Configure trigger routing and AI behavior.
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAdvanced((prev) => !prev)}
                  >
                    {showAdvanced ? 'Hide options' : 'Configure options'}
                  </Button>
                </div>
              )}

              {visibleGroupedFields.map(([group, fields]) => (
                <div key={group} className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</div>
                  {fields.map(renderField)}
                </div>
              ))}
            </div>

            <div className="h-full min-h-0 flex flex-col">
              <div className="border border-border dark:border-white/10 rounded-2xl flex-1 min-h-0 overflow-hidden bg-card dark:bg-white/5 flex flex-col shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 text-sm">
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>Insights</span>
                    <span className="font-medium text-foreground">Preview</span>
                  </div>
                  <span className="text-xs text-muted-foreground">DM</span>
                </div>
                <div className="flex-1 min-h-0 flex items-center justify-center bg-background/60 dark:bg-transparent p-4">
                  <div className="h-full max-h-full aspect-[9/19.5] w-auto max-w-full">
                    <AutomationPreviewPhone
                      accountDisplayName={accountDisplayName}
                      accountHandle={accountHandle}
                      accountAvatarUrl={accountAvatarUrl}
                      accountInitial={accountInitial}
                      messages={
                        editingAutomation
                          ? previewMessages
                          : templatePreviewMessages.map((msg, idx) => ({
                              id: `preview-${idx}`,
                              from: msg.from === 'customer' ? 'customer' : 'ai',
                              text: msg.message,
                            }))
                      }
                      showSeen={
                        editingAutomation
                          ? previewMessages.length > 0 &&
                            previewMessages[previewMessages.length - 1].from === 'ai'
                          : templatePreviewMessages.length > 0 &&
                            templatePreviewMessages[templatePreviewMessages.length - 1].from === 'bot'
                      }
                      mode={editingAutomation ? 'interactive' : 'static'}
                      inputValue={previewInputValue}
                      onInputChange={onPreviewInputChange}
                      onSubmit={onPreviewSubmit}
                      inputDisabled={Boolean(previewLoading)}
                      sendDisabled={previewSendDisabled}
                    />
                    {editingAutomation && previewStatus && (
                      <div className="mt-3 text-xs text-muted-foreground text-center">
                        {previewStatus}
                      </div>
                    )}
                    {editingAutomation && (
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={onPreviewPause}
                          disabled={previewLoading || previewSessionStatus === 'paused'}
                          className="px-3 py-1 rounded-full border border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {previewSessionStatus === 'paused' ? 'Paused' : 'Pause'}
                        </button>
                        <button
                          type="button"
                          onClick={onPreviewStop}
                          disabled={previewLoading || previewSessionStatus === 'completed'}
                          className="px-3 py-1 rounded-full border border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {previewSessionStatus === 'completed' ? 'Stopped' : 'Stop'}
                        </button>
                        <button
                          type="button"
                          onClick={onPreviewReset}
                          disabled={previewLoading}
                          className="px-3 py-1 rounded-full border border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/50 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          Reset
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card dark:bg-white/5 border border-border dark:border-white/10 rounded-2xl p-4 space-y-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">{createViewTitle}</h2>
            <p className="text-sm text-muted-foreground">
              {editingAutomation ? 'Update your automation settings and save changes.' : 'Configure a new automation flow.'}
            </p>
          </div>

          <div className="space-y-6">
            {currentStep === 'gallery' && (
              <>
                <div className="flex items-center gap-3 p-1 bg-muted/40 rounded-lg w-fit">
                  <button
                    onClick={() => onChangeCreationMode('templates')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      creationMode === 'templates'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Templates <span className="text-xs text-primary">(Recommended)</span>
                  </button>
                  <button
                    onClick={() => {
                      if (allowCustomCreation) {
                        onChangeCreationMode('custom');
                      }
                    }}
                    disabled={!allowCustomCreation}
                    title={!allowCustomCreation ? 'Custom automations are disabled for this tier.' : undefined}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      creationMode === 'custom'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    } ${!allowCustomCreation ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    Custom
                  </button>
                </div>

                {creationMode === 'templates' ? (
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={templateSearch}
                        onChange={(event) => onChangeTemplateSearch(event.target.value)}
                        placeholder="Search templates..."
                        className="pl-10"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Goal:</span>
                        {(['all', ...FLOW_GOAL_FILTERS] as const).map((goal) => (
                          <button
                            key={goal}
                            onClick={() => onChangeGoalFilter(goal)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                              goalFilter === goal
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            {goal === 'all' ? 'All' : goal}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2">
                      {templates
                        .filter((template) => {
                          if (!template.currentVersion) return false;
                          const displayInfo = template.currentVersion?.display;
                          const matchesSearch =
                            templateSearch === '' ||
                            template.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                            (displayInfo?.outcome || '').toLowerCase().includes(templateSearch.toLowerCase());
                          const matchesGoal = goalFilter === 'all' || displayInfo?.goal === goalFilter;
                          const matchesIndustry = industryFilter === 'all' || displayInfo?.industry === industryFilter;
                          return matchesSearch && matchesGoal && matchesIndustry;
                        })
                        .map((template) => {
                          const displayInfo = template.currentVersion?.display;
                          const triggers = template.currentVersion?.triggers || [];
                          return (
                            <button
                              key={template._id}
                              onClick={() => onSelectTemplate(template)}
                              className="text-left border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-all group"
                            >
                              <div className="flex items-start gap-3 mb-3">
                                <div className="p-2 bg-primary/10 text-primary rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                  <Sparkles className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-sm mb-1">{template.name}</h3>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {displayInfo?.outcome || template.description || 'Automation template'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-1 mb-2">
                                {triggers.slice(0, 3).map((trigger) => (
                                  <span
                                    key={`${template._id}-${trigger.type}`}
                                    className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs"
                                  >
                                    {TRIGGER_METADATA[trigger.type]?.label.split(' ')[0] || trigger.type}
                                  </span>
                                ))}
                              </div>

                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{displayInfo?.setupTime || 'Quick setup'}</span>
                                <span>
                                  Collects: {(displayInfo?.collects || []).slice(0, 2).join(', ') || 'Configurable inputs'}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Custom automation builder coming soon. For now, please use Templates.
                  </div>
                )}
              </>
            )}

            {currentStep === 'review' && selectedTemplate && (
              <div className="space-y-6">
                <div className="bg-muted/30 border border-border rounded-lg p-4">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-primary" />
                    Ready to Activate
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase">Automation</label>
                      <p className="font-semibold">{automationName}</p>
                      <p className="text-sm text-muted-foreground">{automationDescription}</p>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase">Triggers Enabled</label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(version?.triggers || []).length > 0
                          ? (version?.triggers || []).map((trigger) => (
                              <div
                                key={`${selectedTemplate._id}-${trigger.type}`}
                                className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm"
                              >
                                {TRIGGER_METADATA[trigger.type]?.icon}
                                {trigger.label || TRIGGER_METADATA[trigger.type]?.label || trigger.type}
                              </div>
                            ))
                          : (
                            <div className="text-sm text-muted-foreground">Triggers are defined in the template.</div>
                          )}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase">Configurable Inputs</label>
                      <div className="mt-2 space-y-2 text-sm">
                        {exposedFields.length === 0 && (
                          <div className="text-muted-foreground">No configurable fields for this template.</div>
                        )}
                        {exposedFields.map((field) => (
                          <div key={field.key} className="flex items-start justify-between gap-4">
                            <span className="text-muted-foreground">{field.label}</span>
                            <span className="font-medium">{formatConfigValue(configValues[field.key])}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-border">
              <div>
                {currentStep !== 'gallery' && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={onBackToSetup}
                    leftIcon={<ArrowLeft className="w-4 h-4" />}
                  >
                    Back
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                {currentStep === 'gallery' && creationMode === 'templates' && (
                  <Button disabled className="opacity-50">
                    Select a template to continue
                  </Button>
                )}
                {currentStep === 'review' && (
                  <Button onClick={() => onSubmit()} isLoading={saving} leftIcon={<CheckCircle className="w-4 h-4" />}>
                    Finish
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
