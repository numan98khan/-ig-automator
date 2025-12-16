import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Tag,
  User,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

type TimeRange = 'today' | '7d' | '30d';
type AttentionFilter = 'escalations' | 'unreplied' | 'followups' | 'high_intent';

type AttentionItem = {
  id: string;
  name: string;
  handle: string;
  preview: string;
  category: string;
  lastMessageAgo: string;
  badges: ('escalated' | 'sla' | 'followup' | 'high_intent')[];
};

const timeframeOptions: { value: TimeRange; label: string; helper: string }[] = [
  { value: 'today', label: 'Today', helper: 'Starts 12:00am local' },
  { value: '7d', label: '7d', helper: 'Rolling last 7 days' },
  { value: '30d', label: '30d', helper: 'Rolling last 30 days' },
];

const kpiByRange = {
  today: {
    newConversations: 14,
    inboundMessages: 82,
    aiHandled: 68,
    humanAlerts: { open: 9, critical: 3 },
    medianFirstResponse: '3m',
  },
  '7d': {
    newConversations: 108,
    inboundMessages: 612,
    aiHandled: 72,
    humanAlerts: { open: 21, critical: 6 },
    medianFirstResponse: '4m',
  },
  '30d': {
    newConversations: 442,
    inboundMessages: 2740,
    aiHandled: 75,
    humanAlerts: { open: 58, critical: 12 },
    medianFirstResponse: '5m',
  },
};

const attentionQueues: Record<AttentionFilter, AttentionItem[]> = {
  escalations: [
    {
      id: 'esc-1',
      name: 'Jordan Diaz',
      handle: '@jordanfit',
      preview: 'Needs human confirmation on custom order sizing and delivery windows.',
      category: 'Order risk',
      lastMessageAgo: '12m ago',
      badges: ['escalated', 'sla'],
    },
    {
      id: 'esc-2',
      name: 'Sofia Patel',
      handle: '@sofiacooks',
      preview: 'Shared photos asking if the issue qualifies for a replacement.',
      category: 'Support',
      lastMessageAgo: '26m ago',
      badges: ['escalated'],
    },
  ],
  unreplied: [
    {
      id: 'unrep-1',
      name: 'Marcus Lee',
      handle: '@marcuslee',
      preview: 'Do you have same-day slots this week? Looking to book fast.',
      category: 'Booking',
      lastMessageAgo: '9m ago',
      badges: ['sla', 'high_intent'],
    },
    {
      id: 'unrep-2',
      name: 'Glow Studio',
      handle: '@glowstudio',
      preview: 'Checking pricing for bulk / reseller partnership.',
      category: 'Sales',
      lastMessageAgo: '18m ago',
      badges: ['high_intent'],
    },
  ],
  followups: [
    {
      id: 'follow-1',
      name: 'Camila R.',
      handle: '@camilar',
      preview: 'Thanks! confirming if you received the docs I sent.',
      category: 'Follow-up',
      lastMessageAgo: '1d ago',
      badges: ['followup'],
    },
    {
      id: 'follow-2',
      name: 'Beaumont Co',
      handle: '@beaumont',
      preview: 'Team asked for updated quote after the walk-through.',
      category: 'Quote',
      lastMessageAgo: '2d ago',
      badges: ['followup', 'high_intent'],
    },
  ],
  high_intent: [
    {
      id: 'intent-1',
      name: 'Nora Chen',
      handle: '@norachen',
      preview: 'Ready to confirm appointment if Friday afternoon works.',
      category: 'Booking',
      lastMessageAgo: '22m ago',
      badges: ['high_intent'],
    },
    {
      id: 'intent-2',
      name: 'Atlas Events',
      handle: '@atlasevents',
      preview: 'Asked for invoice link to pay deposit today.',
      category: 'Order',
      lastMessageAgo: '33m ago',
      badges: ['high_intent', 'sla'],
    },
  ],
};

