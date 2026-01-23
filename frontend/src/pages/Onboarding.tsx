import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ChevronRight, CircleDot, Instagram, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAccountContext } from '../context/AccountContext';
import { useDemoMode } from '../hooks/useDemoMode';
import { useTheme } from '../context/ThemeContext';
import {
  automationAPI,
  AutomationInstance,
  AutomationSimulationSessionResponse,
  AutomationPreviewMessage,
  flowTemplateAPI,
  FlowTemplate,
  instagramAPI,
  settingsAPI,
  WorkspaceSettings,
} from '../services/api';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { AutomationPreviewPhone, PreviewMessage } from './automations/AutomationPreviewPhone';

type SetupStep = {
  id: 'connect' | 'template' | 'basics' | 'simulate' | 'publish';
  title: string;
  why: string;
};

type OnboardingQueryData = {
  automations: AutomationInstance[];
  templates: FlowTemplate[];
  settings: WorkspaceSettings;
  simulation: AutomationSimulationSessionResponse;
};

type LayoutOnboardingQueryData = {
  settings: WorkspaceSettings;
  automations: AutomationInstance[];
  simulation: AutomationSimulationSessionResponse;
};

const SETUP_STEPS: SetupStep[] = [
  {
    id: 'connect',
    title: 'Connect Instagram (or enable Demo Mode)',
    why: 'Unlock real DM routing and verify your account setup.',
  },
  {
    id: 'template',
    title: 'Choose a template',
    why: 'Start with a proven flow so you can go live fast.',
  },
  {
    id: 'basics',
    title: 'Set business basics',
    why: 'Give the assistant the essentials to sound like your brand.',
  },
  {
    id: 'simulate',
    title: 'Test in simulator',
    why: 'Watch the automation respond before going live.',
  },
  {
    id: 'publish',
    title: 'Publish',
    why: 'Activate your automation with safe defaults.',
  },
];

const OnboardingSkeleton: React.FC = () => (
  <div className="flex h-full flex-col gap-6 overflow-hidden">
    <div className="onboarding-shell flex-1 min-h-0">
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <Skeleton className="h-[520px] w-full max-w-5xl" />
      </div>
    </div>
  </div>
);

