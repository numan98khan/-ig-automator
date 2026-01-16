import React from 'react';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AutomationInstance } from '../../services/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader } from '../../components/ui/Card';

type AutomationDetailsViewProps = {
  automation: AutomationInstance;
  onBack: () => void;
  onEdit: (automation: AutomationInstance) => void;
  embedded?: boolean;
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

export const AutomationDetailsView: React.FC<AutomationDetailsViewProps> = ({
  automation,
  onBack,
  onEdit,
  embedded = false,
}) => {
  const navigate = useNavigate();
  const template = automation.template;
  const isArchived = template?.status === 'archived';
  const statusLabel = isArchived ? 'Archived' : automation.isActive ? 'Active' : 'Inactive';
  const statusVariant = isArchived ? 'warning' : automation.isActive ? 'success' : 'neutral';

  return (
    <div className="h-full flex flex-col min-h-0 gap-6">
      {!embedded ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <button onClick={onBack} className="hover:text-foreground transition-colors">
              Automations
            </button>
            <ArrowRight className="w-4 h-4" />
            <span className="font-medium text-foreground">{automation.name}</span>
            <ArrowRight className="w-4 h-4" />
            <span className="font-medium text-foreground">Details</span>
            <Badge variant={statusVariant} className="ml-1">
              {statusLabel}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              className="w-full sm:w-auto hidden sm:inline-flex"
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(automation)}
              className="w-full sm:w-auto hidden sm:inline-flex"
            >
              Edit Automation
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{automation.name}</span>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card className="border border-border/60">
          <CardHeader className="border-b border-border/60">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-foreground">Automation Overview</h2>
              <p className="text-sm text-muted-foreground">
                This automation is configured from the template below and can be edited any time.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Description</span>
              <p className="text-sm text-foreground">
                {automation.description || template?.description || 'No description provided.'}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Template</span>
                <p className="text-sm text-foreground">{template?.name || 'Template'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Template Status</span>
                <p className="text-sm text-foreground capitalize">{template?.status || 'Unknown'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Created</span>
                <p className="text-sm text-foreground">{formatDateTime(automation.createdAt)}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Last Updated</span>
                <p className="text-sm text-foreground">{formatDateTime(automation.updatedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="border border-border/60">
            <CardHeader className="border-b border-border/60">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Performance</h3>
            </CardHeader>
            <CardContent className="grid gap-4 pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total triggered</span>
                <span className="text-lg font-semibold text-foreground">{automation.stats.totalTriggered}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Replies sent</span>
                <span className="text-lg font-semibold text-foreground">{automation.stats.totalRepliesSent}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/60">
            <CardHeader className="border-b border-border/60">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Simulation</h3>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm text-muted-foreground">
                Simulations now live in the dedicated Simulate panel so there is one place to test automations.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate('/app/automations?section=simulate')}
                leftIcon={<Sparkles className="w-4 h-4" />}
              >
                Open Simulate Panel
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
