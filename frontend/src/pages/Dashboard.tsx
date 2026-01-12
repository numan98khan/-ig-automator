import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Clock3,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Tag,
  User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { AiHandledCard } from '../components/AiHandledCard';
import { dashboardAPI, DashboardInsightsResponse, DashboardSummaryResponse } from '../services/api';

type TimeRange = 'today' | '7d' | '30d';
const timeframeOptions: { value: TimeRange; label: string; helper: string }[] = [
  { value: 'today', label: 'Today', helper: 'Starts 12:00am local' },
  { value: '7d', label: '7d', helper: 'Rolling last 7 days' },
  { value: '30d', label: '30d', helper: 'Rolling last 30 days' },
];

const dashboardCache = new Map<string, {
  summary: DashboardSummaryResponse;
  insights: DashboardInsightsResponse;
}>();

const Dashboard: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [range, setRange] = useState<TimeRange>('7d');
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [insights, setInsights] = useState<DashboardInsightsResponse | null>(null);

  useEffect(() => {
    if (!currentWorkspace) return;
    let isActive = true;

    const insightRange = range === 'today' ? '7d' : range;
    const cacheKey = `${currentWorkspace._id}:${range}:${insightRange}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached) {
      setSummary(cached.summary);
      setInsights(cached.insights);
    }

    const summaryPromise = dashboardAPI.getSummary(currentWorkspace._id, range);
    const insightsPromise = dashboardAPI.getInsights(currentWorkspace._id, insightRange as '7d' | '30d');

    Promise.all([summaryPromise, insightsPromise])
      .then(([summaryData, insightsData]) => {
        if (!isActive) return;
        dashboardCache.set(cacheKey, { summary: summaryData, insights: insightsData });
        setSummary(summaryData);
        setInsights(insightsData);
      })
      .catch((error) => {
        console.error('Failed to load dashboard summary', error);
        if (!cached && isActive) {
          setSummary(null);
          setInsights(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, [currentWorkspace, range]);

  const kpis = useMemo(() => summary?.kpis || {
    newConversations: 0,
    inboundMessages: 0,
    aiHandledRate: 0,
    humanAlerts: { open: 0, critical: 0 },
    medianFirstResponseMs: 0,
  }, [summary]);

  const outcomes = useMemo(() => summary?.outcomes || {
    leads: 0,
    bookings: 0,
    orders: 0,
    support: 0,
    escalated: 0,
    goal: { attempts: 0, completions: 0 },
  }, [summary]);

  const aiMetrics = useMemo(() => insights?.aiPerformance || {
    escalationRate: 0,
    topReasons: [],
  }, [insights]);

  const knowledgeMetrics = useMemo(() => insights?.knowledge || {
    kbBackedRate: 0,
    topArticles: [],
    missingTopics: [],
  }, [insights]);

  if (!currentWorkspace) {
    return (
      <div className="p-6 text-muted-foreground">
        Select a workspace to view your dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Workspace</p>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <LayoutDashboard className="w-7 h-7 text-primary" />
            Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Instant snapshot of inbox health, outcomes, and where humans need to jump in.
          </p>
        </div>
        <div className="flex items-center gap-2 glass-panel rounded-xl p-1 shadow-sm w-full md:w-auto">
          {timeframeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setRange(option.value)}
              className={`flex flex-col px-4 py-2 rounded-lg text-left transition-all duration-200 ${range === option.value
                ? 'bg-primary/10 border border-primary/30 text-primary font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <span className="text-sm">{option.label}</span>
              <span className="text-[11px] text-muted-foreground">{option.helper}</span>
            </button>
          ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-panel rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>New conversations</span>
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">{formatNumber(kpis.newConversations)}</span>
            <Badge variant="secondary">{range.toUpperCase()}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Fresh threads started by customers.</p>
        </div>

        <div className="glass-panel rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Total inbound messages</span>
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">{formatNumber(kpis.inboundMessages)}</span>
            <Badge variant="secondary">Across channels</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Customer messages received in this window.</p>
        </div>

        <AiHandledCard
          value={formatPercent(kpis.aiHandledRate)}
          className="glass-panel shadow-sm"
        />

        <div className="glass-panel rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Human alerts</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">{formatNumber(kpis.humanAlerts.open)}</span>
            <Badge variant="danger">{formatNumber(kpis.humanAlerts.critical)} critical</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Open escalations or SLA risks needing humans.</p>
        </div>

        <div className="glass-panel rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Median first-response time</span>
            <Clock3 className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">{formatDuration(kpis.medianFirstResponseMs)}</span>
            <Badge variant="secondary">AI + human</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Includes AI assists where a human replied first.</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Outcomes</p>
            <h2 className="text-xl font-bold text-foreground">Conversions & resolution</h2>
            <p className="text-sm text-muted-foreground">Counts for {timeframeOptions.find((t) => t.value === range)?.label}.</p>
          </div>
          <BarChart3 className="w-6 h-6 text-primary" />
        </div>

        <div className="grid grid-cols-2 gap-3">
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
              <p className="text-xs text-muted-foreground">Leads captured</p>
              <div className="text-2xl font-semibold text-foreground">{formatNumber(outcomes.leads)}</div>
            </div>
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
              <p className="text-xs text-muted-foreground">Booking intent</p>
              <div className="text-2xl font-semibold text-foreground">{formatNumber(outcomes.bookings)}</div>
            </div>
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
              <p className="text-xs text-muted-foreground">Order started</p>
              <div className="text-2xl font-semibold text-foreground">{formatNumber(outcomes.orders)}</div>
            </div>
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
              <p className="text-xs text-muted-foreground">Support resolved</p>
              <div className="text-2xl font-semibold text-foreground">{formatNumber(outcomes.support)}</div>
            </div>
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
              <p className="text-xs text-muted-foreground">Escalated to human</p>
              <div className="text-2xl font-semibold text-foreground">{formatNumber(outcomes.escalated)}</div>
            </div>
            <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
              <p className="text-xs text-muted-foreground">Goal attempts → completions</p>
              <div className="text-lg font-semibold text-foreground flex items-center gap-2">
                {formatNumber(outcomes.goal.attempts)}
                <ArrowUpRight className="w-4 h-4 text-primary" />
                {formatNumber(outcomes.goal.completions)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Primary/secondary goal conversions.</p>
            </div>
          </div>
        </div>
      {/* AI & Knowledge */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl shadow-sm p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">AI performance</p>
              <h2 className="text-xl font-bold text-foreground">Escalations & coverage</h2>
            </div>
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>

          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/15">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Escalation rate</p>
              <p className="text-lg font-semibold text-foreground">{formatPercent(aiMetrics.escalationRate)} of AI replied conversations</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Top escalation reasons</p>
            {aiMetrics.topReasons.length === 0 ? (
              <p className="text-xs text-muted-foreground">No escalations logged for this range.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {aiMetrics.topReasons.map((reason) => (
                  <Badge key={reason.name} variant="secondary">
                    {reason.name} ({formatNumber(reason.count)})
                  </Badge>
                ))}
              </div>
            )}
          </div>

        </div>

        <div className="glass-panel rounded-2xl shadow-sm p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Knowledge effectiveness</p>
              <h2 className="text-xl font-bold text-foreground">Grounding & gaps</h2>
            </div>
            <Tag className="w-6 h-6 text-primary" />
          </div>

          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/40 border border-border/60">
            <User className="w-5 h-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Replies backed by knowledge base</p>
              <p className="text-lg font-semibold text-foreground">{formatPercent(knowledgeMetrics.kbBackedRate)} of AI replies</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Top KB articles used</p>
            {knowledgeMetrics.topArticles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No knowledge-backed replies yet.</p>
            ) : (
              <ul className="space-y-1 text-sm text-foreground/90 list-disc list-inside">
                {knowledgeMetrics.topArticles.map((article) => (
                  <li key={article.name}>{article.name} ({formatNumber(article.count)})</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Missing KB topics</p>
            {knowledgeMetrics.missingTopics.length === 0 ? (
              <p className="text-xs text-muted-foreground">No gaps detected from AI replies.</p>
            ) : (
              <ul className="space-y-1 text-sm text-foreground/90 list-disc list-inside">
                {knowledgeMetrics.missingTopics.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  const percent = Math.max(0, Math.min(100, value * 100));
  return `${(Math.round(percent * 10) / 10).toFixed(1)}%`;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return '–';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes >= 1) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default Dashboard;
