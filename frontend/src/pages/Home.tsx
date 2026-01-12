import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Bolt,
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
  TestTube2,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAccountContext } from '../context/AccountContext';
import { useDemoMode } from '../hooks/useDemoMode';
import {
  automationAPI,
  AutomationInstance,
  AutomationSimulationSessionResponse,
  dashboardAPI,
  DashboardAttentionItem,
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
import { Input } from '../components/ui/Input';

type SetupStep = {
  id: 'connect' | 'template' | 'basics' | 'simulate' | 'publish';
  title: string;
  why: string;
};

type AttentionFilter = 'escalations' | 'unreplied' | 'followups';

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

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { currentWorkspace, user } = useAuth();
  const { accounts, activeAccount } = useAccountContext();
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const { isDemoMode, enableDemoMode, disableDemoMode } = useDemoMode(settings?.demoModeEnabled);
  const [automations, setAutomations] = useState<AutomationInstance[]>([]);
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummaryResponse | null>(null);
  const [simulation, setSimulation] = useState<AutomationSimulationSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBasics, setSavingBasics] = useState(false);
  const [demoModeUpdating, setDemoModeUpdating] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<SetupStep['id'] | null>(null);
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('escalations');
  const [attentionItems, setAttentionItems] = useState<DashboardAttentionItem[]>([]);
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [basicsForm, setBasicsForm] = useState({
    businessName: '',
    businessHours: '',
    businessTone: '',
    businessLocation: '',
  });

  useEffect(() => {
    if (!currentWorkspace) return;
    let cancelled = false;
    const loadHome = async () => {
      setLoading(true);
      try {
        const [
          automationData,
          templateData,
          workspaceSettings,
          simulationSession,
          summary,
        ] = await Promise.all([
          automationAPI.getByWorkspace(currentWorkspace._id),
          flowTemplateAPI.list(),
          settingsAPI.getByWorkspace(currentWorkspace._id),
          automationAPI.getSimulationSession(currentWorkspace._id),
          dashboardAPI.getSummary(currentWorkspace._id, 'today'),
        ]);
        if (cancelled) return;
        setAutomations(automationData);
        setTemplates(templateData);
        setSettings(workspaceSettings);
        setSimulation(simulationSession);
        setDashboard(summary);
        setBasicsForm({
          businessName: workspaceSettings?.businessName || '',
          businessHours: workspaceSettings?.businessHours || '',
          businessTone: workspaceSettings?.businessTone || '',
          businessLocation: workspaceSettings?.businessLocation || '',
        });
      } catch (error) {
        console.error('Failed to load Home data', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    loadHome();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspace]);

  useEffect(() => {
    if (!currentWorkspace) return;
    setAttentionLoading(true);

    dashboardAPI.getAttention(currentWorkspace._id, attentionFilter)
      .then((resp) => setAttentionItems(resp.items))
      .catch((error) => {
        console.error('Failed to load attention items', error);
        setAttentionItems([]);
      })
      .finally(() => setAttentionLoading(false));
  }, [currentWorkspace, attentionFilter]);

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

  const progressPercent = Math.round((completedSteps / SETUP_STEPS.length) * 100);

  const recommendedTemplates = useMemo(() => {
    return templates
      .filter((template) => template.currentVersion && template.status === 'active')
      .slice(0, 3);
  }, [templates]);

  const handleSaveBasics = async () => {
    if (!currentWorkspace) return;
    setSavingBasics(true);
    try {
      const updated = await settingsAPI.update(currentWorkspace._id, basicsForm);
      setSettings(updated);
    } catch (error) {
      console.error('Failed to update business basics', error);
    } finally {
      setSavingBasics(false);
    }
  };

  const handleDemoModeUpdate = async (nextValue: boolean) => {
    if (!currentWorkspace || nextValue === isDemoMode) return;
    const previousValue = isDemoMode;
    nextValue ? enableDemoMode() : disableDemoMode();
    setDemoModeUpdating(true);
    try {
      const updated = await settingsAPI.update(currentWorkspace._id, { demoModeEnabled: nextValue });
      setSettings(updated);
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
      setSettings(updated);
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
      setSettings(updated);
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
    navigate(`/app/automations?templateId=${templateId}&source=onboarding`);
  };

  const showSecurityPrompt = Boolean(user?.isProvisional || !user?.emailVerified);
  const kpiSummary = dashboard?.kpis;
  const kpiOutcomes = dashboard?.outcomes;
  const simulationTimestamp = useMemo(() => {
    const timestamp = simulation?.session?.updatedAt || simulation?.session?.createdAt || null;
    if (!timestamp) return null;
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return null;
    }
  }, [simulation]);

  const toggleStep = (stepId: SetupStep['id']) => {
    setExpandedStepId((prev) => (prev === stepId ? null : stepId));
  };

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
        <div className="space-y-6 h-full overflow-y-auto pr-1">
          {!isActivated && (
            <Card className="border border-border/70">
              <CardHeader className="space-y-2">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Bolt className="w-5 h-5 text-primary" />
                  Get your first automation live
                </CardTitle>
                <p className="text-sm text-muted-foreground">Complete setup to go live with confidence.</p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{progressPercent}% complete</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted/60">
                  <div className="h-2 rounded-full bg-primary" style={{ width: `${progressPercent}%` }} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {SETUP_STEPS.map((step, index) => {
                  const isComplete = [
                    connectStepComplete,
                    hasTemplateChoice,
                    hasBusinessBasics,
                    hasSimulation,
                    hasPublishedAutomation,
                  ][index];
                  const isCurrent = step.id === currentStepId;
                  const isExpanded = isComplete && expandedStepId === step.id;
                  const isConnectPartial = step.id === 'connect' && connectStepComplete && !hasInstagram;
                  const connectedUsername = activeAccount?.username || accounts[0]?.username;
                  const selectedAutomation = automations.find((automation) => automation.template?.status !== 'archived') || automations[0];
                  const selectedTemplateName = selectedAutomation?.template?.name || selectedAutomation?.name;
                  return (
                    <div
                      key={step.id}
                      className={`border border-border/60 rounded-xl p-4 space-y-3 transition ${
                        isComplete ? 'cursor-pointer hover:border-border/90' : ''
                      }`}
                      onClick={() => {
                        if (isComplete) toggleStep(step.id);
                      }}
                      onKeyDown={(event) => {
                        if (!isComplete) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleStep(step.id);
                        }
                      }}
                      role={isComplete ? 'button' : undefined}
                      tabIndex={isComplete ? 0 : undefined}
                      aria-expanded={isComplete ? isExpanded : undefined}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {isComplete ? (
                            <BadgeCheck className={`w-5 h-5 mt-0.5 ${isConnectPartial ? 'text-amber-500' : 'text-emerald-500'}`} />
                          ) : (
                            <CircleDot className={`w-5 h-5 mt-0.5 ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`} />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-foreground">{step.title}</p>
                            <p className="text-xs text-muted-foreground">{step.why}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={isComplete ? (isConnectPartial ? 'warning' : 'secondary') : isCurrent ? 'primary' : 'secondary'}
                            className={isComplete ? 'text-muted-foreground' : undefined}
                          >
                            {isComplete
                              ? (isConnectPartial ? 'Demo mode' : 'Done')
                              : isCurrent
                                ? 'In progress'
                                : 'Not started'}
                          </Badge>
                          {isComplete && (
                            <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          )}
                        </div>
                      </div>

                      {isComplete && isExpanded && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          {step.id === 'connect' && (
                            <p>
                              {hasInstagram
                                ? `Connected account: @${connectedUsername || 'instagram'}`
                                : isDemoMode
                                  ? 'Demo mode active for this workspace.'
                                  : 'Connection decision saved.'}
                            </p>
                          )}
                          {step.id === 'template' && (
                            <p>
                              {selectedTemplateName
                                ? `Selected template: ${selectedTemplateName}`
                                : `Templates created: ${automations.length}`}
                            </p>
                          )}
                          {step.id === 'basics' && (
                            <p>
                              {settings?.businessName
                                ? `Business: ${settings.businessName}`
                                : 'Business basics saved.'}
                            </p>
                          )}
                          {step.id === 'simulate' && (
                            <p>
                              {simulationTimestamp
                                ? `Last simulator run: ${simulationTimestamp}`
                                : 'Simulator run recorded.'}
                            </p>
                          )}
                          {step.id === 'publish' && (
                            <p>
                              {publishedCount > 0
                                ? `${publishedCount} automation${publishedCount === 1 ? '' : 's'} published`
                                : 'Publish settings saved.'}
                            </p>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (step.id === 'connect') navigate('/app/settings');
                              if (step.id === 'template') navigate('/app/automations');
                              if (step.id === 'basics') navigate('/app/automations?section=business-profile');
                              if (step.id === 'publish') navigate('/app/automations');
                              if (step.id === 'simulate') navigate('/app/automations?section=simulate');
                            }}
                          >
                            {step.id === 'connect' && 'Manage'}
                            {step.id === 'template' && 'Change'}
                            {step.id === 'basics' && 'Edit'}
                            {step.id === 'publish' && 'View settings'}
                            {step.id === 'simulate' && 'Run again'}
                          </Button>
                        </div>
                      )}

                      {step.id === 'connect' && !connectStepComplete && (
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                          <Button onClick={() => navigate('/app/settings')} leftIcon={<Instagram className="w-4 h-4" />}>
                            Connect Instagram
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleConnectDecision}
                            isLoading={demoModeUpdating}
                          >
                            {isDemoMode ? 'Continue with demo mode' : 'Continue with demo mode'}
                          </Button>
                        </div>
                      )}

                      {isCurrent && step.id === 'template' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {recommendedTemplates.length > 0 ? (
                              recommendedTemplates.map((template) => {
                                const previewSnippet = template.currentVersion?.display?.previewConversation?.[0]?.message;
                                return (
                                  <div key={template._id} className="border border-border/60 rounded-lg p-3 space-y-2">
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">{template.name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {template.currentVersion?.display?.outcome || template.description || 'Automation template'}
                                      </p>
                                    </div>
                                    {previewSnippet && (
                                      <p className="text-[11px] text-muted-foreground italic line-clamp-2">“{previewSnippet}”</p>
                                    )}
                                    <Button size="sm" onClick={() => handleTemplateSelect(template._id)}>
                                      Use this template
                                    </Button>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="col-span-full text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg p-3">
                                No templates are available yet.
                              </div>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="justify-start"
                            onClick={() => navigate('/app/automations')}
                            rightIcon={<ChevronRight className="w-4 h-4" />}
                          >
                            Browse all templates
                          </Button>
                        </div>
                      )}

                      {isCurrent && step.id === 'basics' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                          <Button onClick={handleSaveBasics} disabled={savingBasics}>
                            {savingBasics ? 'Saving...' : 'Save business basics'}
                          </Button>
                        </div>
                      )}

                      {isCurrent && step.id === 'publish' && (
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            {isDemoMode
                              ? (hasInstagram
                                ? 'Demo mode is on • Switch to live to start sending messages.'
                                : 'Connect Instagram to go live.')
                              : 'Safe defaults enabled • You can pause anytime'}
                          </div>
                          <Button
                            onClick={
                              isDemoMode
                                ? (hasInstagram ? handleGoLive : handleConnectInstagram)
                                : () => navigate('/app/automations')
                            }
                            isLoading={demoModeUpdating}
                          >
                            {isDemoMode
                              ? (hasInstagram ? 'Go live' : 'Connect Instagram to go live')
                              : 'Publish now'}
                          </Button>
                        </div>
                      )}

                      {isCurrent && step.id === 'simulate' && (
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            What you’ll see: captured fields, tags, and the current step as it runs.
                          </div>
                          {hasSimulation ? (
                            <div className="space-y-2">
                              <div className="text-xs text-emerald-500 font-semibold">
                                Test complete{simulationTimestamp ? ` · ${simulationTimestamp}` : ''}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" onClick={() => navigate('/app/inbox')}>
                                  Open Inbox
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => navigate('/app/automations')}>
                                  View automation
                                </Button>
                                <Button size="sm" onClick={() => navigate('/app/automations?section=simulate')}>
                                  Run again
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button onClick={() => navigate('/app/automations?section=simulate')} leftIcon={<TestTube2 className="w-4 h-4" />}>
                              Test in simulator
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {isActivated && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Ops summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">DMs today</p>
                    <p className="text-xl font-semibold text-foreground">{kpiSummary?.inboundMessages ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">Leads captured</p>
                    <p className="text-xl font-semibold text-foreground">{kpiOutcomes?.leads ?? 0}</p>
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
                {attentionLoading && (
                  <div className="py-6 text-center text-muted-foreground text-sm">Loading attention queue…</div>
                )}

                {!attentionLoading && attentionItems.map((item) => (
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

                {!attentionLoading && attentionItems.length === 0 && (
                  <div className="py-6 text-center text-muted-foreground text-sm">All clear. No items need attention for this filter.</div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6 h-full overflow-y-auto pr-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Workspace status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Instagram</span>
                <Button variant="ghost" size="sm" onClick={() => navigate('/app/settings')}>
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
                  <Button variant="ghost" size="sm" onClick={() => navigate('/app/automations?filter=active')}>
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
                    onClick={() => navigate(`/app/automations?automationId=${liveAutomation._id}`)}
                  >
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/app/automations?automationId=${liveAutomation._id}&mode=edit`)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigate('/app/automations?section=simulate')}
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
                  <Button size="sm" onClick={() => navigate('/app/settings')}>
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
              <Button variant="ghost" className="w-full justify-start" onClick={() => navigate('/app/support')} leftIcon={<HelpCircle className="w-4 h-4" />}>
                Read getting started
              </Button>
              <Button variant="ghost" className="w-full justify-start" onClick={() => navigate('/app/support')} leftIcon={<Wrench className="w-4 h-4" />}>
                Common IG connection issues
              </Button>
              <Button variant="ghost" className="w-full justify-start" onClick={() => navigate('/app/support')} leftIcon={<LayoutDashboard className="w-4 h-4" />}>
                Contact support
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4 flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>{loading ? 'Syncing updates...' : 'Last updated just now'}</span>
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