const Onboarding: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentWorkspace } = useAuth();
  const { accounts } = useAccountContext();
  const { uiTheme } = useTheme();
  const workspaceId = currentWorkspace?._id;

  const onboardingQuery = useQuery<OnboardingQueryData>({
    queryKey: ['onboarding', workspaceId],
    queryFn: async () => {
      if (!workspaceId) {
        throw new Error('Missing workspace');
      }
      const [automationData, templateData, workspaceSettings, simulationSession] = await Promise.all([
        automationAPI.getByWorkspace(workspaceId),
        flowTemplateAPI.list(),
        settingsAPI.getByWorkspace(workspaceId),
        automationAPI.getSimulationSession(workspaceId),
      ]);
      return {
        automations: automationData,
        templates: templateData,
        settings: workspaceSettings,
        simulation: simulationSession,
      };
    },
    enabled: Boolean(workspaceId),
    placeholderData: keepPreviousData,
  });

  const settings = onboardingQuery.data?.settings ?? null;
  const automations = onboardingQuery.data?.automations ?? [];
  const templates = onboardingQuery.data?.templates ?? [];
  const simulation = onboardingQuery.data?.simulation ?? null;
  const isInitialLoading = !workspaceId || (onboardingQuery.isLoading && !onboardingQuery.data);
  const { isDemoMode, enableDemoMode, disableDemoMode } = useDemoMode(settings?.demoModeEnabled);
  const [savingBasics, setSavingBasics] = useState(false);
  const [demoModeUpdating, setDemoModeUpdating] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<SetupStep['id'] | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<AutomationPreviewMessage[]>([]);
  const [previewInputValue, setPreviewInputValue] = useState('');
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null);
  const [previewSending, setPreviewSending] = useState(false);
  const [basicsForm, setBasicsForm] = useState({
    businessName: '',
    businessHours: '',
    businessTone: '',
    businessLocation: '',
  });

  useEffect(() => {
    if (!settings) return;
    setBasicsForm({
      businessName: settings.businessName || '',
      businessHours: settings.businessHours || '',
      businessTone: settings.businessTone || '',
      businessLocation: settings.businessLocation || '',
    });
  }, [settings]);

  useEffect(() => {
    if (!simulation) return;
    if (simulation.messages) {
      setPreviewMessages(simulation.messages);
    }
    if (simulation.sessionId) {
      setPreviewSessionId(simulation.sessionId);
    }
  }, [simulation]);

  useEffect(() => {
    if (onboardingQuery.error) {
      console.error('Failed to load onboarding data', onboardingQuery.error);
    }
  }, [onboardingQuery.error]);

  const updateSettingsCache = (updated: WorkspaceSettings) => {
    if (!workspaceId || !updated) return;
    queryClient.setQueryData<OnboardingQueryData>(['onboarding', workspaceId], (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        settings: updated,
      };
    });
    queryClient.setQueryData<LayoutOnboardingQueryData>(
      ['layout-onboarding', workspaceId],
      (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          settings: updated,
        };
      },
    );
  };

  const hasInstagram = accounts.length > 0;
  const connectStepComplete = hasInstagram || Boolean(
    settings?.onboarding?.connectCompletedAt
      || settings?.onboarding?.templateSelectedAt
      || settings?.onboarding?.basicsCompletedAt
      || settings?.onboarding?.simulatorCompletedAt
      || settings?.onboarding?.publishCompletedAt,
  );
  const hasTemplateChoice = automations.length > 0;
  const hasBusinessBasics = Boolean(settings?.businessName && settings?.businessHours);
  const activeAutomationCount = automations.filter(
    (automation) => automation.isActive && automation.template?.status !== 'archived',
  ).length;
  const publishedCount = activeAutomationCount;
  const hasPublishedAutomation = Boolean(settings?.onboarding?.publishCompletedAt)
    || (!isDemoMode && publishedCount > 0);
  const hasSimulation = Boolean(
    simulation?.sessionId
      || simulation?.session?.status
      || settings?.onboarding?.simulatorCompletedAt,
  );
  const onboardingComplete = Boolean(
    settings?.onboarding?.connectCompletedAt
      && settings?.onboarding?.templateSelectedAt
      && settings?.onboarding?.basicsCompletedAt
      && settings?.onboarding?.simulatorCompletedAt
      && settings?.onboarding?.publishCompletedAt,
  );

  const currentStepId = useMemo(() => {
    if (!connectStepComplete) return 'connect';
    if (!hasTemplateChoice) return 'template';
    if (!hasBusinessBasics) return 'basics';
    if (!hasSimulation) return 'simulate';
    if (!hasPublishedAutomation) return 'publish';
    return 'simulate';
  }, [connectStepComplete, hasTemplateChoice, hasBusinessBasics, hasPublishedAutomation, hasSimulation]);

  const completedSteps = useMemo(() => {
    return [
      connectStepComplete,
      hasTemplateChoice,
      hasBusinessBasics,
      hasSimulation,
      hasPublishedAutomation,
    ].filter(Boolean).length;
  }, [connectStepComplete, hasTemplateChoice, hasBusinessBasics, hasPublishedAutomation, hasSimulation]);

  const recommendedTemplates = useMemo(() => {
    return templates
      .filter((template) => template.currentVersion && template.status === 'active')
      .slice(0, 4);
  }, [templates]);


  const handleConnectDecision = async () => {
    if (!currentWorkspace) return;
    if (!isDemoMode) {
      enableDemoMode();
    }
    setDemoModeUpdating(true);
    try {
      const updated = await settingsAPI.update(currentWorkspace._id, {
        demoModeEnabled: true,
        onboarding: { connectCompletedAt: new Date().toISOString() },
      });
      updateSettingsCache(updated);
    } catch (error) {
      console.error('Failed to confirm demo mode onboarding', error);
    } finally {
      setDemoModeUpdating(false);
    }
  };

  const handleGoLive = async () => {
    if (!currentWorkspace || !isDemoMode || !hasInstagram) return;
    const previousValue = isDemoMode;
    disableDemoMode();
    setDemoModeUpdating(true);
    try {
      const updated = await settingsAPI.update(currentWorkspace._id, {
        demoModeEnabled: false,
        onboarding: { publishCompletedAt: new Date().toISOString() },
      });
      updateSettingsCache(updated);
    } catch (error) {
      console.error('Failed to switch to live mode', error);
      previousValue ? enableDemoMode() : disableDemoMode();
    } finally {
      setDemoModeUpdating(false);
    }
  };

  const handleConnectInstagram = async () => {
    if (!currentWorkspace) return;
    try {
      setDemoModeUpdating(true);
      const { authUrl } = await instagramAPI.getAuthUrl(currentWorkspace._id);
      window.location.href = authUrl;
    } catch (error) {
      console.error('Failed to connect Instagram', error);
      setDemoModeUpdating(false);
    }
  };

  const handleSaveBasics = async () => {
    if (!currentWorkspace) return;
    setSavingBasics(true);
    try {
      const updated = await settingsAPI.update(currentWorkspace._id, basicsForm);
      updateSettingsCache(updated);
    } catch (error) {
      console.error('Failed to update business basics', error);
    } finally {
      setSavingBasics(false);
    }
  };

  const handleTemplateSelect = async (templateId: string) => {
    if (!currentWorkspace) return;
    const selectedTemplate = recommendedTemplates.find((template) => template._id === templateId);
    if (!selectedTemplate) return;
    const templateVersionId = selectedTemplate.currentVersion?._id || selectedTemplate.currentVersionId;
    if (!templateVersionId) {
      console.error('Template version missing for selected template', selectedTemplate);
      return;
    }
    setCreatingTemplate(true);
    try {
      await automationAPI.create({
        name: selectedTemplate.name,
        description: selectedTemplate.description || 'Automation template',
        workspaceId: currentWorkspace._id,
        templateId: selectedTemplate._id,
        templateVersionId,
        isActive: true,
      });
      queryClient.invalidateQueries({ queryKey: ['onboarding', currentWorkspace._id] });
      queryClient.invalidateQueries({ queryKey: ['layout-onboarding', currentWorkspace._id] });
    } catch (error) {
      console.error('Failed to create automation from template', error);
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handlePreviewSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId) return;
    const trimmed = previewInputValue.trim();
    if (!trimmed) return;
    const optimisticMessage: AutomationPreviewMessage = {
      id: `local-${Date.now()}`,
      from: 'customer',
      text: trimmed,
    };
    setPreviewMessages((prev) => [...prev, optimisticMessage]);
    setPreviewInputValue('');
    setPreviewSending(true);
    try {
      const response = await automationAPI.simulateMessage({
        workspaceId,
        text: trimmed,
        sessionId: previewSessionId || undefined,
      });
      if (response.sessionId) {
        setPreviewSessionId(response.sessionId);
      }
      if (response.messages) {
        setPreviewMessages(response.messages);
      }
    } catch (error) {
      console.error('Failed to send simulation message', error);
    } finally {
      setPreviewSending(false);
    }
  };

  const handlePreviewReset = async () => {
    if (!workspaceId) return;
    setPreviewSending(true);
    try {
      await automationAPI.resetSimulationSession({
        workspaceId,
        sessionId: previewSessionId || undefined,
      });
      setPreviewMessages([]);
      setPreviewSessionId(null);
    } catch (error) {
      console.error('Failed to reset simulation session', error);
    } finally {
      setPreviewSending(false);
    }
  };

  const onboardingLogo = useMemo(() => {
    if (uiTheme === 'studio') {
      return {
        light: '/sendfx-studio.png',
        dark: '/sendfx-studio-dark.png',
      };
    }
    return {
      light: '/sendfx.png',
      dark: '/sendfx-dark.png',
    };
  }, [uiTheme]);

  const stepCompletion = useMemo(() => ({
    connect: connectStepComplete,
    template: hasTemplateChoice,
    basics: hasBusinessBasics,
    simulate: hasSimulation,
    publish: hasPublishedAutomation,
  }), [connectStepComplete, hasTemplateChoice, hasBusinessBasics, hasSimulation, hasPublishedAutomation]);
  const displayStepId = selectedStepId ?? currentStepId;
  const stepSubtitleMap: Record<SetupStep['id'], string> = {
    connect: 'Required for live routing. Prefer to explore first? Use demo mode.',
    template: 'Start with a proven flow so you can go live fast.',
    basics: 'Add a few essentials so replies sound like your brand.',
    simulate: 'Test the automation before going live.',
    publish: 'Activate your automation when you are ready.',
  };
  const stepTitleMap: Record<SetupStep['id'], string> = {
    connect: 'Connect Instagram',
    template: 'Choose a template',
    basics: 'Set business basics',
    simulate: 'Test in simulator',
    publish: 'Publish',
  };
  const stepNavSubtitleMap: Record<SetupStep['id'], string> = {
    connect: 'Required to route live DMs.',
    template: 'Pick a proven flow.',
    basics: 'Add brand essentials.',
    simulate: 'Test before going live.',
    publish: 'Activate safely.',
  };

  useEffect(() => {
    if (!selectedStepId) return;
    const isAvailable = selectedStepId === currentStepId || stepCompletion[selectedStepId];
    if (!isAvailable) {
      setSelectedStepId(null);
    }
  }, [selectedStepId, currentStepId, stepCompletion]);

  useEffect(() => {
    if (displayStepId !== 'template' && selectedTemplateId) {
      setSelectedTemplateId(null);
    }
  }, [displayStepId, selectedTemplateId]);

  const renderCurrentStepContent = () => {
    const basicsIncomplete = !basicsForm.businessName || !basicsForm.businessHours;
    const primaryAction: { label: string; onClick: () => void; disabled?: boolean } = displayStepId === 'connect'
      ? {
        label: 'Connect Instagram',
        onClick: handleConnectInstagram,
      }
      : displayStepId === 'template'
        ? {
          label: selectedTemplateId ? 'Use selected template' : 'Select a template',
          onClick: () => selectedTemplateId && handleTemplateSelect(selectedTemplateId),
          disabled: !selectedTemplateId,
        }
        : displayStepId === 'basics'
          ? {
            label: 'Save basics',
            onClick: handleSaveBasics,
            disabled: basicsIncomplete,
          }
          : displayStepId === 'simulate'
            ? {
              label: 'Run simulator',
              onClick: handlePreviewReset,
            }
            : {
              label: isDemoMode
                ? (hasInstagram ? 'Go live' : 'Connect Instagram to go live')
                : 'Publish now',
              onClick: isDemoMode
                ? (hasInstagram ? handleGoLive : handleConnectInstagram)
                : () => navigate('/automations'),
            };

    const stepOrder = SETUP_STEPS.map((step) => step.id);
    const displayIndex = stepOrder.indexOf(displayStepId);
    const nextSteps = stepOrder
      .slice(displayIndex + 1)
      .map((stepId) => stepTitleMap[stepId])
      .slice(0, 2);
    const backStepId = displayIndex > 0 ? stepOrder[displayIndex - 1] : null;
    const canGoBack = Boolean(backStepId && (backStepId === currentStepId || stepCompletion[backStepId]));
    const isSkippable = displayStepId === 'simulate';
    const previewAccount = accounts[0];
    const previewHandle = previewAccount?.username ? `@${previewAccount.username}` : '@sendfx';
    const previewDisplayName = previewAccount?.username || 'SendFx';
    const previewInitial = (previewDisplayName[0] || 'S').toUpperCase();
    const previewAvatarUrl = (previewAccount as { profilePictureUrl?: string; avatarUrl?: string } | undefined)?.profilePictureUrl
      || (previewAccount as { profilePictureUrl?: string; avatarUrl?: string } | undefined)?.avatarUrl;
    const phoneMessages: PreviewMessage[] = previewMessages.map((message) => ({
      id: message.id,
      from: message.from,
      text: message.text,
    }));

    return (
      <div className="onboarding-workspace">
        <div className="onboarding-card-actions">
          <button
            type="button"
            className="onboarding-link"
            onClick={() => {
              if (backStepId && canGoBack) setSelectedStepId(backStepId);
            }}
            disabled={!canGoBack}
          >
            Back
          </button>
          {isSkippable ? (
            <button
              type="button"
              className="onboarding-link"
              onClick={() => navigate('/automations')}
            >
              Skip for now
            </button>
          ) : (
            <span className="onboarding-skip-disabled">Skip for now (required)</span>
          )}
        </div>
        <div>
          <h2 className="onboarding-step-heading">{stepTitleMap[displayStepId]}</h2>
          <p className="onboarding-step-subtitle">{stepSubtitleMap[displayStepId]}</p>
        </div>
        {displayStepId === 'template' && (
          <div className="onboarding-template-picker">
            {recommendedTemplates.length > 0 ? (
              <div className="onboarding-template-grid">
                {recommendedTemplates.map((template) => (
                  <button
                    key={template._id}
                    type="button"
                    className={`onboarding-template-card ${selectedTemplateId === template._id ? 'is-selected' : ''}`}
                    onClick={() => setSelectedTemplateId(template._id)}
                  >
                    <span className="onboarding-template-title">{template.name}</span>
                    <span className="onboarding-template-subtitle">
                      {template.currentVersion?.display?.outcome || template.description || 'Automation template'}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No templates available yet.</p>
            )}
          </div>
        )}
        {displayStepId === 'basics' && (
          <div className="onboarding-basics-form">
            <div className="onboarding-basics-grid">
              <Input
                value={basicsForm.businessName}
                onChange={(event) => setBasicsForm((prev) => ({ ...prev, businessName: event.target.value }))}
                placeholder="Business name"
              />
              <Input
                value={basicsForm.businessHours}
                onChange={(event) => setBasicsForm((prev) => ({ ...prev, businessHours: event.target.value }))}
                placeholder="Working hours"
              />
              <Input
                value={basicsForm.businessTone}
                onChange={(event) => setBasicsForm((prev) => ({ ...prev, businessTone: event.target.value }))}
                placeholder="Tone (optional)"
              />
              <Input
                value={basicsForm.businessLocation}
                onChange={(event) => setBasicsForm((prev) => ({ ...prev, businessLocation: event.target.value }))}
                placeholder="Location (optional)"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              These basics show up in your assistant prompt.
            </p>
          </div>
        )}
        {displayStepId === 'simulate' && (
          <div className="onboarding-sim-preview">
            <AutomationPreviewPhone
              accountDisplayName={previewDisplayName}
              accountHandle={previewHandle}
              accountAvatarUrl={previewAvatarUrl}
              accountInitial={previewInitial}
              messages={phoneMessages}
              mode="interactive"
              inputValue={previewInputValue}
              onInputChange={setPreviewInputValue}
              onSubmit={handlePreviewSubmit}
              inputDisabled={previewSending}
              sendDisabled={previewSending || previewInputValue.trim().length === 0}
            />
          </div>
        )}
        <div className="onboarding-cta-group">
          <Button
            onClick={primaryAction.onClick}
            leftIcon={displayStepId === 'connect' ? <Instagram className="w-4 h-4" /> : undefined}
            isLoading={
              displayStepId === 'publish'
                ? demoModeUpdating
                : displayStepId === 'template'
                  ? creatingTemplate
                  : displayStepId === 'basics'
                    ? savingBasics
                    : false
            }
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </Button>
          {displayStepId === 'connect' && (
            <button
              type="button"
              className="onboarding-link"
              onClick={handleConnectDecision}
            >
              Try demo mode
            </button>
          )}
        </div>
        <p className="onboarding-trust-line">Nothing messages real customers until you publish.</p>
        <div className="onboarding-next-steps">
          <p className="onboarding-next-title">What happens next</p>
          {nextSteps.length > 0 ? (
            <ul className="onboarding-next-list">
              {nextSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          ) : (
            <p className="onboarding-next-empty">You are ready to publish when you are set.</p>
          )}
        </div>
      </div>
    );
  };

  if (isInitialLoading) {
    return <OnboardingSkeleton />;
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      <div className="onboarding-shell flex-1 min-h-0">
        <aside className="auth-brand-panel onboarding-steps-panel">
          <div className="onboarding-steps-content">
            <img src={onboardingLogo.light} alt="SendFx" className="auth-brand-logo onboarding-logo block dark:hidden" />
            <img src={onboardingLogo.dark} alt="SendFx" className="auth-brand-logo onboarding-logo hidden dark:block" />
            <h1 className="onboarding-steps-title">Get live in ~3 minutes</h1>
            <p className="onboarding-steps-subtitle">
              Complete the steps below. Demo mode keeps you safe.
            </p>
            <p className="onboarding-steps-summary">
              {completedSteps}/{SETUP_STEPS.length} completed • ~3 min
            </p>
            <div className="onboarding-stepper">
              {SETUP_STEPS.map((step, index) => {
                const isComplete = stepCompletion[step.id];
                const isCurrent = step.id === currentStepId;
                const isActive = step.id === displayStepId;
                const isLocked = !isComplete && !isCurrent;
                const isLast = index === SETUP_STEPS.length - 1;
                return (
                  <button
                    key={step.id}
                    type="button"
                    className={`onboarding-stepper-item  ${isLocked ? 'is-locked' : ''} ${isLast ? 'is-last' : ''}`}
                    onClick={() => {
                      if (!isLocked) setSelectedStepId(step.id);
                    }}
                    disabled={isLocked}
                    aria-current={isActive ? 'step' : undefined}
                  >
                    <div className="onboarding-stepper-main">
                      <span className={`onboarding-stepper-icon ${isLocked ? 'is-locked' : isComplete ? 'is-done' : 'is-active'}`}>
                        {isLocked ? <Lock className="w-4 h-4" /> : isComplete ? <BadgeCheck className="w-4 h-4" /> : <CircleDot className="w-4 h-4" />}
                      </span>
                      <div>
                        <p className="onboarding-stepper-title">{stepTitleMap[step.id]}</p>
                        <p className="onboarding-stepper-subtitle">{stepNavSubtitleMap[step.id]}</p>
                      </div>
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="onboarding-main-panel">
          <div className="onboarding-main-card">
            {renderCurrentStepContent()}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Onboarding;
