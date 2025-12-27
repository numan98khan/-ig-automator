import React from 'react';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Search,
} from 'lucide-react';
import {
  Automation,
  KnowledgeItem,
  GoalType,
  TriggerType,
} from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AutomationPreviewPhone } from './AutomationPreviewPhone';
import {
  AutomationTemplate,
  GOAL_OPTIONS,
  TRIGGER_METADATA,
  AUTOMATION_TEMPLATES,
  SetupData,
  BOOKING_TRIGGER_KEYWORDS,
  SALES_TRIGGER_KEYWORDS,
} from './constants';

type CreateFormData = {
  name: string;
  description: string;
  triggerType: TriggerType;
  replyType: 'constant_reply' | 'ai_reply' | 'template_flow';
  constantMessage: string;
  aiGoalType: GoalType;
  aiGoalDescription: string;
  aiKnowledgeIds: string[];
};

type AutomationsCreateViewProps = {
  createViewTitle: string;
  isCreateSetupView: boolean;
  editingAutomation: Automation | null;
  isTemplateEditing: boolean;
  creationMode: 'templates' | 'custom';
  currentStep: 'gallery' | 'setup' | 'review';
  selectedTemplate: AutomationTemplate | null;
  templateSearch: string;
  goalFilter: 'all' | 'Bookings' | 'Sales' | 'Leads' | 'Support';
  industryFilter: 'all' | 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General';
  formData: CreateFormData;
  setupData: SetupData;
  saving: boolean;
  knowledgeItems: KnowledgeItem[];
  categories: Array<{ _id: string; nameEn: string }>;
  accountDisplayName: string;
  accountHandle: string;
  accountAvatarUrl?: string;
  accountInitial: string;
  onClose: () => void;
  onSubmit: (event?: React.FormEvent<HTMLFormElement>) => void;
  onSelectTemplate: (template: AutomationTemplate) => void;
  onChangeCreationMode: (mode: 'templates' | 'custom') => void;
  onChangeTemplateSearch: (value: string) => void;
  onChangeGoalFilter: (goal: 'all' | 'Bookings' | 'Sales' | 'Leads' | 'Support') => void;
  onBackToGallery: () => void;
  onBackToSetup: () => void;
  onContinueToReview: () => void;
  onUpdateFormData: React.Dispatch<React.SetStateAction<CreateFormData>>;
  onUpdateSetupData: React.Dispatch<React.SetStateAction<SetupData>>;
  onToggleKnowledge: (knowledgeId: string) => void;
};