const outcomesByRange = {
  today: {
    leads: 18,
    bookings: 11,
    orders: 7,
    support: 22,
    escalated: 6,
    goal: { attempts: 42, completions: 29 },
  },
  '7d': {
    leads: 96,
    bookings: 64,
    orders: 38,
    support: 144,
    escalated: 28,
    goal: { attempts: 214, completions: 166 },
  },
  '30d': {
    leads: 372,
    bookings: 286,
    orders: 171,
    support: 604,
    escalated: 111,
    goal: { attempts: 890, completions: 706 },
  },
};

const aiMetricsByRange = {
  today: {
    escalationRate: '11%',
    topReasons: ['Payment issue', 'Policy clarity', 'Tone check'],
    topCategories: ['Support', 'Orders', 'Booking'],
  },
  '7d': {
    escalationRate: '10%',
    topReasons: ['Policy clarity', 'Sensitive topic', 'Missing context'],
    topCategories: ['Support', 'Sales inquiries', 'Shipping', 'Booking', 'Returns'],
  },
  '30d': {
    escalationRate: '9%',
    topReasons: ['Policy clarity', 'Edge cases', 'Payment risk'],
    topCategories: ['Support', 'Sales inquiries', 'Booking', 'Logistics', 'Account help'],
  },
};

const knowledgeMetricsByRange = {
  today: {
    kbBacked: '64%',
    topArticles: ['Refund policy highlights', 'Service menu + pricing', 'How to share photos'],
    missingTopics: ['Bulk pricing matrix', 'Deposit policy by location', 'Order status steps'],
  },
  '7d': {
    kbBacked: '67%',
    topArticles: ['Service menu + pricing', 'Shipping and delivery', 'Appointment confirmation steps', 'Photo guidelines'],
    missingTopics: ['Bulk pricing matrix', 'Edge-case damage photos', 'Wholesale onboarding'],
  },
  '30d': {
    kbBacked: '70%',
    topArticles: ['Shipping and delivery', 'Support triage checklist', 'FAQ: bookings', 'Warranty and returns', 'Order edits'],
    missingTopics: ['International shipping cutoffs', 'Custom order sizing guide', 'After-hours escalation playbook'],
  },
};

const badgeVariantMap = {
  escalated: { label: 'Escalated', variant: 'danger' as const },
  sla: { label: 'SLA risk', variant: 'warning' as const },
  followup: { label: 'Follow-up due', variant: 'secondary' as const },
  high_intent: { label: 'High intent', variant: 'primary' as const },
};

