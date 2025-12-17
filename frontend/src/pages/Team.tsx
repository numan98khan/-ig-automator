import React from 'react';
import { Users, UserPlus, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

const Team: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="sticky top-16 md:top-20 z-10 bg-background/80 backdrop-blur-sm border border-border/60 rounded-2xl p-4 md:p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Users className="w-5 h-5" />
              Team
            </div>
            <h1 className="text-3xl font-bold">Manage members & roles</h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-2xl">
              Invite teammates, set their permissions, and keep human escalations routed to the right people.
            </p>
          </div>
          <Button leftIcon={<UserPlus className="w-4 h-4" />}>Invite teammate</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">Active members</h2>
                <p className="text-sm text-muted-foreground">Who can triage alerts and reply in the inbox.</p>
              </div>
              <Badge variant="secondary">Workspace</Badge>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/70">
                <div>
                  <p className="font-semibold">You</p>
                  <p className="text-sm text-muted-foreground">Owner · Full access</p>
                </div>
                <Button variant="ghost" size="sm">Manage</Button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/60">
                <div>
                  <p className="font-semibold">Add a teammate</p>
                  <p className="text-sm text-muted-foreground">Share inbox access and alert notifications.</p>
                </div>
                <Button variant="outline" size="sm">Invite</Button>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Roles & permissions</h3>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><span className="text-foreground font-semibold">Owner:</span> billing + workspace settings</li>
              <li><span className="text-foreground font-semibold">Manager:</span> manage categories, knowledge, and alerts</li>
              <li><span className="text-foreground font-semibold">Agent:</span> inbox, alerts, and sandbox access</li>
            </ul>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <h3 className="font-semibold mb-2">Alert routing</h3>
            <p className="text-sm text-muted-foreground">Choose who receives escalations and SLA risk notifications.</p>
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="outline" size="sm">Assign owner</Button>
              <Button variant="outline" size="sm">Assign backup</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Team;
