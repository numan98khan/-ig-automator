import React from 'react';
import { Target, PlayCircle, Clock, Link as LinkIcon, AlertTriangle, Sparkles, Building2 } from 'lucide-react';

type AutomationsSidebarProps = {
  activeSection: 'automations' | 'business-profile' | 'simulate' | 'alerts' | 'routing' | 'followups' | 'integrations';
  onChange: (
    section: 'automations' | 'business-profile' | 'simulate' | 'alerts' | 'routing' | 'followups' | 'integrations'
  ) => void;
};

export const AutomationsSidebar: React.FC<AutomationsSidebarProps> = ({ activeSection, onChange }) => (
  <aside className="lg:w-64 flex-shrink-0">
    {/* <div className="bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-xl p-2 space-y-1 shadow-sm backdrop-blur-sm"> */}
    <div className="bg-white/50 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-xl p-2 space-y-1 shadow-sm backdrop-blur-sm">
      <button
        onClick={() => onChange('automations')}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
          activeSection === 'automations'
            ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
        }`}
      >
        <Target className="w-4 h-4" />
        <span className="flex-1 text-sm font-medium">Automations</span>
      </button>
      <button
        onClick={() => onChange('business-profile')}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
          activeSection === 'business-profile'
            ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
        }`}
      >
        <Building2 className="w-4 h-4" />
        <span className="flex-1 text-sm font-medium">Business Profile</span>
      </button>
      <button
        onClick={() => onChange('simulate')}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
          activeSection === 'simulate'
            ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
        }`}
      >
        <Sparkles className="w-4 h-4" />
        <span className="flex-1 text-sm font-medium">Simulate</span>
      </button>
      <button
        onClick={() => onChange('alerts')}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
          activeSection === 'alerts'
            ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
        }`}
      >
        <AlertTriangle className="w-4 h-4" />
        <span className="flex-1 text-sm font-medium">Human Alerts</span>
      </button>
      <button
        onClick={() => onChange('routing')}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
          activeSection === 'routing'
            ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
        }`}
      >
        <PlayCircle className="w-4 h-4" />
        <span className="flex-1 text-sm font-medium">Routing & Handoffs</span>
      </button>
      <button
        onClick={() => onChange('followups')}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
          activeSection === 'followups'
            ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
        }`}
      >
        <Clock className="w-4 h-4" />
        <span className="flex-1 text-sm font-medium">Follow-ups</span>
      </button>
      <button
        onClick={() => onChange('integrations')}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
          activeSection === 'integrations'
            ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
        }`}
      >
        <LinkIcon className="w-4 h-4" />
        <span className="flex-1 text-sm font-medium">Integrations</span>
      </button>
    </div>
  </aside>
);