const Dashboard: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [range, setRange] = useState<TimeRange>('7d');
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('escalations');

  const kpis = useMemo(() => kpiByRange[range], [range]);
  const outcomes = useMemo(() => outcomesByRange[range], [range]);
  const aiMetrics = useMemo(() => aiMetricsByRange[range], [range]);
  const knowledgeMetrics = useMemo(() => knowledgeMetricsByRange[range], [range]);
  const attentionItems = useMemo(() => attentionQueues[attentionFilter], [attentionFilter]);

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
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Instant snapshot of inbox health, outcomes, and where humans need to jump in.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl p-1 shadow-sm w-full md:w-auto">
          {timeframeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setRange(option.value)}
              className={`flex flex-col px-4 py-2 rounded-lg text-left transition-all duration-200 ${
                range === option.value
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
        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>New conversations</span>
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">{kpis.newConversations}</span>
            <Badge variant="secondary">{range.toUpperCase()}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Fresh threads started by customers.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Total inbound messages</span>
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">{kpis.inboundMessages}</span>
            <Badge variant="secondary">Across channels</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Customer messages received in this window.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>AI-handled %</span>
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">{kpis.aiHandled}%</span>
            <Badge variant="primary">AI replies / threads</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Share of inbound threads where AI replied.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Human alerts</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">{kpis.humanAlerts.open}</span>
            <Badge variant="danger">{kpis.humanAlerts.critical} critical</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Open escalations or SLA risks needing humans.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Median first-response time</span>
            <Clock3 className="w-4 h-4 text-primary" />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-bold text-foreground">{kpis.medianFirstResponse}</span>
            <Badge variant="secondary">AI + human</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Includes AI assists where a human replied first.</p>
        </div>
      </div>

      {/* Needs Attention Now */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-card border border-border rounded-2xl shadow-sm">
          <div className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-border/70">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-semibold">Needs attention now</p>
              <h2 className="text-xl font-bold text-foreground">Actionable queue</h2>
              <p className="text-sm text-muted-foreground">Sort by escalations, unreplied, follow-ups, or high intent.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['escalations', 'unreplied', 'followups', 'high_intent'] as AttentionFilter[]).map((filter) => (
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
                  {filter === 'high_intent' && 'High intent'}
                </Button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border/60">
            {attentionItems.map((item) => (
              <div key={item.id} className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                    {item.name[0]}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <span>{item.name}</span>
                      <span className="text-muted-foreground">{item.handle}</span>
                    </div>
                    <p className="text-sm text-foreground/90 line-clamp-2">{item.preview}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{item.category}</Badge>
                      <span className="text-xs text-muted-foreground">Last message {item.lastMessageAgo}</span>
                      {item.badges.map((badge) => (
                        <Badge key={badge} variant={badgeVariantMap[badge].variant}>
                          {badgeVariantMap[badge].label}
                        </Badge>
                      ))}
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

            {attentionItems.length === 0 && (
              <div className="p-6 text-center text-muted-foreground text-sm">All clear. No items need attention for this filter.</div>
            )}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-5 space-y-4">
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
              <div className="text-2xl font-semibold text-foreground">{outcomes.leads}</div>
            </div>
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
              <p className="text-xs text-muted-foreground">Booking intent</p>
              <div className="text-2xl font-semibold text-foreground">{outcomes.bookings}</div>
            </div>
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
              <p className="text-xs text-muted-foreground">Order started</p>
              <div className="text-2xl font-semibold text-foreground">{outcomes.orders}</div>
            </div>
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
              <p className="text-xs text-muted-foreground">Support resolved</p>
              <div className="text-2xl font-semibold text-foreground">{outcomes.support}</div>
            </div>
            <div className="p-4 bg-muted/40 rounded-xl border border-border/50">
              <p className="text-xs text-muted-foreground">Escalated to human</p>
              <div className="text-2xl font-semibold text-foreground">{outcomes.escalated}</div>
            </div>
            <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
              <p className="text-xs text-muted-foreground">Goal attempts → completions</p>
              <div className="text-lg font-semibold text-foreground flex items-center gap-2">
                {outcomes.goal.attempts}
                <ArrowUpRight className="w-4 h-4 text-primary" />
                {outcomes.goal.completions}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Primary/secondary goal conversions.</p>
            </div>
          </div>
        </div>
      </div>

      {/* AI & Knowledge */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl shadow-sm p-5 space-y-3">
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
              <p className="text-lg font-semibold text-foreground">{aiMetrics.escalationRate} of AI replied conversations</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Top escalation reasons</p>
            <div className="flex flex-wrap gap-2">
              {aiMetrics.topReasons.map((reason) => (
                <Badge key={reason} variant="secondary">{reason}</Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Top categories handled</p>
            <div className="flex flex-wrap gap-2">
              {aiMetrics.topCategories.map((category) => (
                <Badge key={category} variant="primary">{category}</Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-5 space-y-3">
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
              <p className="text-lg font-semibold text-foreground">{knowledgeMetrics.kbBacked} of AI replies</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Top KB articles used</p>
            <ul className="space-y-1 text-sm text-foreground/90 list-disc list-inside">
              {knowledgeMetrics.topArticles.map((article) => (
                <li key={article}>{article}</li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Missing KB topics</p>
            <ul className="space-y-1 text-sm text-foreground/90 list-disc list-inside">
              {knowledgeMetrics.missingTopics.map((topic) => (
                <li key={topic}>{topic}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
