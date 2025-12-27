import React from 'react';
import { Plus, Loader2, Target, Trash2, Power, PowerOff } from 'lucide-react';
import { Automation } from '../../services/api';
import { Button } from '../../components/ui/Button';
import {
  TRIGGER_METADATA,
  GOAL_OPTIONS,
  AUTOMATION_TEMPLATES,
} from './constants';

type AutomationsListViewProps = {
  automations: Automation[];
  loading: boolean;
  onCreate: () => void;
  onOpen?: (automation: Automation) => void;
  onToggle: (automation: Automation) => void;
  onDelete: (automation: Automation) => void;
};

export const AutomationsListView: React.FC<AutomationsListViewProps> = ({
  automations,
  loading,
  onCreate,
  onOpen,
  onToggle,
  onDelete,
}) => {
  const isOpenEnabled = typeof onOpen === 'function';

  return (
    <>
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold">Available Automations</h2>
      <Button onClick={onCreate} leftIcon={<Plus className="w-4 h-4" />}>
        Create Automation
      </Button>
    </div>

    {loading ? (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    ) : automations.length === 0 ? (
      <div className="text-center py-12 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
        <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-2">No automations yet</h3>
        <p className="text-muted-foreground mb-6">
          Create your first automation to start automating your Instagram conversations.
        </p>
        <Button onClick={onCreate} leftIcon={<Plus className="w-4 h-4" />}>
          Create Automation
        </Button>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {automations.map((automation) => {
          const trigger = TRIGGER_METADATA[automation.triggerType];
          const replyStep = automation.replySteps[0];

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
              className={`bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-xl p-6 shadow-sm backdrop-blur-sm transition-all relative group ${
                isOpenEnabled ? 'hover:shadow-lg cursor-pointer' : ''
              }`}
            >
              {trigger.badge && (
                <div className="absolute top-4 right-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                    trigger.badge === 'PRO' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'
                  }`}>
                    {trigger.badge}
                  </span>
                </div>
              )}

              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                  {trigger.icon}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{automation.name}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {automation.description || trigger.description}
                  </p>
                </div>
              </div>

              <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                <div className="text-xs font-medium text-muted-foreground mb-1">TRIGGER</div>
                <div className="text-sm font-medium">{trigger.label}</div>
              </div>

              <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                <div className="text-xs font-medium text-muted-foreground mb-1">REPLY</div>
                <div className="text-sm font-medium">
                  {replyStep.type === 'constant_reply' ? (
                    <span>Constant Reply</span>
                  ) : replyStep.type === 'ai_reply' ? (
                    <span>AI Reply - {GOAL_OPTIONS.find(g => g.value === replyStep.aiReply?.goalType)?.label}</span>
                  ) : (
                    <span>
                      Template - {AUTOMATION_TEMPLATES.find(t => t.id === replyStep.templateFlow?.templateId)?.name || 'Template'}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Triggered</div>
                  <div className="font-semibold">{automation.stats.totalTriggered}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Replies Sent</div>
                  <div className="font-semibold">{automation.stats.totalRepliesSent}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
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
