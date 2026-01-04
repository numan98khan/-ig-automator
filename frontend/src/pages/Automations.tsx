import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAccountContext } from '../context/AccountContext';
import {
  automationAPI,
  AutomationPreviewMessage,
  flowTemplateAPI,
  AutomationInstance,
  FlowExposedField,
  FlowTemplate,
} from '../services/api';
import { AlertTriangle, PlayCircle, Clock } from 'lucide-react';
import { AutomationsSidebar } from './automations/AutomationsSidebar';
import { AutomationsListView } from './automations/AutomationsListView';
import { AutomationsCreateView } from './automations/AutomationsCreateView';
import { AutomationPlaceholderSection } from './automations/AutomationPlaceholderSection';
import { AutomationsHumanAlerts } from './automations/AutomationsHumanAlerts';
import Knowledge from './Knowledge';
import { AutomationsIntegrationsView } from './automations/AutomationsIntegrationsView';
import { FLOW_GOAL_FILTERS } from './automations/constants';

type CreateFormData = {
  name: string;
  description: string;
};

const buildDefaultConfig = (fields: FlowExposedField[]) => {
  const defaults: Record<string, any> = {};
  fields.forEach((field) => {
    if (field.defaultValue !== undefined) {
      defaults[field.key] = field.defaultValue;
      return;
    }
    if (field.type === 'multi_select') {
      defaults[field.key] = [];
    }
    if (field.type === 'boolean') {
      defaults[field.key] = false;
    }
  });
  return defaults;
};

const normalizeConfig = (
  fields: FlowExposedField[],
  values: Record<string, any>,
): { config?: Record<string, any>; error?: string } => {
  const config: Record<string, any> = {};
  for (const field of fields) {
    const raw = values[field.key];
    const hasValue = raw !== undefined && raw !== null && raw !== '';

    if (!hasValue) {
      if (field.required) {
        return { error: `${field.label} is required` };
      }
      continue;
    }

    if (field.type === 'number') {
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) {
        return { error: `${field.label} must be a number` };
      }
      config[field.key] = parsed;
      continue;
    }

    if (field.type === 'json') {
      if (typeof raw === 'string') {
        try {
          config[field.key] = JSON.parse(raw);
        } catch {
          return { error: `${field.label} must be valid JSON` };
        }
      } else {
        config[field.key] = raw;
      }
      continue;
    }

    if (field.type === 'multi_select') {
      config[field.key] = Array.isArray(raw) ? raw : [];
      continue;
    }

    if (field.type === 'boolean') {
      config[field.key] = Boolean(raw);
      continue;
    }

    config[field.key] = raw;
  }

  return { config };
};

