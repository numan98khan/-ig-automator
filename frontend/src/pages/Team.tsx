import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, ShieldCheck, Mail, Loader2, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WorkspaceInvite, WorkspaceMember, workspaceAPI, workspaceInviteAPI, tierAPI, WorkspaceTierResponse } from '../services/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

type Role = WorkspaceMember['role'];

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Manager',
  agent: 'Agent',
  viewer: 'Viewer',
};
const EDITABLE_ROLES: Role[] = ['admin', 'agent', 'viewer'];

const Team: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState<{ email: string; role: Role }>({ email: '', role: 'agent' });
  const [tierSummary, setTierSummary] = useState<WorkspaceTierResponse | null>(null);
  const [tierLoading, setTierLoading] = useState(false);
  const displayLimit = (value?: number | null) => (typeof value === 'number' ? value : '∞');

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.role.localeCompare(b.role)),
    [members],
  );

  const loadTeam = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      const [memberData, inviteData] = await Promise.all([
        workspaceAPI.getMembers(currentWorkspace._id),
        workspaceInviteAPI.listInvites(currentWorkspace._id),
      ]);
      setMembers(Array.isArray(memberData) ? memberData : []);
      setInvites(Array.isArray(inviteData) ? inviteData : []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load team');
      setMembers([]);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTierLimits = async () => {
    if (!currentWorkspace) return;
    setTierLoading(true);
    try {
      const data = await tierAPI.getWorkspace(currentWorkspace._id);
      setTierSummary(data);
    } catch (err: any) {
      console.error('Failed to load tier limits', err);
    } finally {
      setTierLoading(false);
    }
  };

  useEffect(() => {
    loadTeam();
    loadTierLimits();
  }, [currentWorkspace]);

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentWorkspace || !inviteForm.email.trim()) return;
    if (isTeamLimitReached) {
      setError('Team member limit reached for your workspace tier.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await workspaceInviteAPI.sendInvite(currentWorkspace._id, inviteForm.email.trim(), inviteForm.role);
      setSuccess(`Invitation sent to ${inviteForm.email.trim()}`);
      setInviteForm({ email: '', role: 'agent' });
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send invite');
    } finally {
      setSaving(false);
    }
  };

  const firstNumber = (...values: Array<number | undefined | null>) => {
    for (const val of values) {
      if (typeof val === 'number') return val;
    }
    return undefined;
  };

  const teamLimit = firstNumber(
    tierSummary?.limits?.teamMembers,
    tierSummary?.tier?.limits?.teamMembers,
  );
  const effectiveTeamLimit = teamLimit;
  const teamUsed = tierSummary?.usage?.teamMembers ?? 0;
  const isTeamLimitReached = typeof effectiveTeamLimit === 'number' ? teamUsed >= effectiveTeamLimit : false;

  const handleCancelInvite = async (inviteId: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await workspaceInviteAPI.cancelInvite(inviteId);
      setSuccess('Invite revoked');
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to revoke invite');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (userId: string, role: Role) => {
    if (!currentWorkspace) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await workspaceAPI.updateMemberRole(currentWorkspace._id, userId, role);
      setSuccess('Role updated');
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!currentWorkspace) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await workspaceAPI.removeMember(currentWorkspace._id, userId);
      setSuccess('Member removed');
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove member');
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async (invite: WorkspaceInvite) => {
    if (!currentWorkspace) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await workspaceInviteAPI.sendInvite(currentWorkspace._id, invite.email, invite.role);
      setSuccess(`Resent invite to ${invite.email}`);
      await loadTeam();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resend invite');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel/60 rounded-2xl p-4 md:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Users className="w-5 h-5" />
              Team
            </div>
            <h1 className="text-2xl md:text-3xl font-bold">Manage members & roles</h1>
            <p className="text-muted-foreground mt-2 text-sm max-w-2xl">
              Invite teammates, set their permissions, and keep human escalations routed to the right people.
            </p>
            {tierSummary?.tier?.name && (
              <div className="mt-3 inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border bg-muted/50">
                <span className="font-semibold text-foreground">{tierSummary.tier.name}</span>
                <span className="text-muted-foreground">plan • Team limit {displayLimit(effectiveTeamLimit)}</span>
                {tierLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>
            )}
          </div>
          <Button leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => document.getElementById('invite-email')?.focus()}>
            Invite teammate
          </Button>
        </div>
        {(error || success) && (
          <div className={`mt-4 rounded-lg border p-3 text-sm ${error ? 'border-rose-400/50 text-rose-500' : 'border-emerald-400/50 text-emerald-500'}`}>
            {error || success}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-panel rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Active members</h2>
                <p className="text-sm text-muted-foreground">Who can triage alerts and reply in the inbox.</p>
              </div>
              <Badge variant="secondary">Workspace</Badge>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading members…</div>
            ) : (
              <div className="space-y-3">
                {sortedMembers.map((member) => (
                  <div key={member.user.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border/70">
                    <div>
                      <p className="font-semibold">{member.user.email || member.user.instagramUsername || 'Member'}</p>
                      <p className="text-sm text-muted-foreground">Joined {new Date(member.joinedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const isOwner = member.role === 'owner';
                        const options = isOwner ? ['owner'] : EDITABLE_ROLES;
                        return (
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.user.id, e.target.value as Role)}
                            className={`bg-background border border-border rounded-lg text-sm px-2 py-1 ${isOwner ? 'opacity-60 cursor-not-allowed' : ''}`}
                            disabled={saving || isOwner}
                          >
                            {options.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABELS[role as Role]}
                              </option>
                            ))}
                          </select>
                        );
                      })()}
                      {member.role !== 'owner' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.user.id)}
                          disabled={saving}
                          leftIcon={<Trash2 className="w-4 h-4" />}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {sortedMembers.length === 0 && (
                  <p className="text-sm text-muted-foreground">No members found.</p>
                )}
              </div>
            )}
          </div>

          <div className="glass-panel rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Roles & permissions</h3>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><span className="text-foreground font-semibold">Owner:</span> billing + full workspace access</li>
              <li><span className="text-foreground font-semibold">Manager:</span> full workspace access (except billing)</li>
              <li><span className="text-foreground font-semibold">Agent:</span> inbox + alerts access</li>
              <li><span className="text-foreground font-semibold">Viewer:</span> read-only analytics</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={handleInvite} className="glass-panel rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="w-4 h-4" />
              Invite teammates
            </div>
            {isTeamLimitReached && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-400/40 bg-amber-500/10 text-amber-600 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>
                  Team member limit reached ({teamUsed}/{displayLimit(effectiveTeamLimit)}). Upgrade the owner&apos;s tier to invite more teammates.
                </span>
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground" htmlFor="invite-email">Email</label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full mt-1 bg-background border border-input rounded-lg px-3 py-2 text-sm"
                  placeholder="teammate@company.com"
                  required
                  disabled={isTeamLimitReached}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground" htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as Role })}
                  className="w-full mt-1 bg-background border border-input rounded-lg px-3 py-2 text-sm"
                  disabled={isTeamLimitReached}
                >
                  {EDITABLE_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role as Role]}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full" isLoading={saving} leftIcon={<UserPlus className="w-4 h-4" />} disabled={isTeamLimitReached}>
                {isTeamLimitReached ? 'Limit reached' : 'Send invite'}
              </Button>
            </div>
          </form>

          <div className="glass-panel rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Pending invites</h3>
              <Badge variant="secondary">{invites.length}</Badge>
            </div>
            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invites.</p>
            ) : (
              <div className="space-y-2">
                {invites.map((invite) => (
                  <div key={invite._id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl bg-muted/30 border border-border/70">
                    <div>
                      <p className="font-semibold">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_LABELS[invite.role]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<RotateCcw className="w-4 h-4" />}
                        onClick={() => handleResend(invite)}
                        disabled={saving}
                      >
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 className="w-4 h-4" />}
                        onClick={() => handleCancelInvite(invite._id)}
                        disabled={saving}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Team;
