import React, { useEffect, useMemo, useState } from 'react';
import { Users, UserPlus, ShieldCheck, Mail, Loader2, Trash2, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { WorkspaceInvite, WorkspaceMember, workspaceAPI, workspaceInviteAPI } from '../services/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

type Role = WorkspaceMember['role'];

const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Manager',
  agent: 'Agent',
  viewer: 'Viewer',
};

const Team: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState<{ email: string; role: Role }>({ email: '', role: 'agent' });

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

  useEffect(() => {
    loadTeam();
  }, [currentWorkspace]);

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentWorkspace || !inviteForm.email.trim()) return;

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
      <div className="bg-background/80 backdrop-blur-sm border border-border/60 rounded-2xl p-4 md:p-6 shadow-sm">
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
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-4">
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
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.user.id, e.target.value as Role)}
                        className="bg-background border border-border rounded-lg text-sm px-2 py-1"
                        disabled={saving}
                      >
                        {Object.keys(ROLE_LABELS).map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role as Role]}
                          </option>
                        ))}
                      </select>
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

          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Roles & permissions</h3>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><span className="text-foreground font-semibold">Owner:</span> billing + workspace settings</li>
              <li><span className="text-foreground font-semibold">Manager:</span> manage categories, knowledge, and alerts</li>
              <li><span className="text-foreground font-semibold">Agent:</span> inbox, alerts, and sandbox access</li>
              <li><span className="text-foreground font-semibold">Viewer:</span> read-only analytics</li>
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={handleInvite} className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="w-4 h-4" />
              Invite teammates
            </div>
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
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground" htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as Role })}
                  className="w-full mt-1 bg-background border border-input rounded-lg px-3 py-2 text-sm"
                >
                  {Object.keys(ROLE_LABELS).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role as Role]}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full" isLoading={saving} leftIcon={<UserPlus className="w-4 h-4" />}>
                Send invite
              </Button>
            </div>
          </form>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-3">
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
