import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
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
} from '../services/api';
import {
  Plus,
  MessageSquare,
  AlertTriangle,
  Link as LinkIcon,
  PlayCircle,
  Clock,
  Loader2,
  Target,
  MessageCircle,
  Share2,
  Megaphone,
  Video,
  ExternalLink,
  Edit2,
  Trash2,
  Power,
  PowerOff,
  Send,
  Search,
  Calendar,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Sparkles,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';

// Trigger metadata
const TRIGGER_METADATA: Record<TriggerType, { icon: React.ReactNode; label: string; description: string; badge?: string }> = {
  post_comment: {
    icon: <MessageSquare className="w-5 h-5" />,
    label: 'Post or Reel Comments',
    description: 'User comments on your Post or Reel',
  },
  story_reply: {
    icon: <MessageCircle className="w-5 h-5" />,
    label: 'Story Reply',
    description: 'User replies to your Story',
  },
  dm_message: {
    icon: <Send className="w-5 h-5" />,
    label: 'Instagram Message',
    description: 'User sends a message',
  },
  story_share: {
    icon: <Share2 className="w-5 h-5" />,
    label: 'Story Share',
    description: 'User shares your Post or Reel as a Story',
    badge: 'NEW',
  },
  instagram_ads: {
    icon: <Megaphone className="w-5 h-5" />,
    label: 'Instagram Ads',
    description: 'User clicks an Instagram Ad',
    badge: 'PRO',
  },
  live_comment: {
    icon: <Video className="w-5 h-5" />,
    label: 'Live Comments',
    description: 'User comments on your Live',
  },
  ref_url: {
    icon: <ExternalLink className="w-5 h-5" />,
    label: 'Instagram Ref URL',
    description: 'User clicks a referral link',
  },
};

const GOAL_OPTIONS: { value: GoalType; label: string; description: string }[] = [
  { value: 'none', label: 'No specific goal', description: 'Just have a conversation' },
  { value: 'capture_lead', label: 'Capture Lead', description: 'Collect customer information' },
  { value: 'book_appointment', label: 'Book Appointment', description: 'Schedule a booking' },
  { value: 'start_order', label: 'Start Order', description: 'Begin order process' },
  { value: 'handle_support', label: 'Handle Support', description: 'Provide customer support' },
  { value: 'drive_to_channel', label: 'Drive to Channel', description: 'Direct to external link' },
];

// Template types
interface AutomationTemplate {
  id: AutomationTemplateId;
  name: string;
  outcome: string;
  goal: 'Bookings' | 'Sales' | 'Leads' | 'Support';
  industry: 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General';
  triggers: TriggerType[];
  setupTime: string;
  collects: string[];
  icon: React.ReactNode;
  triggerType: TriggerType;
  triggerConfig?: TriggerConfig;
  replyType: 'constant_reply' | 'ai_reply' | 'template_flow';
  aiGoalType?: GoalType;
  previewConversation: { from: 'bot' | 'customer'; message: string }[];
  setupFields: {
    serviceList?: boolean;
    priceRanges?: boolean;
    locationLink?: boolean;
    locationHours?: boolean;
    phoneMinLength?: boolean;
    businessHoursTime?: boolean;
    businessTimezone?: boolean;
    afterHoursMessage?: boolean;
    followupMessage?: boolean;
  };
}

const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'booking_concierge',
    name: 'Instant Booking Concierge',
    outcome: 'Capture booking leads in under 60 seconds',
    goal: 'Bookings',
    industry: 'Clinics',
    triggers: ['dm_message'],
    setupTime: '~2 min',
    collects: ['lead name', 'phone', 'service', 'preferred day/time'],
    icon: <Calendar className="w-5 h-5" />,
    triggerType: 'dm_message',
    triggerConfig: {
      keywordMatch: 'any',
      keywords: ['book', 'booking', 'appointment', 'slot', 'available', 'availability', 'حجز', 'موعد', 'سعر', 'price'],
    },
    replyType: 'template_flow',
    previewConversation: [
      { from: 'customer', message: 'Do you have availability this week?' },
      { from: 'bot', message: 'Hi! I can help with bookings. Choose: Book appointment, Prices, Location, Talk to staff.' },
      { from: 'customer', message: 'Book appointment' },
      { from: 'bot', message: "Great! What's your name?" },
    ],
    setupFields: {
      serviceList: true,
      priceRanges: true,
      locationLink: true,
      locationHours: true,
      phoneMinLength: true,
    },
  },
  {
    id: 'after_hours_capture',
    name: 'After-Hours Lead Capture',
    outcome: "Capture leads when you're closed and follow up next open",
    goal: 'Leads',
    industry: 'General',
    triggers: ['dm_message'],
    setupTime: '~2 min',
    collects: ['phone', 'intent', 'preferred time'],
    icon: <Clock className="w-5 h-5" />,
    triggerType: 'dm_message',
    triggerConfig: {
      outsideBusinessHours: true,
    },
    replyType: 'template_flow',
    previewConversation: [
      { from: 'customer', message: 'Are you open now?' },
      { from: 'bot', message: "We're closed - leave details, we'll contact you at 9:00 AM." },
      { from: 'bot', message: 'What can we help with? Booking, Prices, Order, Other.' },
      { from: 'customer', message: 'Booking' },
    ],
    setupFields: {
      businessHoursTime: true,
      businessTimezone: true,
      afterHoursMessage: true,
      followupMessage: true,
    },
  },
];

