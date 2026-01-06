import React, { useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Power, PowerOff, Sparkles, Target, Trash2 } from 'lucide-react';
import { AutomationInstance, ResourceUsage } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { TRIGGER_METADATA } from './constants';

type SummaryStats = {
  activeCount: number;
  totalCount: number;
  totalTriggered: number;
  totalRepliesSent: number;
};

type AutomationsListViewProps = {
  automations: AutomationInstance[];
  summaryStats: SummaryStats;
  loading: boolean;
  aiUsage?: ResourceUsage | null;
  onCreate: () => void;
  onOpen?: (automation: AutomationInstance) => void;
  onEdit?: (automation: AutomationInstance) => void;
  onToggle: (automation: AutomationInstance) => void;
  onDelete: (automation: AutomationInstance) => void;
};

export const AutomationsListView: React.FC<AutomationsListViewProps> = ({
  automations,
  summaryStats,
  loading,
  aiUsage,
  onCreate,
  onOpen,
  onEdit,
  onToggle,
  onDelete,
}) => {
  const isOpenEnabled = typeof onOpen === 'function';
  const isEditEnabled = typeof onEdit === 'function';
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const filteredAutomations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return automations.filter((automation) => {
      if (statusFilter === 'active' && !automation.isActive) return false;
      if (statusFilter === 'inactive' && automation.isActive) return false;
      if (!query) return true;
      const nameMatch = automation.name.toLowerCase().includes(query);
      const descriptionMatch = (automation.description || '').toLowerCase().includes(query);
      return nameMatch || descriptionMatch;
    });
  }, [automations, searchQuery, statusFilter]);

  const aiUsed = aiUsage?.used ?? 0;
  const aiLimit = aiUsage?.limit;
  const hasAiLimit = typeof aiLimit === 'number';
  const aiRatio = hasAiLimit && aiLimit > 0 ? aiUsed / aiLimit : 0;
  const aiPercent = hasAiLimit && aiLimit > 0 ? Math.min(100, Math.round(aiRatio * 100)) : 0;
  const aiRemaining = hasAiLimit ? Math.max(aiLimit - aiUsed, 0) : null;
  const showAiUsage = hasAiLimit;
  const aiTone = !hasAiLimit
    ? 'info'
    : aiUsed >= (aiLimit || 0)
      ? 'critical'
      : aiRatio >= 0.8
        ? 'warning'
        : 'info';
  const aiContainerClass = aiTone === 'critical'
    ? 'border-red-500/30 bg-red-500/10'
    : aiTone === 'warning'
      ? 'border-amber-400/40 bg-amber-500/10'
      : 'border-border/60 bg-background/70';
  const aiAccentClass = aiTone === 'critical'
    ? 'text-red-500'
    : aiTone === 'warning'
      ? 'text-amber-500'
      : 'text-primary';
  const aiMessageClass = aiTone === 'critical'
    ? 'text-red-400'
    : aiTone === 'warning'
      ? 'text-amber-600'
      : 'text-muted-foreground';
  const aiBarClass = aiTone === 'critical'
    ? 'bg-red-500'
    : aiTone === 'warning'
      ? 'bg-amber-500'
      : 'bg-primary';
  const aiUsageLabel = hasAiLimit ? `${aiUsed} / ${aiLimit}` : `${aiUsed}`;
  const aiMessage = hasAiLimit
    ? aiUsed >= (aiLimit || 0)
      ? 'AI message limit reached. Upgrade to keep automations sending.'
      : aiRatio >= 0.8
        ? `${aiRemaining} AI messages left in this billing period.`
        : `${aiRemaining} AI messages remaining this period.`
    : 'Unlimited AI messages for this plan.';

  return (
    <>
    <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold">Automations</h2>
            <span className="rounded-full border border-border/60 bg-background/70 px-3 py-1 text-xs font-semibold text-muted-foreground">
              {summaryStats.activeCount} active / {summaryStats.totalCount} total
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Design, activate, and monitor your automated Instagram journeys.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden sm:flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-1 py-1">
            {(['all', 'active', 'inactive'] as const).map((filter) => (
              <button
                key={filter}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                  statusFilter === filter
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setStatusFilter(filter)}
                type="button"
              >
                {filter}
              </button>
            ))}
          </div>
          <div className="hidden lg:block">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search automations..."
              className="w-56 rounded-full border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <Button onClick={onCreate} leftIcon={<Plus className="w-4 h-4" />} className="shadow-md">
            Create Automation
          </Button>
        </div>
      </div>
      {showAiUsage && (
        <div className={`rounded-xl border p-3 ${aiContainerClass}`}>
          <div className="flex items-center justify-between gap-3">
            <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${aiAccentClass}`}>
              <Sparkles className="w-4 h-4" />
              AI messages
            </div>
            <div className="text-sm font-semibold text-foreground">{aiUsageLabel}</div>
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-background/50 overflow-hidden">
            <div className={`h-full ${aiBarClass}`} style={{ width: `${aiPercent}%` }} />
          </div>
          <div className={`mt-2 text-xs ${aiMessageClass}`}>{aiMessage}</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Triggers</span>
          <span className="text-base font-semibold text-foreground">{summaryStats.totalTriggered}</span>
        </div>
        <span className="h-4 w-px bg-border/70" />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Replies</span>
          <span className="text-base font-semibold text-foreground">{summaryStats.totalRepliesSent}</span>
        </div>
      </div>
    </div>

    {loading ? (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    ) : filteredAutomations.length === 0 ? (
      <div className="text-center py-12 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
        <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">No automations found</h3>
        <p className="text-muted-foreground mb-6">
          Try adjusting your filters or create a new automation to get started.
        </p>
        <Button onClick={onCreate} leftIcon={<Plus className="w-4 h-4" />}>
          Create Automation
        </Button>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredAutomations.map((automation) => {
          const template = automation.template;
          const version = automation.templateVersion;
          const triggers = version?.triggers || [];
          const primaryTriggerType = triggers[0]?.type;
          const trigger = primaryTriggerType ? TRIGGER_METADATA[primaryTriggerType] : null;
          const triggerLabel = triggers.length > 1
            ? 'Multiple triggers'
            : trigger?.label || 'Trigger';
          const triggerDescription = trigger?.description || 'Trigger configured in the template.';
          const badge = triggers.length > 1 ? null : trigger?.badge;
          const statusLabel = automation.isActive ? 'Active' : 'Inactive';

          return (
            <div
              key={automation._id}
              onClick={isOpenEnabled ? () => onOpen?.(automation) : undefined}
              onKeyDown={isOpenEnabled ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpen?.(automation);
                }
              } : undefined}
              role={isOpenEnabled ? 'button' : undefined}
              tabIndex={isOpenEnabled ? 0 : undefined}
              className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-background/70 p-5 shadow-sm transition-all duration-200 ${
                isOpenEnabled ? 'hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/30 cursor-pointer' : ''
              }`}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
              {badge && (
                <div className="absolute top-4 right-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                    badge === 'PRO' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'
                  }`}>
                    {badge}
                  </span>
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                  {trigger?.icon || <Target className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold truncate">{automation.name}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                      automation.isActive
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-slate-500/10 text-slate-500'
                    }`}>
                      {statusLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                    {automation.description || template?.description || triggerDescription}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                  {triggerLabel}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2.5 py-1">
                  Template - {template?.name || 'Template'}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  <span className="text-foreground font-semibold">{automation.stats.totalTriggered}</span> Triggered
                </span>
                <span>
                  <span className="text-foreground font-semibold">{automation.stats.totalRepliesSent}</span> Replies
                </span>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <Button
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(automation);
                  }}
                  variant={automation.isActive ? 'primary' : 'outline'}
                  className="rounded-full px-4"
                  size="sm"
                  leftIcon={automation.isActive ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                >
                  {automation.isActive ? 'Active' : 'Inactive'}
                </Button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit?.(automation);
                    }}
                    disabled={!isEditEnabled}
                    className="flex items-center gap-1 rounded-full border border-border bg-background/60 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(automation);
                    }}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </>
  );
};
