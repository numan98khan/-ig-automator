import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAccountContext } from '../context/AccountContext';
import {
  automationAPI,
  knowledgeAPI,
  Automation,
  KnowledgeItem,
  TriggerType,
  GoalType,
  TriggerConfig,
  AutomationTemplateId,
  TemplateFlowConfig,
  AutomationTestState,
  AutomationTestContext,
} from '../services/api';
import {
  TRIGGER_METADATA,
  GOAL_OPTIONS,
  AUTOMATION_TEMPLATES,
  getDefaultSetupData,
  AutomationTemplate,
  SetupData,
} from './automations/constants';
import {
  AlertTriangle,
  PlayCircle,
  Clock,
} from 'lucide-react';
import { AutomationsSidebar } from './automations/AutomationsSidebar';
import { AutomationsListView } from './automations/AutomationsListView';
import { AutomationsTestView } from './automations/AutomationsTestView';
import { AutomationsCreateView } from './automations/AutomationsCreateView';
import { AutomationPlaceholderSection } from './automations/AutomationPlaceholderSection';
import { AutomationsHumanAlerts } from './automations/AutomationsHumanAlerts';
import Knowledge from './Knowledge';
import { AutomationsIntegrationsView } from './automations/AutomationsIntegrationsView';


const Automations: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const { activeAccount } = useAccountContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<'automations' | 'knowledge' | 'alerts' | 'routing' | 'followups' | 'integrations'>('automations');
  const [automationView, setAutomationView] = useState<'list' | 'create' | 'edit' | 'test'>('list');
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View states
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [isTemplateEditing, setIsTemplateEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    triggerType: 'post_comment' as TriggerType,
    replyType: 'constant_reply' as 'constant_reply' | 'ai_reply' | 'template_flow',
    constantMessage: '',
    aiGoalType: 'none' as GoalType,
    aiGoalDescription: '',
    aiKnowledgeIds: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [testingAutomation, setTestingAutomation] = useState<Automation | null>(null);
  const [testMessages, setTestMessages] = useState<Array<{ id: string; from: 'customer' | 'ai'; text: string }>>([]);
  const [testInput, setTestInput] = useState('');
  const [testState, setTestState] = useState<AutomationTestState | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testTriggerMatched, setTestTriggerMatched] = useState<boolean | null>(null);
  const [testForceOutsideHours, setTestForceOutsideHours] = useState(false);
  const [testEditForm, setTestEditForm] = useState({
    name: '',
    description: '',
    replyType: 'constant_reply' as 'constant_reply' | 'ai_reply' | 'template_flow',
    constantMessage: '',
    aiGoalType: 'none' as GoalType,
    aiGoalDescription: '',
    aiKnowledgeIds: [] as string[],
  });
  const [testTemplate, setTestTemplate] = useState<AutomationTemplate | null>(null);
  const [testSetupData, setTestSetupData] = useState<SetupData>(getDefaultSetupData());
  const [testSaving, setTestSaving] = useState(false);

  const accountDisplayName = activeAccount?.name || activeAccount?.username || 'Connected account';
  const accountHandle = activeAccount?.username || 'connected_account';
  const accountAvatarUrl = activeAccount?.profilePictureUrl;
  const accountInitial = accountDisplayName.charAt(0).toUpperCase();
  const isAutomationsSection = activeSection === 'automations';
  const isCreateView = isAutomationsSection && (automationView === 'create' || automationView === 'edit');
  const isTestView = isAutomationsSection && automationView === 'test' && !!testingAutomation;

  // Template mode states
  const [creationMode, setCreationMode] = useState<'templates' | 'custom'>('templates');
  const [currentStep, setCurrentStep] = useState<'gallery' | 'setup' | 'review'>('gallery');
  const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [goalFilter, setGoalFilter] = useState<'all' | 'Bookings' | 'Sales' | 'Leads' | 'Support'>('all');
  const [industryFilter, setIndustryFilter] = useState<'all' | 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General'>('all');
  const [setupData, setSetupData] = useState<SetupData>(getDefaultSetupData());
  const createViewTitle = editingAutomation
    ? 'Edit Automation'
    : currentStep === 'gallery'
    ? 'Create Automation'
    : currentStep === 'setup'
    ? `Setup: ${selectedTemplate?.name}`
    : 'Review & Activate';
  const isCreateSetupView = isCreateView && currentStep === 'setup';

  useEffect(() => {
    const section = searchParams.get('section');
    if (section === 'knowledge' || section === 'alerts') {
      setActiveSection(section);
    }
  }, [searchParams]);

  useEffect(() => {
    if (currentWorkspace) {
      loadData();
    }
  }, [currentWorkspace]);

  const loadData = async () => {
    if (!currentWorkspace) return;

    try {
      setLoading(true);
      setError(null);
      const [automationsData, knowledgeData] = await Promise.all([
        automationAPI.getByWorkspace(currentWorkspace._id),
        knowledgeAPI.getByWorkspace(currentWorkspace._id),
      ]);
      setAutomations(automationsData);
      setKnowledgeItems(knowledgeData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load automations');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingAutomation(null);
    setIsTemplateEditing(false);
    setFormData({
      name: '',
      description: '',
      triggerType: 'post_comment',
      replyType: 'constant_reply',
      constantMessage: '',
      aiGoalType: 'none',
      aiGoalDescription: '',
      aiKnowledgeIds: [],
    });
    // Reset template mode states
    setCreationMode('templates');
    setCurrentStep('gallery');
    setSelectedTemplate(null);
    setTemplateSearch('');
    setGoalFilter('all');
    setIndustryFilter('all');
    setSetupData(getDefaultSetupData());
    setTestingAutomation(null);
    setAutomationView('create');
  };

  const handleSectionChange = (section: 'automations' | 'knowledge' | 'alerts' | 'routing' | 'followups' | 'integrations') => {
    setActiveSection(section);
    if (section === 'knowledge' || section === 'alerts') {
      setSearchParams({ section });
    } else if (searchParams.get('section')) {
      setSearchParams({});
    }
  };

  const buildSetupDataFromTemplateConfig = (
    templateId: AutomationTemplateId,
    config: any,
    triggerConfig?: TriggerConfig,
  ) => {
    const base = getDefaultSetupData();
    const safeConfig = config || {};
    if (templateId === 'booking_concierge') {
      const triggerKeywords = Array.isArray(triggerConfig?.keywords)
        ? triggerConfig?.keywords.join(', ')
        : triggerConfig
          ? ''
          : base.triggerKeywords;
      return {
        ...base,
        serviceList: (safeConfig.serviceOptions || []).join(', '),
        priceRanges: safeConfig.priceRanges || '',
        locationLink: safeConfig.locationLink || '',
        locationHours: safeConfig.locationHours || '',
        phoneMinLength: String(safeConfig.minPhoneLength || base.phoneMinLength),
        triggerKeywords,
        triggerKeywordMatch: triggerConfig?.keywordMatch || base.triggerKeywordMatch,
      };
    }
    if (templateId === 'sales_concierge') {
      const triggerKeywords = Array.isArray(triggerConfig?.keywords)
        ? triggerConfig?.keywords.join(', ')
        : triggerConfig
          ? ''
          : base.salesTriggerKeywords;
      return {
        ...base,
        salesTriggerKeywords: triggerKeywords || base.salesTriggerKeywords,
        salesTriggerKeywordMatch: triggerConfig?.keywordMatch || base.salesTriggerKeywordMatch,
        salesPhoneMinLength: String(safeConfig.minPhoneLength || base.salesPhoneMinLength),
        salesCatalogJson: safeConfig.catalog ? JSON.stringify(safeConfig.catalog, null, 2) : base.salesCatalogJson,
        salesShippingJson: safeConfig.shippingRules ? JSON.stringify(safeConfig.shippingRules, null, 2) : base.salesShippingJson,
        salesCityAliasesJson: safeConfig.cityAliases ? JSON.stringify(safeConfig.cityAliases, null, 2) : base.salesCityAliasesJson,
      };
    }
    if (templateId === 'after_hours_capture') {
      return {
        ...base,
        businessHoursStart: safeConfig.businessHours?.startTime || base.businessHoursStart,
        businessHoursEnd: safeConfig.businessHours?.endTime || base.businessHoursEnd,
        businessTimezone: safeConfig.businessHours?.timezone || base.businessTimezone,
        afterHoursMessage: safeConfig.closedMessageTemplate || base.afterHoursMessage,
        followupMessage: safeConfig.followupMessage || base.followupMessage,
      };
    }
    return base;
  };

  const handleOpenEditModal = (automation: Automation) => {
    setEditingAutomation(automation);
    const replyStep = automation.replySteps[0];
    setFormData({
      name: automation.name,
      description: automation.description || '',
      triggerType: automation.triggerType,
      replyType: replyStep.type,
      constantMessage: replyStep.constantReply?.message || '',
      aiGoalType: replyStep.aiReply?.goalType || 'none',
      aiGoalDescription: replyStep.aiReply?.goalDescription || '',
      aiKnowledgeIds: replyStep.aiReply?.knowledgeItemIds || [],
    });

    if (replyStep.type === 'template_flow' && replyStep.templateFlow) {
      const template = AUTOMATION_TEMPLATES.find((item) => item.id === replyStep.templateFlow?.templateId);
      setCreationMode('templates');
      setCurrentStep('setup');
      setSelectedTemplate(template || null);
      setTemplateSearch('');
      setGoalFilter('all');
      setIndustryFilter('all');
      setIsTemplateEditing(!!template);

      if (replyStep.templateFlow.templateId === 'booking_concierge') {
        const config = replyStep.templateFlow.config as any;
        setSetupData(buildSetupDataFromTemplateConfig('booking_concierge', config, automation.triggerConfig));
      }

      if (replyStep.templateFlow.templateId === 'after_hours_capture') {
        const config = replyStep.templateFlow.config as any;
        setSetupData(buildSetupDataFromTemplateConfig('after_hours_capture', config, automation.triggerConfig));
      }
      if (!template) {
        setCurrentStep('gallery');
        setSelectedTemplate(null);
        setIsTemplateEditing(false);
      }
    } else {
      setIsTemplateEditing(false);
    }
    setTestingAutomation(null);
    setAutomationView('edit');
  };

  const handleOpenTestModal = (automation: Automation) => {
    setTestingAutomation(automation);
    setTestMessages([]);
    setTestInput('');
    setTestState(null);
    setTestTriggerMatched(null);
    const replyStep = automation.replySteps[0];
    setTestEditForm({
      name: automation.name,
      description: automation.description || '',
      replyType: replyStep.type,
      constantMessage: replyStep.constantReply?.message || '',
      aiGoalType: replyStep.aiReply?.goalType || 'none',
      aiGoalDescription: replyStep.aiReply?.goalDescription || '',
      aiKnowledgeIds: replyStep.aiReply?.knowledgeItemIds || [],
    });
    if (replyStep.type === 'template_flow' && replyStep.templateFlow) {
      const template = AUTOMATION_TEMPLATES.find((item) => item.id === replyStep.templateFlow?.templateId) || null;
      setTestTemplate(template);
      setTestSetupData(
        buildSetupDataFromTemplateConfig(
          replyStep.templateFlow.templateId,
          replyStep.templateFlow.config as any,
          automation.triggerConfig,
        ),
      );
      setTestForceOutsideHours(replyStep.templateFlow.templateId === 'after_hours_capture');
    } else {
      setTestTemplate(null);
      setTestSetupData(getDefaultSetupData());
      setTestForceOutsideHours(false);
    }
    setAutomationView('test');
  };

  const handleResetTest = () => {
    setTestMessages([]);
    setTestInput('');
    setTestState(null);
    setTestTriggerMatched(null);
    setTestForceOutsideHours(testTemplate?.id === 'after_hours_capture');
  };

  const handleCloseTestView = () => {
    handleResetTest();
    setTestingAutomation(null);
    setTestTemplate(null);
    setTestSetupData(getDefaultSetupData());
    setTestForceOutsideHours(false);
    setAutomationView('list');
  };

  const handleCloseCreateView = () => {
    setAutomationView('list');
    setEditingAutomation(null);
    setIsTemplateEditing(false);
    setCreationMode('templates');
    setCurrentStep('gallery');
    setSelectedTemplate(null);
    setTemplateSearch('');
    setGoalFilter('all');
    setIndustryFilter('all');
    setSetupData(getDefaultSetupData());
  };

  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testingAutomation || !testInput.trim()) return;

    const messageText = testInput.trim();
    const messageId = `${Date.now()}-${Math.random()}`;
    setTestMessages((prev) => [...prev, { id: messageId, from: 'customer', text: messageText }]);
    setTestInput('');
    setTestSending(true);

    try {
      const context: AutomationTestContext = { forceOutsideBusinessHours: testForceOutsideHours };
      const result = await automationAPI.test(testingAutomation._id, messageText, testState || undefined, context);
      setTestState(result.state);
      setTestTriggerMatched(result.meta?.triggerMatched ?? null);
      setTestMessages((prev) => [
        ...prev,
        ...result.replies.map((reply, index) => ({
          id: `${messageId}-reply-${index}`,
          from: 'ai' as const,
          text: reply,
        })),
      ]);
    } catch (err) {
      console.error('Error testing automation:', err);
      setError('Failed to test automation');
    } finally {
      setTestSending(false);
    }
  };

  const handleSimulateFollowup = async () => {
    if (!testingAutomation || !testState?.template?.followup || testState.template.followup.status !== 'scheduled') {
      return;
    }
    setTestSending(true);
    try {
      const context: AutomationTestContext = { forceOutsideBusinessHours: testForceOutsideHours };
      const result = await automationAPI.testAction(testingAutomation._id, 'simulate_followup', testState, context);
      setTestState(result.state);
      setTestMessages((prev) => [
        ...prev,
        ...result.replies.map((reply, index) => ({
          id: `followup-${Date.now()}-${index}`,
          from: 'ai' as const,
          text: reply,
        })),
      ]);
    } catch (err) {
      console.error('Error simulating follow-up:', err);
      setError('Failed to simulate follow-up');
    } finally {
      setTestSending(false);
    }
  };

  const handleSaveTestConfig = async () => {
    if (!testingAutomation) return;
    setTestSaving(true);
    try {
      let replyStep;
      let triggerConfig: TriggerConfig | undefined;

      if (testingAutomation.replySteps[0]?.type === 'template_flow') {
        if (!testTemplate) {
          setError('Template configuration not found for this automation.');
          return;
        }
        const templateFlow = buildTemplateFlow(testTemplate, testSetupData);
        if (!templateFlow) {
          setError('Template configuration is incomplete.');
          return;
        }
        replyStep = {
          type: 'template_flow' as const,
          templateFlow,
        };
        triggerConfig = buildTemplateTriggerConfig(testTemplate, templateFlow, testSetupData);
      } else if (testEditForm.replyType === 'constant_reply') {
        replyStep = {
          type: 'constant_reply' as const,
          constantReply: { message: testEditForm.constantMessage },
        };
      } else {
        replyStep = {
          type: 'ai_reply' as const,
          aiReply: {
            goalType: testEditForm.aiGoalType,
            goalDescription: testEditForm.aiGoalDescription,
            knowledgeItemIds: testEditForm.aiKnowledgeIds,
          },
        };
      }

      await automationAPI.update(testingAutomation._id, {
        name: testEditForm.name,
        description: testEditForm.description,
        ...(triggerConfig ? { triggerConfig } : {}),
        replySteps: [replyStep],
      });

      setTestingAutomation({
        ...testingAutomation,
        name: testEditForm.name,
        description: testEditForm.description,
        ...(triggerConfig ? { triggerConfig } : {}),
        replySteps: [replyStep],
      });
      handleResetTest();
      await loadData();
    } catch (err) {
      console.error('Error saving automation changes:', err);
      setError('Failed to save automation changes');
    } finally {
      setTestSaving(false);
    }
  };

  const buildTemplateFlow = (
    template: AutomationTemplate,
    data: SetupData = setupData
  ): TemplateFlowConfig | null => {
    if (template.id === 'booking_concierge') {
      const services = data.serviceList
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      return {
        templateId: 'booking_concierge',
        config: {
          quickReplies: ['Book appointment', 'Prices', 'Location', 'Talk to staff'],
          serviceOptions: services,
          priceRanges: data.priceRanges.trim() || undefined,
          locationLink: data.locationLink.trim() || undefined,
          locationHours: data.locationHours.trim() || undefined,
          minPhoneLength: Number.parseInt(data.phoneMinLength, 10) || 8,
          maxQuestions: 5,
          rateLimit: { maxMessages: 5, perMinutes: 1 },
          handoffTeam: 'reception',
          tags: ['intent_booking', 'template_booking_concierge'],
          outputs: {
            sheetRow: 'Leads',
            notify: ['owner', 'reception'],
            createContact: true,
          },
        },
      };
    }

    if (template.id === 'sales_concierge') {
      let catalog;
      let shippingRules;
      let cityAliases;
      try {
        catalog = JSON.parse(data.salesCatalogJson || '[]');
        shippingRules = JSON.parse(data.salesShippingJson || '[]');
        cityAliases = data.salesCityAliasesJson ? JSON.parse(data.salesCityAliasesJson) : {};
      } catch (error) {
        return null;
      }
      if (!Array.isArray(catalog) || !Array.isArray(shippingRules)) {
        return null;
      }
      return {
        templateId: 'sales_concierge',
        config: {
          catalog,
          shippingRules,
          cityAliases,
          minPhoneLength: Number.parseInt(data.salesPhoneMinLength, 10) || 8,
          maxQuestions: 6,
          rateLimit: { maxMessages: 6, perMinutes: 1 },
          tags: ['intent_purchase', 'template_sales_concierge'],
          outputs: {
            notify: ['sales', 'owner'],
            createContact: true,
          },
        },
      };
    }

    if (template.id === 'after_hours_capture') {
      return {
        templateId: 'after_hours_capture',
        config: {
          businessHours: {
            startTime: data.businessHoursStart,
            endTime: data.businessHoursEnd,
            timezone: data.businessTimezone,
          },
          closedMessageTemplate: data.afterHoursMessage.trim() || "We're closed - leave details, we'll contact you at {next_open_time}.",
          intentOptions: ['Booking', 'Prices', 'Order', 'Other'],
          followupMessage: data.followupMessage.trim() || "We're open now if you'd like to continue. Reply anytime.",
          maxQuestions: 4,
          rateLimit: { maxMessages: 4, perMinutes: 1 },
          tags: ['after_hours_lead', 'template_after_hours_capture'],
          outputs: {
            sheetRow: 'AfterHoursLeads',
            notify: ['owner', 'staff'],
            digestInclude: true,
          },
        },
      };
    }

    return null;
  };

  const buildTemplateTriggerConfig = (
    template: AutomationTemplate,
    flow: TemplateFlowConfig,
    data: SetupData = setupData,
  ): TriggerConfig | undefined => {
    const baseConfig = template.triggerConfig || {};
    if (flow.templateId === 'booking_concierge') {
      const keywordList = (data.triggerKeywords || '')
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean);
      return {
        ...baseConfig,
        keywordMatch: data.triggerKeywordMatch || baseConfig.keywordMatch || 'any',
        keywords: keywordList,
      };
    }
    if (flow.templateId === 'sales_concierge') {
      const keywordList = (data.salesTriggerKeywords || '')
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean);
      return {
        ...baseConfig,
        keywordMatch: data.salesTriggerKeywordMatch || baseConfig.keywordMatch || 'any',
        keywords: keywordList,
        matchOn: {
          link: true,
          attachment: true,
        },
      };
    }
    if (flow.templateId === 'after_hours_capture') {
      const afterHoursConfig = flow.config as any;
      return {
        ...baseConfig,
        outsideBusinessHours: true,
        businessHours: afterHoursConfig.businessHours,
      };
    }
    return baseConfig;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!currentWorkspace) return;

    setSaving(true);
    try {
      const isTemplateFlow = selectedTemplate?.replyType === 'template_flow';
      const templateFlow = isTemplateFlow && selectedTemplate ? buildTemplateFlow(selectedTemplate) : null;
      if (isTemplateFlow && !templateFlow) {
        setError('Template configuration is incomplete.');
        return;
      }
      const replyStep = isTemplateFlow && templateFlow
        ? {
            type: 'template_flow' as const,
            templateFlow,
          }
        : formData.replyType === 'constant_reply'
          ? {
              type: 'constant_reply' as const,
              constantReply: { message: formData.constantMessage },
            }
          : {
              type: 'ai_reply' as const,
              aiReply: {
                goalType: formData.aiGoalType,
                goalDescription: formData.aiGoalDescription,
                knowledgeItemIds: formData.aiKnowledgeIds,
              },
            };

      const triggerConfig = isTemplateFlow && templateFlow && selectedTemplate
        ? buildTemplateTriggerConfig(selectedTemplate, templateFlow, setupData)
        : undefined;

      if (editingAutomation) {
        await automationAPI.update(editingAutomation._id, {
          name: formData.name,
          description: formData.description,
          triggerType: formData.triggerType,
          ...(triggerConfig ? { triggerConfig } : {}),
          replySteps: [replyStep],
        });
      } else {
        await automationAPI.create({
          name: formData.name,
          description: formData.description,
          workspaceId: currentWorkspace._id,
          triggerType: isTemplateFlow && selectedTemplate ? selectedTemplate.triggerType : formData.triggerType,
          ...(triggerConfig ? { triggerConfig } : {}),
          replySteps: [replyStep],
          isActive: true,
        });
      }

      handleCloseCreateView();
      loadData();
    } catch (err) {
      console.error('Error saving automation:', err);
      setError('Failed to save automation');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (automation: Automation) => {
    try {
      await automationAPI.toggle(automation._id);
      loadData();
    } catch (err) {
      console.error('Error toggling automation:', err);
      setError('Failed to toggle automation');
    }
  };

  const handleDelete = async (automation: Automation) => {
    if (!confirm(`Are you sure you want to delete "${automation.name}"?`)) return;

    try {
      await automationAPI.delete(automation._id);
      loadData();
    } catch (err) {
      console.error('Error deleting automation:', err);
      setError('Failed to delete automation');
    }
  };

  const toggleKnowledge = (knowledgeId: string) => {
    setFormData(prev => ({
      ...prev,
      aiKnowledgeIds: prev.aiKnowledgeIds.includes(knowledgeId)
        ? prev.aiKnowledgeIds.filter(id => id !== knowledgeId)
        : [...prev.aiKnowledgeIds, knowledgeId],
    }));
  };

  const handleSelectTemplate = (template: AutomationTemplate) => {
    setSelectedTemplate(template);
    setCurrentStep('setup');
    setFormData({
      name: template.name,
      description: template.outcome,
      triggerType: template.triggerType,
      replyType: template.replyType,
      constantMessage: '',
      aiGoalType: template.aiGoalType || 'none',
      aiGoalDescription: '',
      aiKnowledgeIds: [],
    });
  };

  const handleBackToGallery = () => {
    setCurrentStep('gallery');
    setSelectedTemplate(null);
  };

  const handleBackToSetup = () => {
    if (currentStep === 'review') {
      setCurrentStep('setup');
    }
  };

  const handleContinueToReview = () => {
    setCurrentStep('review');
  };

  const handleTestInputChange = (value: string) => {
    setTestInput(value);
  };

  if (!currentWorkspace) return null;

  return (
    <div className={`h-full flex flex-col ${isTestView || isCreateSetupView ? 'overflow-hidden' : ''}`}>
      {/* Header */}
      {/* <div className="mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Automation Control Center</h1>
          <p className="text-muted-foreground">
            Configure playbooks, triggers, routing rules, and AI policies to automate your customer conversations safely and effectively.
          </p>
        </div>
      </div> */}

      {/* Main Content - Side Nav + Content Area */}
      <div className={`flex flex-col lg:flex-row gap-6 ${isTestView || isCreateSetupView ? 'flex-1 min-h-0' : ''}`}>
        {/* Left Side Navigation */}
        <AutomationsSidebar
          activeSection={activeSection}
          onChange={handleSectionChange}
        />

        {/* Right Content Area */}
        <div
          className={`flex-1 min-h-0 ${
            isTestView || isCreateSetupView ? 'flex flex-col gap-6 overflow-hidden' : 'space-y-6'
          }`}
        >
          {/* Error Alert */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 animate-fade-in">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 font-medium text-sm">{error}</span>
            </div>
          )}

          {activeSection === 'automations' && (
            <div
              className={`animate-fade-in ${
                isTestView || isCreateView
                  ? `min-h-0 flex-1 flex flex-col gap-6${isTestView || isCreateSetupView ? ' overflow-hidden' : ''}`
                  : 'space-y-6'
              }`}
            >
              {isTestView ? (
                <AutomationsTestView
                  testingAutomation={testingAutomation!}
                  accountDisplayName={accountDisplayName}
                  accountHandle={accountHandle}
                  accountAvatarUrl={accountAvatarUrl}
                  accountInitial={accountInitial}
                  knowledgeItems={knowledgeItems}
                  testMessages={testMessages}
                  testInput={testInput}
                  testState={testState}
                  testTriggerMatched={testTriggerMatched}
                  testForceOutsideHours={testForceOutsideHours}
                  testSending={testSending}
                  testEditForm={testEditForm}
                  testTemplate={testTemplate}
                  testSetupData={testSetupData}
                  testSaving={testSaving}
                  onClose={handleCloseTestView}
                  onReset={handleResetTest}
                  onSimulateFollowup={handleSimulateFollowup}
                  onToggleAfterHours={() => setTestForceOutsideHours((prev) => !prev)}
                  onSendMessage={handleSendTestMessage}
                  onSaveConfig={handleSaveTestConfig}
                  onChangeTestInput={handleTestInputChange}
                  onUpdateTestEditForm={setTestEditForm}
                  onUpdateTestSetupData={setTestSetupData}
                />
              ) : isCreateView ? (
                <AutomationsCreateView
                  createViewTitle={createViewTitle}
                  isCreateSetupView={isCreateSetupView}
                  editingAutomation={editingAutomation}
                  isTemplateEditing={isTemplateEditing}
                  creationMode={creationMode}
                  currentStep={currentStep}
                  selectedTemplate={selectedTemplate}
                  templateSearch={templateSearch}
                  goalFilter={goalFilter}
                  industryFilter={industryFilter}
                  formData={formData}
                  setupData={setupData}
                  saving={saving}
                  knowledgeItems={knowledgeItems}
                  accountDisplayName={accountDisplayName}
                  accountHandle={accountHandle}
                  accountAvatarUrl={accountAvatarUrl}
                  accountInitial={accountInitial}
                  onClose={handleCloseCreateView}
                  onSubmit={handleSubmit}
                  onSelectTemplate={handleSelectTemplate}
                  onChangeCreationMode={setCreationMode}
                  onChangeTemplateSearch={setTemplateSearch}
                  onChangeGoalFilter={setGoalFilter}
                  onBackToGallery={handleBackToGallery}
                  onBackToSetup={handleBackToSetup}
                  onContinueToReview={handleContinueToReview}
                  onUpdateFormData={setFormData}
                  onUpdateSetupData={setSetupData}
                  onToggleKnowledge={toggleKnowledge}
                />
              ) : (
                <AutomationsListView
                  automations={automations}
                  loading={loading}
                  onCreate={handleOpenCreateModal}
                  onOpen={handleOpenTestModal}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              )}
            </div>
          )}

          {activeSection === 'knowledge' && (
            <Knowledge />
          )}

          {activeSection === 'alerts' && (
            <AutomationsHumanAlerts />
          )}

          {activeSection === 'routing' && (
            <AutomationPlaceholderSection
              icon={<PlayCircle className="w-16 h-16" />}
              title="Routing & Handoffs"
              subtitle="Coming Soon"
              description="Advanced routing rules and handoff configurations will be available here."
            />
          )}

          {activeSection === 'followups' && (
            <AutomationPlaceholderSection
              icon={<Clock className="w-16 h-16" />}
              title="Follow-ups"
              subtitle="Configure automated follow-up messages"
              description="Set up automated follow-up messages to re-engage customers at the right time."
            />
          )}

          {activeSection === 'integrations' && (
            <AutomationsIntegrationsView />
          )}
        </div>
      </div>

    </div>

  );
};

export default Automations;
