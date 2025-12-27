import React from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import {
  Automation,
  KnowledgeItem,
  GoalType,
  AutomationTestState,
} from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AutomationPreviewPhone, PreviewMessage } from './AutomationPreviewPhone';
import {
  AutomationTemplate,
  GOAL_OPTIONS,
  SetupData,
  BOOKING_TRIGGER_KEYWORDS,
  SALES_TRIGGER_KEYWORDS,
} from './constants';

type TestEditFormState = {
  name: string;
  description: string;
  replyType: 'constant_reply' | 'ai_reply' | 'template_flow';
  constantMessage: string;
  aiGoalType: GoalType;
  aiGoalDescription: string;
  aiKnowledgeIds: string[];
};

type AutomationsTestViewProps = {
  testingAutomation: Automation;
  accountDisplayName: string;
  accountHandle: string;
  accountAvatarUrl?: string;
  accountInitial: string;
  knowledgeItems: KnowledgeItem[];
  testMessages: PreviewMessage[];
  testInput: string;
  testState: AutomationTestState | null;
  testTriggerMatched: boolean | null;
  testForceOutsideHours: boolean;
  testSending: boolean;
  testEditForm: TestEditFormState;
  testTemplate: AutomationTemplate | null;
  testSetupData: SetupData;
  testSaving: boolean;
  categories: Array<{ _id: string; nameEn: string }>;
  onClose: () => void;
  onReset: () => void;
  onSimulateFollowup: () => void;
  onToggleAfterHours: () => void;
  onSendMessage: (event: React.FormEvent<HTMLFormElement>) => void;
  onSaveConfig: () => void;
  onChangeTestInput: (value: string) => void;
  onUpdateTestEditForm: React.Dispatch<React.SetStateAction<TestEditFormState>>;
  onUpdateTestSetupData: React.Dispatch<React.SetStateAction<SetupData>>;
};

