import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  ChevronRight,
  CircleDot,
  Clock,
  Clock3,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Instagram,
  LayoutDashboard,
  ShieldCheck,
  UserPlus,
  Wrench,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAccountContext } from '../context/AccountContext';
import { useDemoMode } from '../hooks/useDemoMode';
import { useTheme } from '../context/ThemeContext';
import {
  automationAPI,
  AutomationInstance,
  AutomationSimulationSessionResponse,
  dashboardAPI,
  DashboardAttentionResponse,
  DashboardSummaryResponse,
  flowTemplateAPI,
  FlowTemplate,
  instagramAPI,
  settingsAPI,
  WorkspaceSettings,
} from '../services/api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

type SetupStep = {
  id: 'connect' | 'template' | 'basics' | 'simulate' | 'publish';
  title: string;
  why: string;
};

type AttentionFilter = 'escalations' | 'unreplied' | 'followups';

type HomeQueryData = {
  automations: AutomationInstance[];
  templates: FlowTemplate[];
  settings: WorkspaceSettings;
  simulation: AutomationSimulationSessionResponse;
  dashboard: DashboardSummaryResponse;
};

const badgeVariantMap = {
  escalated: { label: 'Escalated', variant: 'danger' as const },
  sla: { label: 'SLA risk', variant: 'warning' as const },
  followup: { label: 'Follow-up due', variant: 'secondary' as const },
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

const HomeSkeleton: React.FC = () => (
  <div className="flex h-full flex-col gap-6 overflow-hidden">
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 flex-1 min-h-0 overflow-hidden">
      <div className="space-y-6 h-full overflow-y-auto pr-1">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <div className="space-y-6 h-full overflow-y-auto pr-1">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-60 w-full" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  </div>
);

const Home: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentWorkspace, user } = useAuth();
  const { accounts } = useAccountContext();
  const { uiTheme } = useTheme();
  const workspaceId = currentWorkspace?._id;
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('escalations');
  const homeQuery = useQuery<HomeQueryData>({
    queryKey: ['home', workspaceId],
    queryFn: async () => {
      if (!workspaceId) {
        throw new Error('Missing workspace');
      }
      const [
        automationData,
        templateData,
        workspaceSettings,
        simulationSession,
        summary,
      ] = await Promise.all([
        automationAPI.getByWorkspace(workspaceId),
        flowTemplateAPI.list(),
        settingsAPI.getByWorkspace(workspaceId),
        automationAPI.getSimulationSession(workspaceId),
        dashboardAPI.getSummary(workspaceId, 'today'),
      ]);
      return {
        automations: automationData,
        templates: templateData,
        settings: workspaceSettings,
        simulation: simulationSession,
        dashboard: summary,
      };
    },
    enabled: Boolean(workspaceId),
    placeholderData: keepPreviousData,
  });
  const attentionQuery = useQuery<DashboardAttentionResponse>({
    queryKey: ['home-attention', workspaceId, attentionFilter],
    queryFn: async () => {
      if (!workspaceId) {
        throw new Error('Missing workspace');
      }
      return dashboardAPI.getAttention(workspaceId, attentionFilter);
    },
    enabled: Boolean(workspaceId),
    placeholderData: keepPreviousData,
  });
  const settings = homeQuery.data?.settings ?? null;
  const automations = homeQuery.data?.automations ?? [];
  const templates = homeQuery.data?.templates ?? [];
  const dashboard = homeQuery.data?.dashboard ?? null;
  const simulation = homeQuery.data?.simulation ?? null;
  const attentionItems = attentionQuery.data?.items ?? [];
  const isInitialLoading = homeQuery.isLoading && !homeQuery.data;
  const isSyncing = homeQuery.isFetching && !homeQuery.isLoading;
  const isAttentionLoading = attentionQuery.isLoading && !attentionQuery.data;
  const { isDemoMode, enableDemoMode, disableDemoMode } = useDemoMode(settings?.demoModeEnabled);
  const [demoModeUpdating, setDemoModeUpdating] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<SetupStep['id'] | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (homeQuery.error) {
      console.error('Failed to load Home data', homeQuery.error);
    }
  }, [homeQuery.error]);

  useEffect(() => {
    if (attentionQuery.error) {
      console.error('Failed to load attention items', attentionQuery.error);
    }
  }, [attentionQuery.error]);

  const updateSettingsCache = (updated: typeof settings) => {
    if (!workspaceId || !updated) return;
    queryClient.setQueryData<HomeQueryData>(['home', workspaceId], (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        settings: updated,
      };
    });
  };

  const hasInstagram = accounts.length > 0;
  const connectStepComplete = hasInstagram || Boolean(
    settings?.onboarding?.connectCompletedAt
      || settings?.onboarding?.templateSelectedAt
      || settings?.onboarding?.basicsCompletedAt
      || settings?.onboarding?.simulatorCompletedAt
      || settings?.onboarding?.publishCompletedAt
  );
  const hasTemplateChoice = automations.length > 0;
  const hasBusinessBasics = Boolean(settings?.businessName && settings?.businessHours);
  const activeAutomationCount = automations.filter(
    (automation) => automation.isActive && automation.template?.status !== 'archived'
  ).length;
  const publishedCount = activeAutomationCount;
  const hasPublishedAutomation = Boolean(settings?.onboarding?.publishCompletedAt)
    || (!isDemoMode && publishedCount > 0);
  const hasSimulation = Boolean(
    simulation?.sessionId
      || simulation?.session?.status
      || settings?.onboarding?.simulatorCompletedAt
  );
  const onboardingComplete = Boolean(
    settings?.onboarding?.connectCompletedAt
      && settings?.onboarding?.templateSelectedAt
      && settings?.onboarding?.basicsCompletedAt
      && settings?.onboarding?.simulatorCompletedAt
      && settings?.onboarding?.publishCompletedAt
  );
  const isActivated = onboardingComplete
    || (connectStepComplete && hasTemplateChoice && hasBusinessBasics && hasSimulation && hasPublishedAutomation);
  const liveAutomation = useMemo(
    () => (isDemoMode
      ? null
      : automations.find((automation) => automation.isActive && automation.template?.status !== 'archived') || null),
    [automations, isDemoMode],
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

  const handleDemoModeUpdate = async (nextValue: boolean) => {
    if (!currentWorkspace || nextValue === isDemoMode) return;
    const previousValue = isDemoMode;
    nextValue ? enableDemoMode() : disableDemoMode();
    setDemoModeUpdating(true);
    try {
      const updated = await settingsAPI.update(currentWorkspace._id, { demoModeEnabled: nextValue });
      updateSettingsCache(updated);
    } catch (error) {
      console.error('Failed to update demo mode', error);
      previousValue ? enableDemoMode() : disableDemoMode();
    } finally {
      setDemoModeUpdating(false);
    }
  };

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

  const handleTemplateSelect = (templateId: string) => {
    navigate(`/automations?templateId=${templateId}&source=onboarding`);
  };

  const showSecurityPrompt = Boolean(user?.isProvisional || !user?.emailVerified);
  const kpiSummary = dashboard?.kpis;
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
  const displayStepIndex = Math.max(0, SETUP_STEPS.findIndex((step) => step.id === displayStepId)) + 1;
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
            label: 'Continue',
            onClick: () => navigate('/automations?section=business-profile'),
          }
          : displayStepId === 'simulate'
            ? {
              label: 'Run simulator',
              onClick: () => navigate('/automations?section=simulate'),
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
        <div className="onboarding-cta-group">
          <Button
            onClick={primaryAction.onClick}
            leftIcon={displayStepId === 'connect' ? <Instagram className="w-4 h-4" /> : undefined}
            isLoading={displayStepId === 'publish' ? demoModeUpdating : false}
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
    return <HomeSkeleton />;
  }

  if (!isActivated) {
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
              <div className="onboarding-main-header">
                <span className="onboarding-step-kicker">
                  Step {displayStepIndex} of {SETUP_STEPS.length} • {completedSteps}/{SETUP_STEPS.length} completed
                </span>
              </div>
              {renderCurrentStepContent()}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      {/* <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-semibold text-foreground">Home</h1>
        <p className="text-sm text-muted-foreground">
          {isActivated
            ? 'Keep an eye on automation health and jump into your next task.'
            : 'Complete setup to go live with confidence.'}
        </p>
      </div> */}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 flex-1 min-h-0 overflow-hidden">
        <div className="hidden lg:flex lg:flex-col space-y-6 h-full overflow-y-auto pr-1">
          {isActivated && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ops summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">DMs today</p>
                    <p className="text-xl font-semibold text-foreground">{kpiSummary?.inboundMessages ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">Automations running</p>
                    <p className="text-xl font-semibold text-foreground">{publishedCount}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">Errors</p>
                    <p className="text-xl font-semibold text-foreground">0</p>
                  </div>
                </div>

              </CardContent>
            </Card>
          )}

          {isActivated && (
            <Card>
              <CardHeader className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Needs attention now</p>
                  <CardTitle className="text-lg">Actionable queue</CardTitle>
                  <p className="text-sm text-muted-foreground">Sort by escalations, unreplied, or follow-ups due.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['escalations', 'unreplied', 'followups'] as AttentionFilter[]).map((filter) => (
                    <Button
                      key={filter}
                      variant={attentionFilter === filter ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setAttentionFilter(filter)}
                      leftIcon={filter === 'escalations' ? <AlertTriangle className="w-4 h-4" /> : undefined}
                      rightIcon={<ArrowUpRight className="w-4 h-4" />}
                    >
                      {filter === 'escalations' && 'Escalations'}
                      {filter === 'unreplied' && 'Unreplied'}
                      {filter === 'followups' && 'Follow-ups due'}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-border/60">
                {isAttentionLoading && (
                  <div className="space-y-4 py-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={`attention-skeleton-${index}`} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <Skeleton className="h-10 w-10 rounded-full" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Skeleton className="h-8 w-28" />
                          <Skeleton className="h-8 w-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!isAttentionLoading && attentionItems.map((item) => (
                  <div key={item.id} className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                        {(item.participantName || 'U')[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <span>{item.participantName || 'Unknown'}</span>
                          <span className="text-muted-foreground">{item.handle}</span>
                        </div>
                        <p className="text-sm text-foreground/90 line-clamp-2">{item.lastMessagePreview || 'No preview available'}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">Last message {formatTimeAgo(item.lastMessageAt)}</span>
                          {(item.badges || []).map((badge) => {
                            const isBadgeKey = (value: string): value is keyof typeof badgeVariantMap =>
                              value in badgeVariantMap;

                            if (!isBadgeKey(badge)) {
                              return null;
                            }

                            const config = badgeVariantMap[badge];
                            return (
                              <Badge key={badge} variant={config.variant}>
                                {config.label}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" leftIcon={<ExternalLink className="w-4 h-4" />}>
                        Open conversation
                      </Button>
                      <Button variant="ghost" size="sm" leftIcon={<UserPlus className="w-4 h-4" />}>
                        Assign
                      </Button>
                      <Button variant="ghost" size="sm" leftIcon={<CheckCircle2 className="w-4 h-4" />}>
                        Mark resolved
                      </Button>
                      <Button variant="ghost" size="sm" leftIcon={<Clock3 className="w-4 h-4" />}>
                        Snooze
                      </Button>
                    </div>
                  </div>
                ))}

                {!isAttentionLoading && attentionItems.length === 0 && (
                  <div className="py-6 text-center text-muted-foreground text-sm">All clear. No items need attention for this filter.</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="hidden lg:flex lg:flex-col space-y-6 h-full overflow-y-auto pr-1">
          <Card className="hidden sm:block">
            <CardHeader>
              <CardTitle className="text-sm">Workspace status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Instagram</span>
                <Button variant="ghost" size="sm" onClick={() => navigate('/settings')}>
                  <Badge variant={hasInstagram ? 'success' : 'secondary'}>
                    {hasInstagram ? 'Connected' : 'Not connected'}
                  </Badge>
                </Button>
              </div>
              {isDemoMode && (
                <div className="flex items-center justify-between">
                  <span className="text-foreground font-semibold">Demo mode</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDemoModeUpdate(!isDemoMode)}
                    isLoading={demoModeUpdating}
                  >
                    <Badge variant="warning">On</Badge>
                  </Button>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Automations published</span>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/automations?filter=active')}>
                    <span className="text-foreground font-semibold">{publishedCount}</span>
                  </Button>
              </div>
            </CardContent>
          </Card>

          {liveAutomation && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Live automation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{liveAutomation.name}</p>
                    <p className="text-xs text-muted-foreground">Active and running</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/automations?automationId=${liveAutomation._id}`)}
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/automations?automationId=${liveAutomation._id}&mode=edit`)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigate('/automations?section=simulate')}
                  >
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Account security</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {showSecurityPrompt ? (
                <>
                  <div className="flex items-center gap-2 text-amber-500">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Secure your account</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Verify your email to protect your workspace and enable team access.
                  </p>
                  <Button size="sm" onClick={() => navigate('/settings')}>
                    Secure My Account
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-2 text-emerald-500">
                  <BadgeCheck className="w-4 h-4" />
                  <span>Security checks complete</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Help</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Button variant="ghost" className="w-full justify-start" onClick={() => navigate('/support')} leftIcon={<HelpCircle className="w-4 h-4" />}>
                Read getting started
              </Button>
              <Button variant="ghost" className="w-full justify-start" onClick={() => navigate('/support')} leftIcon={<Wrench className="w-4 h-4" />}>
                Common IG connection issues
              </Button>
              <Button variant="ghost" className="w-full justify-start" onClick={() => navigate('/support')} leftIcon={<LayoutDashboard className="w-4 h-4" />}>
                Contact support
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{isSyncing ? 'Syncing updates...' : 'Last updated just now'}</span>
              </div>
              <Badge variant="secondary">Home</Badge>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

function formatTimeAgo(timestamp?: string): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default Home;
