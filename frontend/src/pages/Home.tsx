import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Bolt,
  ChevronRight,
  CircleDot,
  Clock,
  Cpu,
  HelpCircle,
  Instagram,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  TestTube2,
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
  DashboardSummaryResponse,
  flowTemplateAPI,
  FlowTemplate,
  settingsAPI,
  WorkspaceSettings,
} from '../services/api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

type SetupStep = {
  id: 'connect' | 'template' | 'basics' | 'publish' | 'simulate';
  title: string;
  why: string;
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
    id: 'publish',
    title: 'Publish',
    why: 'Activate your automation with safe defaults.',
  },
  {
    id: 'simulate',
    title: 'Test in simulator',
    why: 'Watch the automation respond before going live.',
  },
];

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { currentWorkspace, user } = useAuth();
  const { accounts } = useAccountContext();
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const { isDemoMode, enableDemoMode, disableDemoMode } = useDemoMode(settings?.demoModeEnabled);
  const [automations, setAutomations] = useState<AutomationInstance[]>([]);
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummaryResponse | null>(null);
  const [simulation, setSimulation] = useState<AutomationSimulationSessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBasics, setSavingBasics] = useState(false);
  const [demoModeUpdating, setDemoModeUpdating] = useState(false);
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

  const hasInstagram = accounts.length > 0;
  const hasConnection = hasInstagram || isDemoMode;
  const hasTemplateChoice = automations.length > 0;
  const hasBusinessBasics = Boolean(settings?.businessName && settings?.businessHours);
  const activeAutomationCount = automations.filter(
    (automation) => automation.isActive && automation.template?.status !== 'archived'
  ).length;
  const publishedCount = activeAutomationCount;
  const hasPublishedAutomation = publishedCount > 0;
  const hasSimulation = Boolean(simulation?.sessionId || simulation?.session?.status);
  const isActivated = hasConnection && hasPublishedAutomation && hasSimulation;
  const liveAutomation = useMemo(
    () => (isDemoMode
      ? null
      : automations.find((automation) => automation.isActive && automation.template?.status !== 'archived') || null),
    [automations, isDemoMode],
  );

  const currentStepId = useMemo(() => {
    if (!hasConnection) return 'connect';
    if (!hasTemplateChoice) return 'template';
    if (!hasBusinessBasics) return 'basics';
    if (!hasPublishedAutomation) return 'publish';
    if (!hasSimulation) return 'simulate';
    return 'simulate';
  }, [hasConnection, hasTemplateChoice, hasBusinessBasics, hasPublishedAutomation, hasSimulation]);

  const completedSteps = useMemo(() => {
    return [
      hasConnection,
      hasTemplateChoice,
      hasBusinessBasics,
      hasPublishedAutomation,
      hasSimulation,
    ].filter(Boolean).length;
  }, [hasConnection, hasTemplateChoice, hasBusinessBasics, hasPublishedAutomation, hasSimulation]);

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

  const handleTemplateSelect = (templateId: string) => {
    navigate(`/app/automations?templateId=${templateId}&source=onboarding`);
  };

  const showSecurityPrompt = Boolean(user?.isProvisional || !user?.emailVerified);
  const kpiSummary = dashboard?.kpis;
  const kpiOutcomes = dashboard?.outcomes;
  const nextStepLabel = currentStepId === 'simulate'
    ? 'Test in simulator'
    : SETUP_STEPS.find((step) => step.id === currentStepId)?.title || 'Continue setup';
  const nextStepAction = () => {
    switch (currentStepId) {
      case 'connect':
        navigate('/app/settings');
        break;
      case 'template':
        navigate('/app/automations');
        break;
      case 'basics':
        navigate('/app/automations?section=business-profile');
        break;
      case 'publish':
        navigate('/app/automations');
        break;
      case 'simulate':
      default:
        navigate('/app/automations?section=simulate');
        break;
    }
  };
  const simulationTimestamp = useMemo(() => {
    const timestamp = simulation?.session?.updatedAt || simulation?.session?.createdAt || null;
    if (!timestamp) return null;
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return null;
    }
  }, [simulation]);

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
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <div className="text-xs text-muted-foreground">
                    Workspace mode:{' '}
                    <span className="text-foreground font-semibold">{isDemoMode ? 'Demo' : 'Live'}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Demo mode keeps messages simulated until you are ready to go live.
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant={isDemoMode ? 'secondary' : 'outline'}
                    onClick={() => handleDemoModeUpdate(!isDemoMode)}
                    isLoading={demoModeUpdating}
                  >
                    {isDemoMode ? 'Switch to live mode' : 'Enable demo mode'}
                  </Button>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <div className="text-xs text-muted-foreground">
                    Next step: <span className="text-foreground font-semibold">{nextStepLabel}</span>
                  </div>
                  <Button size="sm" onClick={nextStepAction}>
                    {currentStepId === 'simulate' ? 'Open simulator' : 'Continue'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {SETUP_STEPS.map((step, index) => {
                  const isComplete = [
                    hasConnection,
                    hasTemplateChoice,
                    hasBusinessBasics,
                    hasPublishedAutomation,
                    hasSimulation,
                  ][index];
                  const isCurrent = step.id === currentStepId;
                  return (
                    <div key={step.id} className="border border-border/60 rounded-xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {isComplete ? (
                            <BadgeCheck className="w-5 h-5 text-emerald-500 mt-0.5" />
                          ) : (
                            <CircleDot className={`w-5 h-5 mt-0.5 ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`} />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-foreground">{step.title}</p>
                            <p className="text-xs text-muted-foreground">{step.why}</p>
                          </div>
                        </div>
                        <Badge
                          variant={isComplete ? 'secondary' : isCurrent ? 'primary' : 'secondary'}
                          className={isComplete ? 'text-muted-foreground' : undefined}
                        >
                          {isComplete ? 'Done' : isCurrent ? 'In progress' : 'Not started'}
                        </Badge>
                      </div>

                      {isComplete && (
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
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

                      {isCurrent && step.id === 'connect' && (
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                          <Button onClick={() => navigate('/app/settings')} leftIcon={<Instagram className="w-4 h-4" />}>
                            Connect Instagram
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleDemoModeUpdate(true)}
                            isLoading={demoModeUpdating}
                          >
                            Try demo mode
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
                            Safe defaults enabled • You can pause anytime
                          </div>
                          <Button onClick={() => navigate('/app/automations')}>
                            Publish now
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

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Automation health</h3>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/app/automations')}>
                      View all
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {automations.slice(0, 5).map((automation) => {
                      const statusLabel = automation.template?.status === 'archived'
                        ? 'Draft'
                        : automation.isActive
                          ? 'Running'
                          : 'Paused';
                      const statusTone = statusLabel === 'Running'
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : statusLabel === 'Paused'
                          ? 'bg-amber-500/15 text-amber-500'
                          : 'bg-slate-500/15 text-slate-500';
                      return (
                        <div key={automation._id} className="flex items-center justify-between border border-border/60 rounded-lg p-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{automation.name}</p>
                            <p className="text-xs text-muted-foreground">{automation.description || 'Automation'}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${statusTone}`}>
                            {statusLabel}
                          </span>
                        </div>
                      );
                    })}
                    {automations.length === 0 && (
                      <div className="text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg p-3">
                        No automations yet. Create one to see its health here.
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => navigate('/app/inbox')} leftIcon={<MessageSquare className="w-4 h-4" />}>
                    Open Inbox
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/app/automations')} leftIcon={<Sparkles className="w-4 h-4" />}>
                    Create automation
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/app/automations?section=simulate')} leftIcon={<TestTube2 className="w-4 h-4" />}>
                    Test automation
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/app/automations?section=knowledge')} leftIcon={<Cpu className="w-4 h-4" />}>
                    Add knowledge base article
                  </Button>
                </div>
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
              {!hasInstagram && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Demo mode</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDemoModeUpdate(true)}
                    isLoading={demoModeUpdating}
                  >
                    <Badge variant={isDemoMode ? 'primary' : 'secondary'}>
                      {isDemoMode ? 'On' : 'Off'}
                    </Badge>
                  </Button>
                </div>
              )}
              {hasInstagram && isDemoMode && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Demo mode</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDemoModeUpdate(false)}
                    isLoading={demoModeUpdating}
                  >
                    <Badge variant="primary">On</Badge>
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

export default Home;