const Automations: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [activeSection, setActiveSection] = useState<'automations' | 'routing' | 'followups' | 'integrations'>('automations');
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
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

  // Template mode states
  const [creationMode, setCreationMode] = useState<'templates' | 'custom'>('templates');
  const [currentStep, setCurrentStep] = useState<'gallery' | 'setup' | 'review'>('gallery');
  const [selectedTemplate, setSelectedTemplate] = useState<AutomationTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [goalFilter, setGoalFilter] = useState<'all' | 'Bookings' | 'Sales' | 'Leads' | 'Support'>('all');
  const [industryFilter, setIndustryFilter] = useState<'all' | 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General'>('all');
  const [setupData, setSetupData] = useState({
    serviceList: '',
    priceRanges: '',
    locationLink: '',
    locationHours: '',
    phoneMinLength: '8',
    businessHoursStart: '09:00',
    businessHoursEnd: '17:00',
    businessTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    afterHoursMessage: "We're closed - leave details, we'll contact you at {next_open_time}.",
    followupMessage: "We're open now if you'd like to continue. Reply anytime.",
  });

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
    setSetupData({
      serviceList: '',
      priceRanges: '',
      locationLink: '',
      locationHours: '',
      phoneMinLength: '8',
      businessHoursStart: '09:00',
      businessHoursEnd: '17:00',
      businessTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      afterHoursMessage: "We're closed - leave details, we'll contact you at {next_open_time}.",
      followupMessage: "We're open now if you'd like to continue. Reply anytime.",
    });
    setIsCreateModalOpen(true);
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

      if (!template) {
        setIsCreateModalOpen(true);
        return;
      }

      if (replyStep.templateFlow.templateId === 'booking_concierge') {
        const config = replyStep.templateFlow.config as any;
        setSetupData({
          serviceList: (config.serviceOptions || []).join(', '),
          priceRanges: config.priceRanges || '',
          locationLink: config.locationLink || '',
          locationHours: config.locationHours || '',
          phoneMinLength: String(config.minPhoneLength || '8'),
          businessHoursStart: '',
          businessHoursEnd: '',
          businessTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          afterHoursMessage: "We're closed - leave details, we'll contact you at {next_open_time}.",
          followupMessage: "We're open now if you'd like to continue. Reply anytime.",
        });
      }

      if (replyStep.templateFlow.templateId === 'after_hours_capture') {
        const config = replyStep.templateFlow.config as any;
        setSetupData({
          serviceList: '',
          priceRanges: '',
          locationLink: '',
          locationHours: '',
          phoneMinLength: '8',
          businessHoursStart: config.businessHours?.startTime || '',
          businessHoursEnd: config.businessHours?.endTime || '',
          businessTimezone: config.businessHours?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          afterHoursMessage: config.closedMessageTemplate || "We're closed - leave details, we'll contact you at {next_open_time}.",
          followupMessage: config.followupMessage || "We're open now if you'd like to continue. Reply anytime.",
        });
      }
    } else {
      setIsTemplateEditing(false);
    }
    setIsCreateModalOpen(true);
  };

  const buildTemplateFlow = (template: AutomationTemplate): TemplateFlowConfig | null => {
    if (template.id === 'booking_concierge') {
      const services = setupData.serviceList
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      return {
        templateId: 'booking_concierge',
        config: {
          quickReplies: ['Book appointment', 'Prices', 'Location', 'Talk to staff'],
          serviceOptions: services,
          priceRanges: setupData.priceRanges.trim() || undefined,
          locationLink: setupData.locationLink.trim() || undefined,
          locationHours: setupData.locationHours.trim() || undefined,
          minPhoneLength: Number.parseInt(setupData.phoneMinLength, 10) || 8,
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

    if (template.id === 'after_hours_capture') {
      return {
        templateId: 'after_hours_capture',
        config: {
          businessHours: {
            startTime: setupData.businessHoursStart,
            endTime: setupData.businessHoursEnd,
            timezone: setupData.businessTimezone,
          },
          closedMessageTemplate: setupData.afterHoursMessage.trim() || "We're closed - leave details, we'll contact you at {next_open_time}.",
          intentOptions: ['Booking', 'Prices', 'Order', 'Other'],
          followupMessage: setupData.followupMessage.trim() || "We're open now if you'd like to continue. Reply anytime.",
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

  const buildTemplateTriggerConfig = (template: AutomationTemplate, flow: TemplateFlowConfig): TriggerConfig | undefined => {
    const baseConfig = template.triggerConfig || {};
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        ? buildTemplateTriggerConfig(selectedTemplate, templateFlow)
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

      setIsCreateModalOpen(false);
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

  if (!currentWorkspace) return null;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Automation Control Center</h1>
          <p className="text-muted-foreground">
            Configure playbooks, triggers, routing rules, and AI policies to automate your customer conversations safely and effectively.
          </p>
        </div>
      </div>

      {/* Main Content - Side Nav + Content Area */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Side Navigation */}
        <aside className="lg:w-64 flex-shrink-0">
          <div className="bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-xl p-2 space-y-1 shadow-sm backdrop-blur-sm">
            <button
              onClick={() => setActiveSection('automations')}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
                activeSection === 'automations'
                  ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <Target className="w-4 h-4" />
              <span className="flex-1 text-sm font-medium">Automations</span>
            </button>
            <button
              onClick={() => setActiveSection('routing')}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
                activeSection === 'routing'
                  ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <PlayCircle className="w-4 h-4" />
              <span className="flex-1 text-sm font-medium">Routing & Handoffs</span>
            </button>
            <button
              onClick={() => setActiveSection('followups')}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
                activeSection === 'followups'
                  ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span className="flex-1 text-sm font-medium">Follow-ups</span>
            </button>
            <button
              onClick={() => setActiveSection('integrations')}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
                activeSection === 'integrations'
                  ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              <span className="flex-1 text-sm font-medium">Integrations</span>
            </button>
          </div>
        </aside>

        {/* Right Content Area */}
        <div className="flex-1 space-y-6">
          {/* Error Alert */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 animate-fade-in">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 font-medium text-sm">{error}</span>
            </div>
          )}
          {activeSection === 'automations' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Available Automations</h2>
                <Button onClick={handleOpenCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
                  Create Automation
                </Button>
              </div>

              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : automations.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
                  <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No automations yet</h3>
                  <p className="text-muted-foreground mb-6">
                    Create your first automation to start automating your Instagram conversations.
                  </p>
                  <Button onClick={handleOpenCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
                    Create Automation
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {automations.map((automation) => {
                    const trigger = TRIGGER_METADATA[automation.triggerType];
                    const replyStep = automation.replySteps[0];

                    return (
                      <div
                        key={automation._id}
                        className="bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-xl p-6 shadow-sm backdrop-blur-sm hover:shadow-lg transition-all relative group"
                      >
                        {/* Badge for trigger */}
                        {trigger.badge && (
                          <div className="absolute top-4 right-4">
                            <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                              trigger.badge === 'PRO' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'
                            }`}>
                              {trigger.badge}
                            </span>
                          </div>
                        )}

                        {/* Icon and Title */}
                        <div className="flex items-start gap-3 mb-4">
                          <div className="p-2 bg-primary/10 text-primary rounded-lg">
                            {trigger.icon}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-1">{automation.name}</h3>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {automation.description || trigger.description}
                            </p>
                          </div>
                        </div>

                        {/* Trigger Info */}
                        <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                          <div className="text-xs font-medium text-muted-foreground mb-1">TRIGGER</div>
                          <div className="text-sm font-medium">{trigger.label}</div>
                        </div>

                        {/* Reply Info */}
                        <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                          <div className="text-xs font-medium text-muted-foreground mb-1">REPLY</div>
                          <div className="text-sm font-medium">
                            {replyStep.type === 'constant_reply' ? (
                              <span>Constant Reply</span>
                            ) : replyStep.type === 'ai_reply' ? (
                              <span>AI Reply - {GOAL_OPTIONS.find(g => g.value === replyStep.aiReply?.goalType)?.label}</span>
                            ) : (
                              <span>
                                Template - {AUTOMATION_TEMPLATES.find(t => t.id === replyStep.templateFlow?.templateId)?.name || 'Template'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                          <div>
                            <div className="text-muted-foreground text-xs">Triggered</div>
                            <div className="font-semibold">{automation.stats.totalTriggered}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Replies Sent</div>
                            <div className="font-semibold">{automation.stats.totalRepliesSent}</div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleToggle(automation)}
                            variant={automation.isActive ? 'primary' : 'outline'}
                            className="flex-1"
                            size="sm"
                            leftIcon={automation.isActive ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                          >
                            {automation.isActive ? 'Active' : 'Inactive'}
                          </Button>
                          <button
                            onClick={() => handleOpenEditModal(automation)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(automation)}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeSection === 'routing' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center py-16 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
                <PlayCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-2xl font-semibold mb-2">Routing & Handoffs</h3>
                <p className="text-muted-foreground text-lg mb-4">Coming Soon</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Advanced routing rules and handoff configurations will be available here.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'followups' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center py-16 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
                <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-2xl font-semibold mb-2">Follow-ups</h3>
                <p className="text-muted-foreground text-lg mb-4">Configure automated follow-up messages</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Set up automated follow-up messages to re-engage customers at the right time.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'integrations' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center py-16 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
                <LinkIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-2xl font-semibold mb-2">Integrations</h3>
                <p className="text-muted-foreground text-lg mb-4">Coming Soon</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Connect to external services like Sheets, Calendly, and more.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={
          editingAutomation
            ? 'Edit Automation'
            : currentStep === 'gallery'
            ? 'Create Automation'
            : currentStep === 'setup'
            ? `Setup: ${selectedTemplate?.name}`
            : 'Review & Activate'
        }
        size="xl"
      >
        {/* Editing mode: show old form */}
        {editingAutomation && !isTemplateEditing ? (
          <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Welcome New Followers"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Description (optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this automation does..."
              rows={3}
              className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          {/* Trigger Type */}
          <div>
            <label className="block text-sm font-medium mb-2">Trigger</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
              {Object.entries(TRIGGER_METADATA).map(([type, meta]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, triggerType: type as TriggerType })}
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

          {/* Reply Type */}
          <div>
            <label className="block text-sm font-medium mb-2">Reply Type</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, replyType: 'constant_reply' })}
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
                onClick={() => setFormData({ ...formData, replyType: 'ai_reply' })}
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

          {/* Constant Reply */}
          {formData.replyType === 'constant_reply' && (
            <div>
              <label className="block text-sm font-medium mb-1.5">Message</label>
              <textarea
                value={formData.constantMessage}
                onChange={(e) => setFormData({ ...formData, constantMessage: e.target.value })}
                placeholder="Enter your message..."
                rows={4}
                className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                required
              />
            </div>
          )}

          {/* AI Reply */}
          {formData.replyType === 'ai_reply' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Goal</label>
                <select
                  value={formData.aiGoalType}
                  onChange={(e) => setFormData({ ...formData, aiGoalType: e.target.value as GoalType })}
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
                  onChange={(e) => setFormData({ ...formData, aiGoalDescription: e.target.value })}
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
                          onChange={() => toggleKnowledge(item._id)}
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

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              {editingAutomation ? 'Save Changes' : 'Create Automation'}
            </Button>
          </div>
        </form>
        ) : (
          /* New template-based creation flow */
          <div className="space-y-6">
            {/* Step 1: Segmented Control - Templates vs Custom */}
            {currentStep === 'gallery' && (
              <>
                <div className="flex items-center gap-3 p-1 bg-muted/40 rounded-lg w-fit">
                  <button
                    onClick={() => setCreationMode('templates')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      creationMode === 'templates'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Templates <span className="text-xs text-primary">(Recommended)</span>
                  </button>
                  <button
                    onClick={() => setCreationMode('custom')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      creationMode === 'custom'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {/* Template Gallery */}
                {creationMode === 'templates' ? (
                  <div className="space-y-4">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={templateSearch}
                        onChange={(e) => setTemplateSearch(e.target.value)}
                        placeholder="Search templates..."
                        className="pl-10"
                      />
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Goal:</span>
                        {(['all', 'Bookings', 'Sales', 'Leads', 'Support'] as const).map((goal) => (
                          <button
                            key={goal}
                            onClick={() => setGoalFilter(goal)}
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

                    {/* Template Cards Grid */}
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
                            onClick={() => {
                              setSelectedTemplate(template);
                              setCurrentStep('setup');
                              // Pre-fill form data from template
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
                            }}
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

                            {/* Trigger chips */}
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

                            {/* Meta info */}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{template.setupTime}</span>
                              <span>Collects: {template.collects.slice(0, 2).join(', ')}</span>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                ) : (
                  /* Custom mode - show traditional form */
                  <div className="text-center py-8 text-muted-foreground">
                    Custom automation builder coming soon. For now, please use Templates.
                  </div>
                )}
              </>
            )}

            {/* Step 2: Setup */}
            {currentStep === 'setup' && selectedTemplate && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Setup Form */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Configure Your Automation</h3>

                    {/* Name */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-1.5">Automation Name</label>
                      <Input
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Book Appointments"
                      />
                    </div>

                    {/* Description */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium mb-1.5">Description</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="What does this automation do?"
                        rows={2}
                        className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                      />
                    </div>

                    {/* Dynamic setup fields based on template */}
                    {selectedTemplate.setupFields.serviceList && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1.5">Services</label>
                        <Input
                          value={setupData.serviceList}
                          onChange={(e) => setSetupData({ ...setupData, serviceList: e.target.value })}
                          placeholder="e.g., Facial, Botox, Makeup"
                        />
                      </div>
                    )}

                    {selectedTemplate.setupFields.priceRanges && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1.5">Price Ranges</label>
                        <textarea
                          value={setupData.priceRanges}
                          onChange={(e) => setSetupData({ ...setupData, priceRanges: e.target.value })}
                          placeholder="e.g., Facial: $80-$120\nMakeup: $120-$200"
                          rows={3}
                          className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                        />
                      </div>
                    )}

                    {selectedTemplate.setupFields.locationLink && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1.5">Location Link</label>
                        <Input
                          value={setupData.locationLink}
                          onChange={(e) => setSetupData({ ...setupData, locationLink: e.target.value })}
                          placeholder="https://maps.google.com/?q=your-business"
                        />
                      </div>
                    )}

                    {selectedTemplate.setupFields.locationHours && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1.5">Location Hours</label>
                        <Input
                          value={setupData.locationHours}
                          onChange={(e) => setSetupData({ ...setupData, locationHours: e.target.value })}
                          placeholder="Mon-Fri 9AM-6PM, Sat 10AM-4PM"
                        />
                      </div>
                    )}

                    {selectedTemplate.setupFields.phoneMinLength && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1.5">Min Phone Digits</label>
                        <Input
                          type="number"
                          value={setupData.phoneMinLength}
                          onChange={(e) => setSetupData({ ...setupData, phoneMinLength: e.target.value })}
                          placeholder="8"
                        />
                      </div>
                    )}

                    {selectedTemplate.setupFields.businessHoursTime && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Open Time</label>
                          <Input
                            type="time"
                            value={setupData.businessHoursStart}
                            onChange={(e) => setSetupData({ ...setupData, businessHoursStart: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1.5">Close Time</label>
                          <Input
                            type="time"
                            value={setupData.businessHoursEnd}
                            onChange={(e) => setSetupData({ ...setupData, businessHoursEnd: e.target.value })}
                          />
                        </div>
                      </div>
                    )}

                    {selectedTemplate.setupFields.businessTimezone && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1.5">Timezone</label>
                        <Input
                          value={setupData.businessTimezone}
                          onChange={(e) => setSetupData({ ...setupData, businessTimezone: e.target.value })}
                          placeholder="America/New_York"
                        />
                      </div>
                    )}

                    {selectedTemplate.setupFields.afterHoursMessage && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1.5">Closed Message</label>
                        <textarea
                          value={setupData.afterHoursMessage}
                          onChange={(e) => setSetupData({ ...setupData, afterHoursMessage: e.target.value })}
                          placeholder="We're closed - leave details, we'll contact you at {next_open_time}."
                          rows={3}
                          className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                        />
                      </div>
                    )}

                    {selectedTemplate.setupFields.followupMessage && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-1.5">Next-Open Follow-up</label>
                        <textarea
                          value={setupData.followupMessage}
                          onChange={(e) => setSetupData({ ...setupData, followupMessage: e.target.value })}
                          placeholder="We're open now if you'd like to continue. Reply anytime."
                          rows={2}
                          className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Conversation Preview */}
                <div className="bg-muted/30 border border-border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h4 className="font-semibold text-sm">Conversation Preview</h4>
                  </div>
                  <div className="space-y-3">
                    {selectedTemplate.previewConversation.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.from === 'customer' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                            msg.from === 'customer'
                              ? 'bg-background border border-border'
                              : 'bg-primary text-primary-foreground'
                          }`}
                        >
                          {msg.message}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-4">
                    This is how your AI will interact with customers
                  </p>
                </div>
              </div>
            )}

            {/* Step 3: Review & Activate */}
            {currentStep === 'review' && selectedTemplate && (
              <div className="space-y-6">
                <div className="bg-muted/30 border border-border rounded-lg p-4">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-primary" />
                    Ready to Activate
                  </h3>

                  <div className="space-y-4">
                    {/* Summary */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground uppercase">Automation</label>
                      <p className="font-semibold">{formData.name}</p>
                      <p className="text-sm text-muted-foreground">{formData.description}</p>
                    </div>

                    {/* Triggers enabled */}
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

                    {/* Reply behavior */}
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

                    {/* Safety toggles */}
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

            {/* Navigation Buttons */}
            <div className="flex justify-between items-center pt-4 border-t border-border">
              <div>
                {currentStep !== 'gallery' && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (currentStep === 'setup') {
                        setCurrentStep('gallery');
                        setSelectedTemplate(null);
                      } else if (currentStep === 'review') {
                        setCurrentStep('setup');
                      }
                    }}
                    leftIcon={<ArrowLeft className="w-4 h-4" />}
                  >
                    Back
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </Button>
                {currentStep === 'gallery' && creationMode === 'templates' && (
                  <Button disabled className="opacity-50">
                    Select a template to continue
                  </Button>
                )}
                {currentStep === 'setup' && (
                  <Button
                    onClick={() => setCurrentStep('review')}
                    rightIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Continue to Review
                  </Button>
                )}
                {currentStep === 'review' && (
                  <Button onClick={handleSubmit} isLoading={saving} leftIcon={<CheckCircle className="w-4 h-4" />}>
                    Activate Automation
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Automations;
