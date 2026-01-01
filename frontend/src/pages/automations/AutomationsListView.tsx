import React, { useMemo, useState } from 'react';
import { Copy, Eye, Pencil, Plus, Loader2, Target, Trash2, Power, PowerOff } from 'lucide-react';
import { AutomationInstance } from '../../services/api';
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
  onCreate: () => void;
  onOpen?: (automation: AutomationInstance) => void;
  onToggle: (automation: AutomationInstance) => void;
  onDuplicate: (automation: AutomationInstance) => void;
  onDelete: (automation: AutomationInstance) => void;
};

export const AutomationsListView: React.FC<AutomationsListViewProps> = ({
  automations,
  summaryStats,
  loading,
  onCreate,
  onOpen,
  onToggle,
  onDuplicate,
  onDelete,
}) => {
  const isOpenEnabled = typeof onOpen === 'function';
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

  return (
    <>
    <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Automations</h2>
          <p className="text-sm text-muted-foreground">
            Design, activate, and monitor your automated Instagram journeys.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-1 py-1">
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Active</div>
          <div className="text-2xl font-semibold">{summaryStats.activeCount}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
          <div className="text-2xl font-semibold">{summaryStats.totalCount}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Triggers</div>
          <div className="text-2xl font-semibold">{summaryStats.totalTriggered}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Replies</div>
          <div className="text-2xl font-semibold">{summaryStats.totalRepliesSent}</div>
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
              className={`group relative glass-panel border border-border rounded-xl p-5 transition-all duration-200 ${
                // isOpenEnabled ? 'hover:bg-muted/50 hover:shadow-md cursor-pointer' : ''
                    isOpenEnabled ? 'hover:bg-muted/50 hover:shadow-md cursor-pointer' : ''
              }`}
            >
              {badge && (
                <div className="absolute top-4 right-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                    badge === 'PRO' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'
                  }`}>
                    {badge}
                  </span>
                </div>
              )}

              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                  {trigger?.icon || <Target className="w-5 h-5" />}
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg">{automation.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      automation.isActive
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : 'bg-slate-500/10 text-slate-500'
                    }`}>
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {automation.description || template?.description || triggerDescription}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Trigger
                  </span>
                  <div className="mt-2 text-sm font-medium">{triggerLabel}</div>
                </div>
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                  <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    Reply
                  </span>
                  <div className="mt-2 text-sm font-medium">
                    <span>Template - {template?.name || 'Template'}</span>
                  </div>
                </div>
              </div>

              <div className="my-4 border-t border-border/60 pt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Triggered</div>
                  <div className="font-semibold">{automation.stats.totalTriggered}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Replies Sent</div>
                  <div className="font-semibold">{automation.stats.totalRepliesSent}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(automation);
                  }}
                  variant={automation.isActive ? 'primary' : 'outline'}
                  className="flex-1"
                  size="sm"
                  leftIcon={automation.isActive ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                >
                  {automation.isActive ? 'Active' : 'Inactive'}
                </Button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen?.(automation);
                  }}
                  className="flex items-center gap-1 rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Eye className="h-4 w-4" />
                  View
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen?.(automation);
                  }}
                  className="flex items-center gap-1 rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onDuplicate(automation);
                  }}
                  className="flex items-center gap-1 rounded-md border border-border bg-background/60 px-2.5 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                  Duplicate
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(automation);
                  }}
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
  </>
  );
};