export const AutomationsCreateView: React.FC<AutomationsCreateViewProps> = ({
  createViewTitle,
  isCreateSetupView,
  editingAutomation,
  isTemplateEditing,
  creationMode,
  currentStep,
  selectedTemplate,
  templateSearch,
  goalFilter,
  industryFilter,
  formData,
  setupData,
  saving,
  knowledgeItems,
  categories,
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
  onUpdateFormData,
  onUpdateSetupData,
  onToggleKnowledge,
}) => {
  const updateFormData = (updates: Partial<CreateFormData>) => {
    onUpdateFormData((prev) => ({ ...prev, ...updates }));
  };

  const updateSetupData = (updates: Partial<SetupData>) => {
    onUpdateSetupData((prev) => ({ ...prev, ...updates }));
  };

  const addTriggerKeyword = (keyword: string) => {
    const current = (setupData.triggerKeywords || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const exists = current.some((item) => item.toLowerCase() === keyword.toLowerCase());
    if (!exists) {
      updateSetupData({ triggerKeywords: [...current, keyword].join(', ') });
    }
  };

  const addSalesTriggerKeyword = (keyword: string) => {
    const current = (setupData.salesTriggerKeywords || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const exists = current.some((item) => item.toLowerCase() === keyword.toLowerCase());
    if (!exists) {
      updateSetupData({ salesTriggerKeywords: [...current, keyword].join(', ') });
    }
  };

  const toggleTriggerCategory = (categoryId: string) => {
    const current = setupData.triggerCategoryIds || [];
    const exists = current.includes(categoryId);
    updateSetupData({
      triggerCategoryIds: exists
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    });
  };

  const toggleSalesTriggerCategory = (categoryId: string) => {
    const current = setupData.salesTriggerCategoryIds || [];
    const exists = current.includes(categoryId);
    updateSetupData({
      salesTriggerCategoryIds: exists
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    });
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
            <div className="bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-2xl p-4 space-y-4 h-full min-h-0 overflow-y-auto">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{createViewTitle}</h4>
                <p className="text-xs text-muted-foreground dark:text-slate-400">
                  {editingAutomation ? 'Update your automation settings and save changes.' : 'Configure the template details before activation.'}
                </p>
              </div>
              <Input
                label="Name"
                value={formData.name}
                onChange={(event) => updateFormData({ name: event.target.value })}
                placeholder="e.g., Book Appointments"
              />
              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(event) => updateFormData({ description: event.target.value })}
                  placeholder="What does this automation do?"
                  rows={2}
                  className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                />
              </div>

              {selectedTemplate.setupFields.serviceList && (
                <Input
                  label="Services"
                  value={setupData.serviceList}
                  onChange={(event) => updateSetupData({ serviceList: event.target.value })}
                  placeholder="e.g., Facial, Botox, Makeup"
                />
              )}

              {selectedTemplate.setupFields.priceRanges && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Price Ranges</label>
                  <textarea
                    value={setupData.priceRanges}
                    onChange={(event) => updateSetupData({ priceRanges: event.target.value })}
                    placeholder="e.g., Facial: $80-$120\nMakeup: $120-$200"
                    rows={3}
                    className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  />
                </div>
              )}

              {selectedTemplate.setupFields.locationLink && (
                <Input
                  label="Location Link"
                  value={setupData.locationLink}
                  onChange={(event) => updateSetupData({ locationLink: event.target.value })}
                  placeholder="https://maps.google.com/?q=your-business"
                />
              )}

              {selectedTemplate.setupFields.locationHours && (
                <Input
                  label="Location Hours"
                  value={setupData.locationHours}
                  onChange={(event) => updateSetupData({ locationHours: event.target.value })}
                  placeholder="Mon-Fri 9AM-6PM, Sat 10AM-4PM"
                />
              )}

              {selectedTemplate.setupFields.phoneMinLength && (
                <Input
                  label="Min Phone Digits"
                  type="number"
                  value={setupData.phoneMinLength}
                  onChange={(event) => updateSetupData({ phoneMinLength: event.target.value })}
                  placeholder="8"
                />
              )}

              {selectedTemplate.setupFields.triggerKeywords && (
                <div className="space-y-3">
                  <Input
                    label="Trigger Keywords"
                    value={setupData.triggerKeywords}
                    onChange={(event) => updateSetupData({ triggerKeywords: event.target.value })}
                    placeholder="book, booking, appointment"
                  />
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Match Rule</label>
                    <select
                      value={setupData.triggerKeywordMatch}
                      onChange={(event) => updateSetupData({ triggerKeywordMatch: event.target.value as 'any' | 'all' })}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    >
                      <option value="any">Match any keyword</option>
                      <option value="all">Match all keywords</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {BOOKING_TRIGGER_KEYWORDS.map((keyword) => (
                      <button
                        key={keyword}
                        type="button"
                        onClick={() => addTriggerKeyword(keyword)}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                      >
                        {keyword}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedTemplate.setupFields.triggerCategories && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">AI Categories (optional)</label>
                  <p className="text-xs text-muted-foreground">
                    Triggers when the message is categorized into any selected category.
                  </p>
                  {categories.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {categories.map((category) => (
                        <label key={category._id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(setupData.triggerCategoryIds || []).includes(category._id)}
                            onChange={() => toggleTriggerCategory(category._id)}
                            className="rounded border-border"
                          />
                          {category.nameEn}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No categories found for this workspace yet.</p>
                  )}
                </div>
              )}

              {selectedTemplate.setupFields.salesTriggerKeywords && (
                <div className="space-y-3">
                  <Input
                    label="Sales Trigger Keywords"
                    value={setupData.salesTriggerKeywords}
                    onChange={(event) => updateSetupData({ salesTriggerKeywords: event.target.value })}
                    placeholder="price, stock, order, delivery"
                  />
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Match Rule</label>
                    <select
                      value={setupData.salesTriggerKeywordMatch}
                      onChange={(event) => updateSetupData({ salesTriggerKeywordMatch: event.target.value as 'any' | 'all' })}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    >
                      <option value="any">Match any keyword</option>
                      <option value="all">Match all keywords</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SALES_TRIGGER_KEYWORDS.map((keyword) => (
                      <button
                        key={keyword}
                        type="button"
                        onClick={() => addSalesTriggerKeyword(keyword)}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                      >
                        {keyword}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedTemplate.setupFields.salesTriggerCategories && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium">AI Categories (optional)</label>
                  <p className="text-xs text-muted-foreground">
                    Triggers when the message is categorized into any selected category.
                  </p>
                  {categories.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {categories.map((category) => (
                        <label key={category._id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={(setupData.salesTriggerCategoryIds || []).includes(category._id)}
                            onChange={() => toggleSalesTriggerCategory(category._id)}
                            className="rounded border-border"
                          />
                          {category.nameEn}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No categories found for this workspace yet.</p>
                  )}
                </div>
              )}

              {selectedTemplate.setupFields.salesUseGoogleSheets && (
                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={!!setupData.salesUseGoogleSheets}
                      onChange={(event) => updateSetupData({ salesUseGoogleSheets: event.target.checked })}
                      className="rounded border-border"
                    />
                    Use connected Google Sheet for catalog + stock
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Requires a Google Sheets connection in Integrations. JSON catalog stays as fallback.
                  </p>
                </div>
              )}

              {selectedTemplate.setupFields.salesPhoneMinLength && (
                <Input
                  label="Min Phone Digits"
                  type="number"
                  value={setupData.salesPhoneMinLength}
                  onChange={(event) => updateSetupData({ salesPhoneMinLength: event.target.value })}
                  placeholder="8"
                />
              )}

              {selectedTemplate.setupFields.salesKnowledgeItems && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="block text-sm font-medium">Knowledge Items</label>
                    {knowledgeItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => updateSetupData({ salesKnowledgeItemIds: knowledgeItems.map((item) => item._id) })}
                        className="text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        Select all
                      </button>
                    )}
                  </div>
                  {knowledgeItems.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No knowledge items available.</div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                      {knowledgeItems.map((item) => (
                        <label key={item._id} className="flex items-center gap-3 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={setupData.salesKnowledgeItemIds.includes(item._id)}
                            onChange={() => {
                              const next = setupData.salesKnowledgeItemIds.includes(item._id)
                                ? setupData.salesKnowledgeItemIds.filter((id) => id !== item._id)
                                : [...setupData.salesKnowledgeItemIds, item._id];
                              updateSetupData({ salesKnowledgeItemIds: next });
                            }}
                            className="rounded border-border"
                          />
                          <span className="text-muted-foreground">{item.title}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {selectedTemplate.setupFields.businessHoursTime && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Open Time"
                    type="time"
                    value={setupData.businessHoursStart}
                    onChange={(event) => updateSetupData({ businessHoursStart: event.target.value })}
                  />
                  <Input
                    label="Close Time"
                    type="time"
                    value={setupData.businessHoursEnd}
                    onChange={(event) => updateSetupData({ businessHoursEnd: event.target.value })}
                  />
                </div>
              )}

              {selectedTemplate.setupFields.businessTimezone && (
                <Input
                  label="Timezone"
                  value={setupData.businessTimezone}
                  onChange={(event) => updateSetupData({ businessTimezone: event.target.value })}
                  placeholder="America/New_York"
                />
              )}

              {selectedTemplate.setupFields.afterHoursMessage && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Closed Message</label>
                  <textarea
                    value={setupData.afterHoursMessage}
                    onChange={(event) => updateSetupData({ afterHoursMessage: event.target.value })}
                    placeholder="We're closed - leave details, we'll contact you at {next_open_time}."
                    rows={3}
                    className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  />
                </div>
              )}

              {selectedTemplate.setupFields.followupMessage && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Next-Open Follow-up</label>
                  <textarea
                    value={setupData.followupMessage}
                    onChange={(event) => updateSetupData({ followupMessage: event.target.value })}
                    placeholder="We're open now if you'd like to continue. Reply anytime."
                    rows={2}
                    className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  />
                </div>
              )}
            </div>

            <div className="h-full min-h-0 flex flex-col">
              <div className="border border-border/70 dark:border-white/10 rounded-2xl flex-1 min-h-0 overflow-hidden bg-card/70 dark:bg-white/5 flex flex-col">
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
                      messages={selectedTemplate.previewConversation.map((msg, idx) => ({
                        id: `preview-${idx}`,
                        from: msg.from === 'customer' ? 'customer' : 'ai',
                        text: msg.message,
                      }))}
                      showSeen={
                        selectedTemplate.previewConversation.length > 0 &&
                        selectedTemplate.previewConversation[selectedTemplate.previewConversation.length - 1].from === 'bot'
                      }
                      mode="static"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-2xl p-4 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">{createViewTitle}</h2>
            <p className="text-sm text-muted-foreground">
              {editingAutomation ? 'Update your automation settings and save changes.' : 'Configure a new automation flow.'}
            </p>
          </div>

          {editingAutomation && !isTemplateEditing ? (
            <form onSubmit={onSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-1.5">Name</label>
                <Input
                  value={formData.name}
                  onChange={(event) => updateFormData({ name: event.target.value })}
                  placeholder="e.g., Welcome New Followers"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Description (optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(event) => updateFormData({ description: event.target.value })}
                  placeholder="Describe what this automation does..."
                  rows={3}
                  className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Trigger</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                  {Object.entries(TRIGGER_METADATA).map(([type, meta]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => updateFormData({ triggerType: type as TriggerType })}
                      className={`text-left border rounded-lg p-3 transition-all ${
                        formData.triggerType === type
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div className="text-primary">{meta.icon}</div>
                        <span className="font-medium text-sm">{meta.label}</span>
                        {meta.badge && (
                          <span className={`ml-auto px-1.5 py-0.5 rounded text-xs font-bold ${
                            meta.badge === 'PRO' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'
                          }`}>
                            {meta.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{meta.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Reply Type</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => updateFormData({ replyType: 'constant_reply' })}
                    className={`text-left border rounded-lg p-4 transition-all ${
                      formData.replyType === 'constant_reply'
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium mb-1">Constant Reply</div>
                    <p className="text-xs text-muted-foreground">Send a predefined message</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateFormData({ replyType: 'ai_reply' })}
                    className={`text-left border rounded-lg p-4 transition-all ${
                      formData.replyType === 'ai_reply'
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="font-medium mb-1">AI Reply</div>
                    <p className="text-xs text-muted-foreground">AI generates responses with a goal</p>
                  </button>
                </div>
              </div>

              {formData.replyType === 'constant_reply' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Message</label>
                  <textarea
                    value={formData.constantMessage}
                    onChange={(event) => updateFormData({ constantMessage: event.target.value })}
                    placeholder="Enter your message..."
                    rows={4}
                    className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                    required
                  />
                </div>
              )}

              {formData.replyType === 'ai_reply' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Goal</label>
                    <select
                      value={formData.aiGoalType}
                      onChange={(event) => updateFormData({ aiGoalType: event.target.value as GoalType })}
                      className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                      required
                    >
                      {GOAL_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label} - {option.description}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5">Goal Description (optional)</label>
                    <Input
                      value={formData.aiGoalDescription}
                      onChange={(event) => updateFormData({ aiGoalDescription: event.target.value })}
                      placeholder="Describe the goal in natural language..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Knowledge Items</label>
                    {knowledgeItems.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg">
                        No knowledge items available. Create knowledge items first.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                        {knowledgeItems.map(item => (
                          <label
                            key={item._id}
                            className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData.aiKnowledgeIds.includes(item._id)}
                              onChange={() => onToggleKnowledge(item._id)}
                              className="rounded border-border"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium">{item.title}</div>
                              <div className="text-xs text-muted-foreground line-clamp-1">{item.content}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={saving}>
                  {editingAutomation ? 'Save Changes' : 'Create Automation'}
                </Button>
              </div>
            </form>
          ) : (
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
                      onClick={() => onChangeCreationMode('custom')}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        creationMode === 'custom'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
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
                          {(['all', 'Bookings', 'Sales', 'Leads', 'Support'] as const).map((goal) => (
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
                        {AUTOMATION_TEMPLATES
                          .filter((template) => {
                            const matchesSearch =
                              templateSearch === '' ||
                              template.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                              template.outcome.toLowerCase().includes(templateSearch.toLowerCase());
                            const matchesGoal = goalFilter === 'all' || template.goal === goalFilter;
                            const matchesIndustry = industryFilter === 'all' || template.industry === industryFilter;
                            return matchesSearch && matchesGoal && matchesIndustry;
                          })
                          .map((template) => (
                            <button
                              key={template.id}
                              onClick={() => onSelectTemplate(template)}
                              className="text-left border border-border rounded-lg p-4 hover:border-primary/50 hover:bg-muted/30 transition-all group"
                            >
                              <div className="flex items-start gap-3 mb-3">
                                <div className="p-2 bg-primary/10 text-primary rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                  {template.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-sm mb-1">{template.name}</h3>
                                  <p className="text-xs text-muted-foreground line-clamp-2">{template.outcome}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-1 mb-2">
                                {template.triggers.slice(0, 3).map((trigger) => (
                                  <span
                                    key={trigger}
                                    className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs"
                                  >
                                    {TRIGGER_METADATA[trigger]?.label.split(' ')[0]}
                                  </span>
                                ))}
                              </div>

                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{template.setupTime}</span>
                                <span>Collects: {template.collects.slice(0, 2).join(', ')}</span>
                              </div>
                            </button>
                          ))}
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
                        <p className="font-semibold">{formData.name}</p>
                        <p className="text-sm text-muted-foreground">{formData.description}</p>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase">Triggers Enabled</label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {selectedTemplate.triggers.map((trigger) => (
                            <div
                              key={trigger}
                              className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm"
                            >
                              {TRIGGER_METADATA[trigger]?.icon}
                              {TRIGGER_METADATA[trigger]?.label}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase">Reply Behavior</label>
                        <p className="text-sm mt-1">
                          {selectedTemplate.replyType === 'ai_reply' ? (
                            <span className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-primary" />
                              AI-powered responses with goal: {GOAL_OPTIONS.find((g) => g.value === selectedTemplate.aiGoalType)?.label}
                            </span>
                          ) : selectedTemplate.replyType === 'template_flow' ? (
                            <span className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-primary" />
                              Template flow: {selectedTemplate.name}
                            </span>
                          ) : (
                            'Constant reply'
                          )}
                        </p>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground uppercase mb-2 block">
                          Safety Settings
                        </label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-3 text-sm">
                            <input type="checkbox" defaultChecked className="rounded" />
                            <span>Pause on human takeover</span>
                          </label>
                          <label className="flex items-center gap-3 text-sm">
                            <input type="checkbox" defaultChecked className="rounded" />
                            <span>Respect after-hours settings</span>
                          </label>
                          <label className="flex items-center gap-3 text-sm">
                            <input type="checkbox" defaultChecked className="rounded" />
                            <span>Rate limit (max 50 messages/hour)</span>
                          </label>
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
                      Activate Automation
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