export const AutomationsTestView: React.FC<AutomationsTestViewProps> = ({
  testingAutomation,
  accountDisplayName,
  accountHandle,
  accountAvatarUrl,
  accountInitial,
  knowledgeItems,
  testMessages,
  testInput,
  testState,
  testTriggerMatched,
  testForceOutsideHours,
  testSending,
  testEditForm,
  testTemplate,
  testSetupData,
  testSaving,
  categories,
  onClose,
  onReset,
  onSimulateFollowup,
  onToggleAfterHours,
  onSendMessage,
  onSaveConfig,
  onChangeTestInput,
  onUpdateTestEditForm,
  onUpdateTestSetupData,
}) => {
  const updateTestEditForm = (updates: Partial<TestEditFormState>) => {
    onUpdateTestEditForm((prev) => ({ ...prev, ...updates }));
  };

  const updateTestSetupData = (updates: Partial<SetupData>) => {
    onUpdateTestSetupData((prev) => ({ ...prev, ...updates }));
  };

  const addTriggerKeyword = (keyword: string) => {
    const current = (testSetupData.triggerKeywords || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const exists = current.some((item) => item.toLowerCase() === keyword.toLowerCase());
    if (!exists) {
      updateTestSetupData({ triggerKeywords: [...current, keyword].join(', ') });
    }
  };

  const addSalesTriggerKeyword = (keyword: string) => {
    const current = (testSetupData.salesTriggerKeywords || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const exists = current.some((item) => item.toLowerCase() === keyword.toLowerCase());
    if (!exists) {
      updateTestSetupData({ salesTriggerKeywords: [...current, keyword].join(', ') });
    }
  };

  const toggleTriggerCategory = (categoryId: string) => {
    const current = testSetupData.triggerCategoryIds || [];
    const exists = current.includes(categoryId);
    updateTestSetupData({
      triggerCategoryIds: exists
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    });
  };

  const toggleSalesTriggerCategory = (categoryId: string) => {
    const current = testSetupData.salesTriggerCategoryIds || [];
    const exists = current.includes(categoryId);
    updateTestSetupData({
      salesTriggerCategoryIds: exists
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    });
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            onClick={onClose}
            className="hover:text-foreground transition-colors"
          >
            Automations
          </button>
          <ArrowRight className="w-4 h-4" />
          <span className="text-foreground font-medium">{testingAutomation.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose} leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Test: {testingAutomation.name}</h2>
            <p className="text-sm text-muted-foreground">
              Send a customer message to preview the automation response.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {testState?.template?.followup?.status === 'scheduled' && (
              <Button variant="outline" size="sm" onClick={onSimulateFollowup} disabled={testSending}>
                Simulate Opening Hours
              </Button>
            )}
            {testTemplate?.id === 'after_hours_capture' && (
              <Button
                variant={testForceOutsideHours ? 'default' : 'outline'}
                size="sm"
                onClick={onToggleAfterHours}
              >
                {testForceOutsideHours ? 'Simulating After-Hours' : 'Simulate After-Hours'}
              </Button>
            )}
            {testTriggerMatched === false && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600">
                Trigger not matched
              </span>
            )}
            <Button variant="outline" size="sm" onClick={onReset}>
              Reset
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 flex-1 min-h-0 overflow-hidden">
          <div className="bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-2xl p-4 space-y-4 h-full min-h-0 overflow-y-auto">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Automation Settings</h4>
              <p className="text-xs text-muted-foreground dark:text-slate-400">
                Tweak the config and save to test updated behavior.
              </p>
            </div>
            <Input
              label="Name"
              value={testEditForm.name}
              onChange={(event) => updateTestEditForm({ name: event.target.value })}
            />
            <div>
              <label className="block text-sm font-medium mb-1.5">Description</label>
              <textarea
                value={testEditForm.description}
                onChange={(event) => updateTestEditForm({ description: event.target.value })}
                rows={2}
                className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
            </div>

            {testingAutomation?.replySteps[0]?.type === 'template_flow' && testTemplate && (
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {testTemplate.name}
                </div>
                {testTemplate.id === 'booking_concierge' && (
                  <>
                    <Input
                      label="Services"
                      value={testSetupData.serviceList}
                      onChange={(event) => updateTestSetupData({ serviceList: event.target.value })}
                      placeholder="Facial, Makeup, Botox"
                    />
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Price Ranges</label>
                      <textarea
                        value={testSetupData.priceRanges}
                        onChange={(event) => updateTestSetupData({ priceRanges: event.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                      />
                    </div>
                    <Input
                      label="Location Link"
                      value={testSetupData.locationLink}
                      onChange={(event) => updateTestSetupData({ locationLink: event.target.value })}
                    />
                    <Input
                      label="Location Hours"
                      value={testSetupData.locationHours}
                      onChange={(event) => updateTestSetupData({ locationHours: event.target.value })}
                    />
                    <Input
                      label="Min Phone Digits"
                      type="number"
                      value={testSetupData.phoneMinLength}
                      onChange={(event) => updateTestSetupData({ phoneMinLength: event.target.value })}
                    />
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">Trigger Mode</label>
                      <select
                        value={testSetupData.triggerMatchMode}
                        onChange={(event) => updateTestSetupData({ triggerMatchMode: event.target.value as SetupData['triggerMatchMode'] })}
                        className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                      >
                        <option value="any">Any (keywords, categories, links, attachments)</option>
                        <option value="keywords">Keywords only</option>
                        <option value="categories">AI categories only</option>
                      </select>
                    </div>
                    {(testSetupData.triggerMatchMode === 'any' || testSetupData.triggerMatchMode === 'keywords') && (
                      <div className="space-y-3">
                        <Input
                          label="Trigger Keywords"
                          value={testSetupData.triggerKeywords}
                          onChange={(event) => updateTestSetupData({ triggerKeywords: event.target.value })}
                          placeholder="book, booking, appointment"
                        />
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Match Rule</label>
                          <select
                            value={testSetupData.triggerKeywordMatch}
                            onChange={(event) => updateTestSetupData({ triggerKeywordMatch: event.target.value as 'any' | 'all' })}
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
                    {(testSetupData.triggerMatchMode === 'any' || testSetupData.triggerMatchMode === 'categories') && (
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
                                  checked={(testSetupData.triggerCategoryIds || []).includes(category._id)}
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
                  </>
                )}

                {testTemplate.id === 'sales_concierge' && (
                  <>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium">Trigger Mode</label>
                      <select
                        value={testSetupData.salesTriggerMatchMode}
                        onChange={(event) => updateTestSetupData({ salesTriggerMatchMode: event.target.value as SetupData['salesTriggerMatchMode'] })}
                        className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                      >
                        <option value="any">Any (keywords, categories, links, attachments)</option>
                        <option value="keywords">Keywords only</option>
                        <option value="categories">AI categories only</option>
                      </select>
                    </div>
                    {(testSetupData.salesTriggerMatchMode === 'any' || testSetupData.salesTriggerMatchMode === 'keywords') && (
                      <div className="space-y-3">
                        <Input
                          label="Sales Trigger Keywords"
                          value={testSetupData.salesTriggerKeywords}
                          onChange={(event) => updateTestSetupData({ salesTriggerKeywords: event.target.value })}
                          placeholder="price, stock, order, delivery"
                        />
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Match Rule</label>
                          <select
                            value={testSetupData.salesTriggerKeywordMatch}
                            onChange={(event) => updateTestSetupData({ salesTriggerKeywordMatch: event.target.value as 'any' | 'all' })}
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
                    {(testSetupData.salesTriggerMatchMode === 'any' || testSetupData.salesTriggerMatchMode === 'categories') && (
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
                                  checked={(testSetupData.salesTriggerCategoryIds || []).includes(category._id)}
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

                    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={!!testSetupData.salesUseGoogleSheets}
                          onChange={(event) => updateTestSetupData({ salesUseGoogleSheets: event.target.checked })}
                          className="rounded border-border"
                        />
                        Use connected Google Sheet for catalog + stock
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Requires a Google Sheets connection in Integrations. JSON catalog stays as fallback.
                      </p>
                    </div>

                    <Input
                      label="Min Phone Digits"
                      type="number"
                      value={testSetupData.salesPhoneMinLength}
                      onChange={(event) => updateTestSetupData({ salesPhoneMinLength: event.target.value })}
                      placeholder="8"
                    />

                    <div>
                      <label className="block text-sm font-medium mb-1.5">Knowledge Items</label>
                      {knowledgeItems.length === 0 ? (
                        <div className="text-xs text-muted-foreground">No knowledge items available.</div>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                          {knowledgeItems.map((item) => (
                            <label key={item._id} className="flex items-center gap-3 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={testSetupData.salesKnowledgeItemIds.includes(item._id)}
                                onChange={() => {
                                  const next = testSetupData.salesKnowledgeItemIds.includes(item._id)
                                    ? testSetupData.salesKnowledgeItemIds.filter((id) => id !== item._id)
                                    : [...testSetupData.salesKnowledgeItemIds, item._id];
                                  updateTestSetupData({ salesKnowledgeItemIds: next });
                                }}
                                className="rounded border-border"
                              />
                              <span className="text-muted-foreground">{item.title}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {testTemplate.id === 'after_hours_capture' && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        label="Open"
                        type="time"
                        value={testSetupData.businessHoursStart}
                        onChange={(event) => updateTestSetupData({ businessHoursStart: event.target.value })}
                      />
                      <Input
                        label="Close"
                        type="time"
                        value={testSetupData.businessHoursEnd}
                        onChange={(event) => updateTestSetupData({ businessHoursEnd: event.target.value })}
                      />
                    </div>
                    <Input
                      label="Timezone"
                      value={testSetupData.businessTimezone}
                      onChange={(event) => updateTestSetupData({ businessTimezone: event.target.value })}
                    />
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Closed Message</label>
                      <textarea
                        value={testSetupData.afterHoursMessage}
                        onChange={(event) => updateTestSetupData({ afterHoursMessage: event.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Next-Open Follow-up</label>
                      <textarea
                        value={testSetupData.followupMessage}
                        onChange={(event) => updateTestSetupData({ followupMessage: event.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {testingAutomation?.replySteps[0]?.type === 'constant_reply' && (
              <div>
                <label className="block text-sm font-medium mb-1.5">Constant Reply</label>
                <textarea
                  value={testEditForm.constantMessage}
                  onChange={(event) => updateTestEditForm({ constantMessage: event.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                />
              </div>
            )}

            {testingAutomation?.replySteps[0]?.type === 'ai_reply' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5">AI Goal</label>
                  <select
                    value={testEditForm.aiGoalType}
                    onChange={(event) => updateTestEditForm({ aiGoalType: event.target.value as GoalType })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  >
                    {GOAL_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Goal Description"
                  value={testEditForm.aiGoalDescription}
                  onChange={(event) => updateTestEditForm({ aiGoalDescription: event.target.value })}
                />
                <div>
                  <label className="block text-sm font-medium mb-1.5">Knowledge Items</label>
                  {knowledgeItems.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No knowledge items available.</div>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto border border-border rounded-lg p-3">
                      {knowledgeItems.map(item => (
                        <label key={item._id} className="flex items-center gap-3 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={testEditForm.aiKnowledgeIds.includes(item._id)}
                            onChange={() => {
                              updateTestEditForm({
                                aiKnowledgeIds: testEditForm.aiKnowledgeIds.includes(item._id)
                                  ? testEditForm.aiKnowledgeIds.filter(id => id !== item._id)
                                  : [...testEditForm.aiKnowledgeIds, item._id],
                              });
                            }}
                            className="rounded border-border"
                          />
                          <span className="text-muted-foreground">{item.title}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <Button onClick={onSaveConfig} isLoading={testSaving} className="w-full">
              Save Changes
            </Button>
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
                    messages={testMessages}
                    emptyStateText="No messages yet. Start the conversation below."
                    showSeen={testMessages.length > 0 && testMessages[testMessages.length - 1].from === 'ai'}
                    mode="interactive"
                    inputValue={testInput}
                    onInputChange={onChangeTestInput}
                    onSubmit={onSendMessage}
                    inputDisabled={testSending}
                    sendDisabled={!testInput.trim() || !testingAutomation || testSending}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
