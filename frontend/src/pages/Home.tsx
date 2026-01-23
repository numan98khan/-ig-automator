import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAccountContext } from '../context/AccountContext';
import { useDemoMode } from '../hooks/useDemoMode';
import {
  automationAPI,
  AutomationInstance,
  dashboardAPI,
  DashboardAttentionResponse,
  DashboardSummaryResponse,
  settingsAPI,
  WorkspaceSettings,
} from '../services/api';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

const attentionTabs = [
  { key: 'escalations', label: 'Priority' },
  { key: 'unreplied', label: 'Unreplied' },
  { key: 'followups', label: 'Follow-ups' },
] as const;

type AttentionFilter = typeof attentionTabs[number]['key'];

type HomeQueryData = {
  automations: AutomationInstance[];
  settings: WorkspaceSettings;
  dashboard: DashboardSummaryResponse;
};

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
  const { currentWorkspace, user } = useAuth();
  const { accounts } = useAccountContext();
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
        workspaceSettings,
        summary,
      ] = await Promise.all([
        automationAPI.getByWorkspace(workspaceId),
        settingsAPI.getByWorkspace(workspaceId),
        dashboardAPI.getSummary(workspaceId, 'today'),
      ]);
      return {
        automations: automationData,
        settings: workspaceSettings,
        dashboard: summary,
      };
    },
    enabled: Boolean(workspaceId),
    placeholderData: keepPreviousData,
  });
  const attentionQueries = useQueries({
    queries: attentionTabs.map((tab) => ({
      queryKey: ['home-attention', workspaceId, tab.key],
      queryFn: async () => {
        if (!workspaceId) {
          throw new Error('Missing workspace');
        }
        return dashboardAPI.getAttention(workspaceId, tab.key);
      },
      enabled: Boolean(workspaceId),
      placeholderData: keepPreviousData,
    })),
  });
  const settings = homeQuery.data?.settings ?? null;
  const automations = homeQuery.data?.automations ?? [];
  const dashboard = homeQuery.data?.dashboard ?? null;
  const attentionByFilter = useMemo(() => {
    const entries = attentionTabs.map((tab, index) => [tab.key, attentionQueries[index]?.data] as const);
    return Object.fromEntries(entries) as Record<AttentionFilter, DashboardAttentionResponse | undefined>;
  }, [attentionQueries]);
  const attentionItems = attentionByFilter[attentionFilter]?.items ?? [];
  const attentionCounts = useMemo(() => {
    return attentionTabs.reduce((acc, tab) => {
      acc[tab.key] = attentionByFilter[tab.key]?.items?.length ?? 0;
      return acc;
    }, {} as Record<AttentionFilter, number>);
  }, [attentionByFilter]);
  const totalAttentionCount = attentionTabs.reduce((sum, tab) => sum + (attentionCounts[tab.key] || 0), 0);
  const activeAttentionIndex = attentionTabs.findIndex((tab) => tab.key === attentionFilter);
  const activeAttentionQuery = attentionQueries[activeAttentionIndex];
  const isInitialLoading = homeQuery.isLoading && !homeQuery.data;
  const isAttentionLoading = Boolean(activeAttentionQuery?.isLoading && !activeAttentionQuery?.data);
  const { isDemoMode } = useDemoMode(settings?.demoModeEnabled);

  useEffect(() => {
    if (homeQuery.error) {
      console.error('Failed to load Home data', homeQuery.error);
    }
  }, [homeQuery.error]);

  useEffect(() => {
    if (activeAttentionQuery?.error) {
      console.error('Failed to load attention items', activeAttentionQuery.error);
    }
  }, [activeAttentionQuery?.error]);


  const hasInstagram = accounts.length > 0;
  const activeAutomationCount = automations.filter(
    (automation) => automation.isActive && automation.template?.status !== 'archived'
  ).length;
  const publishedCount = activeAutomationCount;
  const hasPublishedAutomation = Boolean(settings?.onboarding?.publishCompletedAt)
    || (!isDemoMode && publishedCount > 0);
  const showSecurityPrompt = Boolean(user?.isProvisional || !user?.emailVerified);
  const kpiSummary = dashboard?.kpis;
  const unrepliedCount = attentionCounts.unreplied ?? 0;
  const newLeadsCount = kpiSummary?.newConversations ?? 0;
  const issuesCount = kpiSummary?.humanAlerts?.open ?? 0;
  const setupItems = [
    { label: 'Connect Instagram', done: hasInstagram },
    { label: 'Verify email', done: Boolean(user?.emailVerified) },
    { label: 'Publish your first automation', done: hasPublishedAutomation },
  ];
  const setupCompletedCount = setupItems.filter((item) => item.done).length;
  const setupProgress = setupItems.length > 0
    ? Math.round((setupCompletedCount / setupItems.length) * 100)
    : 0;
  if (isInitialLoading) {
    return <HomeSkeleton />;
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Inbox needs attention
            </p>
            <p className="text-4xl md:text-5xl font-semibold text-foreground">
              {totalAttentionCount}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 px-5" onClick={() => navigate('/inbox')}>
              Open Inbox
            </Button>
            <Button variant="outline" className="h-11 px-5" onClick={() => navigate('/automations')}>
              Create automation
            </Button>
            <Button variant="ghost" className="h-11 px-4" onClick={() => navigate('/automations')}>
              Browse templates
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-col space-y-6 h-full overflow-y-auto pr-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Today</CardTitle>
              <p className="text-[15px] text-muted-foreground">Your inbox snapshot for today.</p>
            </CardHeader>
            <CardContent className="pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Unreplied
                  </p>
                  <p className="text-4xl font-semibold text-foreground">{unrepliedCount}</p>
                </div>
                <div className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    New leads
                  </p>
                  <p className="text-4xl font-semibold text-foreground">{newLeadsCount}</p>
                </div>
                <div className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Automations live
                  </p>
                  <p className="text-4xl font-semibold text-foreground">{publishedCount}</p>
                </div>
                {issuesCount > 0 && (
                  <div className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Issues
                    </p>
                    <p className="text-4xl font-semibold text-foreground">{issuesCount}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-4">
              <div>
                <CardTitle className="text-xl">Needs attention</CardTitle>
                <p className="text-[15px] text-muted-foreground">Latest inbox activity, sorted your way.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {attentionTabs.map((tab) => {
                  const isActive = attentionFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setAttentionFilter(tab.key)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        isActive
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/70 bg-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`${isActive ? 'text-primary' : 'text-foreground'}`}>
                        {attentionCounts[tab.key] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isAttentionLoading && (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={`attention-skeleton-${index}`} className="flex items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              )}

              {!isAttentionLoading && attentionItems.length > 0 && (
                <div className="space-y-4">
                  {attentionItems.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-foreground">
                          {item.participantName || 'Unknown'}
                          {item.handle && (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                              {item.handle}
                            </span>
                          )}
                        </p>
                        <p className="text-[15px] text-muted-foreground line-clamp-2">
                          {item.lastMessagePreview || 'No preview available'}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(item.lastMessageAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!isAttentionLoading && attentionItems.length === 0 && (
                <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-6 text-center">
                  <p className="text-sm font-semibold text-foreground">You're all caught up.</p>
                  <p className="text-[15px] text-muted-foreground">
                    Send yourself a test DM to see the flow end to end.
                  </p>
                  <Button
                    className="mt-4 h-11 px-5"
                    onClick={() => navigate('/automations?section=simulate')}
                  >
                    Send test DM
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col space-y-6 h-full overflow-y-auto pr-1">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Setup</CardTitle>
                <span className="text-sm text-muted-foreground">
                  {setupCompletedCount}/{setupItems.length} complete
                </span>
              </div>
              <div className="mt-4 h-2 w-full rounded-full bg-muted/60">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${setupProgress}%` }}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {setupItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between text-[15px]">
                  <div className="flex items-center gap-2">
                    {item.done ? (
                      <BadgeCheck className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <span className="h-2.5 w-2.5 rounded-full border border-primary/50" />
                    )}
                    <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>
                      {item.label}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold uppercase tracking-[0.18em] ${item.done ? 'text-muted-foreground' : 'text-primary'}`}>
                    {item.done ? 'Done' : 'Next'}
                  </span>
                </div>
              ))}
              {showSecurityPrompt && (
                <Button
                  variant="outline"
                  className="w-full h-11"
                  onClick={() => navigate('/settings')}
                >
                  Verify email
                </Button>
              )}
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