const Automations: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const { activeAccount } = useAccountContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<'automations' | 'knowledge' | 'alerts' | 'routing' | 'followups' | 'integrations'>('automations');
  const [automationView, setAutomationView] = useState<'list' | 'create' | 'edit'>('list');
  const [automations, setAutomations] = useState<AutomationInstance[]>([]);
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingAutomation, setEditingAutomation] = useState<AutomationInstance | null>(null);
  const [formData, setFormData] = useState<CreateFormData>({
    name: '',
    description: '',
  });
  const [configValues, setConfigValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewMessages, setPreviewMessages] = useState<AutomationPreviewMessage[]>([]);
  const [previewInputValue, setPreviewInputValue] = useState('');
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [previewSessionStatus, setPreviewSessionStatus] = useState<
    'active' | 'paused' | 'completed' | 'handoff' | null
  >(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSending, setPreviewSending] = useState(false);

  const accountDisplayName = activeAccount?.name || activeAccount?.username || 'Connected account';
  const accountHandle = activeAccount?.username || 'connected_account';
  const accountAvatarUrl = activeAccount?.profilePictureUrl;
  const accountInitial = accountDisplayName.charAt(0).toUpperCase();
  const isAutomationsSection = activeSection === 'automations';
  const isCreateView = isAutomationsSection && (automationView === 'create' || automationView === 'edit');

  const [creationMode, setCreationMode] = useState<'templates' | 'custom'>('templates');
  const [currentStep, setCurrentStep] = useState<'gallery' | 'setup' | 'review'>('gallery');
  const [selectedTemplate, setSelectedTemplate] = useState<FlowTemplate | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [goalFilter, setGoalFilter] = useState<'all' | (typeof FLOW_GOAL_FILTERS)[number]>('all');
  const [industryFilter, setIndustryFilter] = useState<'all' | 'Clinics' | 'Salons' | 'Retail' | 'Restaurants' | 'Real Estate' | 'General'>('all');

  const createViewTitle = editingAutomation
    ? 'Edit Automation'
    : currentStep === 'gallery'
    ? 'Create Automation'
    : currentStep === 'setup'
    ? `Setup: ${selectedTemplate?.name || 'Template'}`
    : 'Review & Activate';
  const isCreateSetupView = isCreateView && currentStep === 'setup';

  const exposedFields = useMemo(
    () => selectedTemplate?.currentVersion?.exposedFields || [],
    [selectedTemplate],
  );
  const summaryStats = useMemo(() => {
    const totalTriggered = automations.reduce((sum, automation) => sum + (automation.stats?.totalTriggered || 0), 0);
    const totalRepliesSent = automations.reduce((sum, automation) => sum + (automation.stats?.totalRepliesSent || 0), 0);
    const activeCount = automations.filter((automation) => automation.isActive).length;
    return {
      activeCount,
      totalCount: automations.length,
      totalTriggered,
      totalRepliesSent,
    };
  }, [automations]);

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
      const [automationsData, templatesData] = await Promise.all([
        automationAPI.getByWorkspace(currentWorkspace._id),
        flowTemplateAPI.list(),
      ]);
      setAutomations(automationsData);
      setTemplates(templatesData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load automations');
    } finally {
      setLoading(false);
    }
  };

  const resetPreviewState = () => {
    setPreviewSessionId(null);
    setPreviewMessages([]);
    setPreviewInputValue('');
    setPreviewStatus(null);
    setPreviewSessionStatus(null);
  };

  const loadPreviewSession = async (automation: AutomationInstance, options?: { reset?: boolean }) => {
    try {
      setPreviewLoading(true);
      setPreviewStatus(null);
      const session = await automationAPI.createPreviewSession(automation._id, options);
      setPreviewSessionId(session.sessionId);
      setPreviewMessages(session.messages || []);
      setPreviewSessionStatus(session.status || null);
    } catch (err) {
      console.error('Error loading preview session:', err);
      setPreviewStatus('Unable to start preview. Please try again.');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!editingAutomation) {
      resetPreviewState();
      return;
    }
    void loadPreviewSession(editingAutomation);
  }, [editingAutomation]);

  const handleOpenCreateModal = () => {
    setEditingAutomation(null);
    setFormData({ name: '', description: '' });
    setConfigValues({});
    setCreationMode('templates');
    setCurrentStep('gallery');
    setSelectedTemplate(null);
    setTemplateSearch('');
    setGoalFilter('all');
    setIndustryFilter('all');
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

  const resolveTemplateForInstance = (automation: AutomationInstance) => {
    const template = automation.template || templates.find((item) => item._id === automation.templateId) || null;
    if (!template) return null;
    const version = automation.templateVersion || template.currentVersion || null;
    return {
      ...template,
      currentVersion: version,
    } as FlowTemplate;
  };

  const handleOpenEditAutomation = (automation: AutomationInstance) => {
    setEditingAutomation(automation);
    setFormData({
      name: automation.name,
      description: automation.description || '',
    });

    const template = resolveTemplateForInstance(automation);
    setSelectedTemplate(template);
    setCreationMode('templates');
    setCurrentStep('setup');
    setTemplateSearch('');
    setGoalFilter('all');
    setIndustryFilter('all');

    const defaults = buildDefaultConfig(template?.currentVersion?.exposedFields || []);
    setConfigValues({ ...defaults, ...(automation.userConfig || {}) });
    setAutomationView('edit');
  };

  const handleCloseCreateView = () => {
    setAutomationView('list');
    setEditingAutomation(null);
    setCreationMode('templates');
    setCurrentStep('gallery');
    setSelectedTemplate(null);
    setTemplateSearch('');
    setGoalFilter('all');
    setIndustryFilter('all');
    setConfigValues({});
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!currentWorkspace || !selectedTemplate?.currentVersion) return;

    setError(null);
    const { config, error: configError } = normalizeConfig(exposedFields, configValues);
    if (configError) {
      setError(configError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        userConfig: config || {},
        templateVersionId: selectedTemplate.currentVersion._id,
      };

      if (editingAutomation) {
        await automationAPI.update(editingAutomation._id, payload);
      } else {
        await automationAPI.create({
          ...payload,
          workspaceId: currentWorkspace._id,
          isActive: true,
          templateId: selectedTemplate._id,
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

  const handleToggle = async (automation: AutomationInstance) => {
    try {
      await automationAPI.toggle(automation._id);
      loadData();
    } catch (err) {
      console.error('Error toggling automation:', err);
      setError('Failed to toggle automation');
    }
  };

  const handleDelete = async (automation: AutomationInstance) => {
    if (!confirm(`Are you sure you want to delete "${automation.name}"?`)) return;

    try {
      await automationAPI.delete(automation._id);
      loadData();
    } catch (err) {
      console.error('Error deleting automation:', err);
      setError('Failed to delete automation');
    }
  };

  const handleDuplicate = async (automation: AutomationInstance) => {
    if (!currentWorkspace) return;
    try {
      const template = resolveTemplateForInstance(automation);
      const templateVersionId = automation.templateVersionId || template?.currentVersion?._id;
      if (!templateVersionId || !template?._id) {
        setError('Unable to duplicate automation. Missing template version.');
        return;
      }

      await automationAPI.create({
        name: `${automation.name} Copy`,
        description: automation.description || '',
        workspaceId: currentWorkspace._id,
        isActive: false,
        templateId: template._id,
        templateVersionId,
        userConfig: automation.userConfig || {},
      });
      loadData();
    } catch (err) {
      console.error('Error duplicating automation:', err);
      setError('Failed to duplicate automation');
    }
  };

  const handleSelectTemplate = (template: FlowTemplate) => {
    if (!template.currentVersion) {
      setError('Template is not yet published.');
      return;
    }
    setSelectedTemplate(template);
    setCurrentStep('setup');
    const display = template.currentVersion?.display;
    setFormData({
      name: template.name,
      description: display?.outcome || template.description || '',
    });
    setConfigValues(buildDefaultConfig(template.currentVersion?.exposedFields || []));
  };

  const handleBackToGallery = () => {
    if (editingAutomation) {
      handleCloseCreateView();
      return;
    }
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

  const handlePreviewInputChange = (value: string) => {
    setPreviewInputValue(value);
    if (previewStatus) {
      setPreviewStatus(null);
    }
  };

  const handlePreviewSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingAutomation) return;
    if (previewSessionStatus === 'paused') {
      setPreviewStatus('Preview is paused. Resume or reset to continue.');
      return;
    }
    if (previewSessionStatus === 'completed') {
      setPreviewStatus('Preview is stopped. Reset to start a new run.');
      return;
    }
    const trimmed = previewInputValue.trim();
    if (!trimmed) return;

    const optimisticMessage: AutomationPreviewMessage = {
      id: `preview-user-${Date.now()}`,
      from: 'customer',
      text: trimmed,
    };
    setPreviewMessages((prev) => [...prev, optimisticMessage]);
    setPreviewInputValue('');
    setPreviewSending(true);
    setPreviewStatus(null);

    try {
      const response = await automationAPI.sendPreviewMessage(editingAutomation._id, {
        text: trimmed,
        sessionId: previewSessionId || undefined,
      });
      if (response.sessionId && response.sessionId !== previewSessionId) {
        setPreviewSessionId(response.sessionId);
      }
      if (response.messages && response.messages.length > 0) {
        setPreviewMessages((prev) => [...prev, ...response.messages]);
      }
      if (!response.success) {
        setPreviewStatus(response.error || 'No automated response was generated.');
      }
    } catch (err) {
      console.error('Error sending preview message:', err);
      setPreviewStatus('Failed to send preview message.');
    } finally {
      setPreviewSending(false);
    }
  };

  const handlePreviewPause = async () => {
    if (!editingAutomation || !previewSessionId) return;
    try {
      setPreviewLoading(true);
      const response = await automationAPI.pausePreviewSession(editingAutomation._id, {
        sessionId: previewSessionId,
        reason: 'Paused from preview console',
      });
      setPreviewSessionStatus(response.session.status);
      setPreviewStatus('Preview paused.');
    } catch (err) {
      console.error('Error pausing preview session:', err);
      setPreviewStatus('Failed to pause preview session.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewStop = async () => {
    if (!editingAutomation || !previewSessionId) return;
    try {
      setPreviewLoading(true);
      const response = await automationAPI.stopPreviewSession(editingAutomation._id, {
        sessionId: previewSessionId,
        reason: 'Stopped from preview console',
      });
      setPreviewSessionStatus(response.session.status);
      setPreviewStatus('Preview stopped.');
    } catch (err) {
      console.error('Error stopping preview session:', err);
      setPreviewStatus('Failed to stop preview session.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewReset = async () => {
    if (!editingAutomation) return;
    await loadPreviewSession(editingAutomation, { reset: true });
    setPreviewStatus('Preview reset.');
  };

  if (!currentWorkspace) return null;

  return (
    <div className={`h-full flex flex-col ${isCreateSetupView ? 'overflow-hidden' : ''}`}>
      <div className={`flex flex-col lg:flex-row gap-6 ${isCreateSetupView ? 'flex-1 min-h-0' : ''}`}>
        <AutomationsSidebar
          activeSection={activeSection}
          onChange={handleSectionChange}
        />

        <div
          className={`flex-1 min-h-0 ${
            isCreateSetupView ? 'flex flex-col gap-6 overflow-hidden' : 'space-y-6'
          }`}
        >
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 animate-fade-in">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 font-medium text-sm">{error}</span>
            </div>
          )}

          {activeSection === 'automations' && (
            <div className={`animate-fade-in ${isCreateView ? 'min-h-0 flex-1 flex flex-col gap-6' : 'space-y-6'}`}>
              {isCreateView ? (
                <AutomationsCreateView
                  createViewTitle={createViewTitle}
                  isCreateSetupView={isCreateSetupView}
                  editingAutomation={editingAutomation}
                  creationMode={creationMode}
                  currentStep={currentStep}
                  selectedTemplate={selectedTemplate}
                  templates={templates}
                  templateSearch={templateSearch}
                  goalFilter={goalFilter}
                  industryFilter={industryFilter}
                  formData={formData}
                  exposedFields={exposedFields}
                  configValues={configValues}
                  saving={saving}
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
                  onUpdateConfigValues={setConfigValues}
                  previewMessages={previewMessages}
                  previewInputValue={previewInputValue}
                  previewStatus={previewStatus}
                  previewSessionStatus={previewSessionStatus}
                  previewLoading={previewLoading}
                  previewSendDisabled={
                    previewSending ||
                    previewLoading ||
                    previewInputValue.trim().length === 0 ||
                    previewSessionStatus === 'paused' ||
                    previewSessionStatus === 'completed'
                  }
                  onPreviewInputChange={handlePreviewInputChange}
                  onPreviewSubmit={handlePreviewSubmit}
                  onPreviewPause={handlePreviewPause}
                  onPreviewStop={handlePreviewStop}
                  onPreviewReset={handlePreviewReset}
                />
              ) : (
                <AutomationsListView
                  automations={automations}
                  summaryStats={summaryStats}
                  loading={loading}
                  onCreate={handleOpenCreateModal}
                  onOpen={handleOpenEditAutomation}
                  onToggle={handleToggle}
                  onDuplicate={handleDuplicate}
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
