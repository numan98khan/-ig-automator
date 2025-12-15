import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  settingsAPI,
  authAPI,
  workspaceAPI,
  workspaceInviteAPI,
  WorkspaceSettings,
  AutomationStats,
  WorkspaceMember,
  WorkspaceInvite,
} from '../services/api';
import {
  Shield,
  Users,
  Sliders,
  Eye,
  EyeOff,
  Mail,
  CheckCircle,
  Save,
  Globe,
  MessageSquare,
  MessageCircle,
  Clock,
  AlertCircle,
  Loader2,
  Zap,
  Info,
  UserPlus,
  Trash2,
  X
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';

type TabType = 'account' | 'team' | 'automations';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'Arabic' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
  { code: 'tr', name: 'Turkish' },
];

export default function Settings() {
  const { user, currentWorkspace, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [, setSettings] = useState<WorkspaceSettings | null>(null);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Account Security Form
  const [accountForm, setAccountForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    showPassword: false,
  });

  // Automation Settings Form
  const [formData, setFormData] = useState({
    defaultLanguage: 'en',
    defaultReplyLanguage: '',
    allowHashtags: false,
    allowEmojis: true,
    maxReplySentences: 3,
    decisionMode: 'assist' as 'full_auto' | 'assist' | 'info_only',
    escalationGuidelines: '',
    escalationExamples: '',
    humanEscalationBehavior: 'ai_silent' as 'ai_silent' | 'ai_allowed',
    humanHoldMinutes: 60,
    commentDmEnabled: false,
    commentDmTemplate: '',
    dmAutoReplyEnabled: false,
    followupEnabled: false,
    followupHoursBeforeExpiry: 2,
    followupTemplate: '',
  });

  // Team Management State
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'agent' as 'admin' | 'agent' | 'viewer',
  });

  useEffect(() => {
    // Auto-select account tab if user is provisional
    if (user?.isProvisional || !user?.emailVerified) {
      setActiveTab('account');
    }
  }, [user]);

  useEffect(() => {
    if (currentWorkspace && activeTab === 'automations') {
      loadSettings();
      loadStats();
    }
  }, [currentWorkspace, activeTab]);

  useEffect(() => {
    if (currentWorkspace && activeTab === 'team') {
      loadTeamData();
    }
  }, [currentWorkspace, activeTab]);

  const loadSettings = async () => {
    if (!currentWorkspace) return;

    setLoading(true);
    setError(null);

    try {
      const data = await settingsAPI.getByWorkspace(currentWorkspace._id);
      setSettings(data);
      setFormData({
        defaultLanguage: data.defaultLanguage || 'en',
        defaultReplyLanguage: data.defaultReplyLanguage || data.defaultLanguage || 'en',
        allowHashtags: data.allowHashtags ?? false,
        allowEmojis: data.allowEmojis ?? true,
        maxReplySentences: data.maxReplySentences ?? 3,
        decisionMode: data.decisionMode || 'assist',
        escalationGuidelines: data.escalationGuidelines || '',
        escalationExamples: (data.escalationExamples || []).join('\n'),
        humanEscalationBehavior: data.humanEscalationBehavior || 'ai_silent',
        humanHoldMinutes: data.humanHoldMinutes || 60,
        commentDmEnabled: data.commentDmEnabled || false,
        commentDmTemplate: data.commentDmTemplate || '',
        dmAutoReplyEnabled: data.dmAutoReplyEnabled || false,
        followupEnabled: data.followupEnabled || false,
        followupHoursBeforeExpiry: data.followupHoursBeforeExpiry || 2,
        followupTemplate: data.followupTemplate || '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!currentWorkspace) return;

    try {
      const data = await settingsAPI.getStats(currentWorkspace._id);
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const loadTeamData = async () => {
    if (!currentWorkspace) return;

    setTeamLoading(true);
    setError(null);

    try {
      const [membersData, invitesData] = await Promise.all([
        workspaceAPI.getMembers(currentWorkspace._id),
        workspaceInviteAPI.listInvites(currentWorkspace._id),
      ]);

      // Ensure we always have arrays
      setMembers(Array.isArray(membersData) ? membersData : []);
      setInvites(Array.isArray(invitesData) ? invitesData : []);
    } catch (err: any) {
      console.error('Load team data error:', err);
      setError(err.response?.data?.error || 'Failed to load team data');
      // Reset to empty arrays on error
      setMembers([]);
      setInvites([]);
    } finally {
      setTeamLoading(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace) return;

    setError(null);
    setSuccess(null);

    try {
      await workspaceInviteAPI.sendInvite(currentWorkspace._id, inviteForm.email, inviteForm.role);
      setSuccess(`Invitation sent to ${inviteForm.email}`);
      setInviteForm({ email: '', role: 'agent' });
      setTimeout(() => setSuccess(null), 3000);
      await loadTeamData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send invitation');
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) return;

    setError(null);

    try {
      await workspaceInviteAPI.cancelInvite(inviteId);
      setSuccess('Invitation cancelled');
      setTimeout(() => setSuccess(null), 3000);
      await loadTeamData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to cancel invitation');
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!currentWorkspace) return;

    setError(null);

    try {
      await workspaceAPI.updateMemberRole(currentWorkspace._id, userId, newRole);
      setSuccess('Member role updated');
      setTimeout(() => setSuccess(null), 3000);
      await loadTeamData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update member role');
    }
  };

  const handleRemoveMember = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to remove ${userEmail} from this workspace?`)) return;
    if (!currentWorkspace) return;

    setError(null);

    try {
      await workspaceAPI.removeMember(currentWorkspace._id, userId);
      setSuccess('Member removed');
      setTimeout(() => setSuccess(null), 3000);
      await loadTeamData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove member');
    }
  };

  const handleSecureAccount = async () => {
    setError(null);
    setSuccess(null);

    if (!accountForm.email || !accountForm.password) {
      setError('Email and password are required');
      return;
    }

    if (accountForm.password !== accountForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (accountForm.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSaving(true);

    try {
      await authAPI.secureAccount(accountForm.email, accountForm.password);
      setSuccess('Account secured! Please check your email to verify your address.');
      setAccountForm({ email: '', password: '', confirmPassword: '', showPassword: false });

      // Refresh user data
      await refreshUser();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to secure account');
    } finally {
      setSaving(false);
    }
  };

  const handleResendVerification = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await authAPI.resendVerification();
      setSuccess('Verification email sent! Please check your inbox.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send verification email');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAutomations = async () => {
    if (!currentWorkspace) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await settingsAPI.update(currentWorkspace._id, {
        defaultLanguage: formData.defaultLanguage,
        defaultReplyLanguage: formData.defaultReplyLanguage,
        allowHashtags: formData.allowHashtags,
        allowEmojis: formData.allowEmojis,
        maxReplySentences: formData.maxReplySentences,
        decisionMode: formData.decisionMode,
        escalationGuidelines: formData.escalationGuidelines,
        escalationExamples: formData.escalationExamples
          ? formData.escalationExamples.split('\n').map(line => line.trim()).filter(Boolean)
          : [],
        humanEscalationBehavior: formData.humanEscalationBehavior,
        humanHoldMinutes: Math.max(5, Math.min(720, formData.humanHoldMinutes || 60)),
        commentDmEnabled: formData.commentDmEnabled,
        commentDmTemplate: formData.commentDmTemplate,
        dmAutoReplyEnabled: formData.dmAutoReplyEnabled,
        followupEnabled: formData.followupEnabled,
        followupHoursBeforeExpiry: formData.followupHoursBeforeExpiry,
        followupTemplate: formData.followupTemplate,
      });
      setSettings(updated);
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (field: keyof typeof formData) => {
    setFormData(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const tabs = [
    {
      id: 'account' as TabType,
      label: 'Account Security',
      icon: Shield,
      badge: user?.isProvisional || !user?.emailVerified,
    },
    {
      id: 'team' as TabType,
      label: 'Team',
      icon: Users,
    },
    {
      id: 'automations' as TabType,
      label: 'Automations',
      icon: Sliders,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
          <p className="text-slate-400">Manage your workspace, team, and AI automation preferences.</p>
        </div>
        {activeTab === 'automations' && (
          <Button
            onClick={handleSaveAutomations}
            disabled={saving}
            isLoading={saving}
            leftIcon={!saving && <Save className="w-4 h-4" />}
          >
            Save Changes
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-8 border-b border-white/5 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all font-medium text-sm md:text-base whitespace-nowrap ${activeTab === tab.id
                  ? 'border-primary text-white bg-white/5 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5 rounded-t-lg'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.badge && (
                  <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 animate-fade-in">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1 font-medium text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3 text-green-400 animate-fade-in">
          <CheckCircle className="w-5 h-5" />
          <span className="flex-1 font-medium text-sm">{success}</span>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'account' && (
        <div className="space-y-6 animate-fade-in">
          {/* Account Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" /> Account Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                <span className="text-sm font-medium text-slate-300">Type</span>
                <Badge variant={user?.isProvisional ? 'warning' : 'success'}>
                  {user?.isProvisional ? 'Provisional' : 'Secured'}
                </Badge>
              </div>

              {user?.email && (
                <>
                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                    <span className="text-sm font-medium text-slate-300">Email</span>
                    <span className="text-sm text-slate-400">{user.email}</span>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                    <span className="text-sm font-medium text-slate-300">Verified</span>
                    <div className="flex items-center gap-3">
                      <Badge variant={user.emailVerified ? 'success' : 'warning'}>
                        {user.emailVerified ? 'Verified' : 'Unverified'}
                      </Badge>
                      {!user.emailVerified && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleResendVerification}
                          disabled={saving}
                          isLoading={saving}
                        >
                          Verify Now
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {user?.instagramUsername && (
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                  <span className="text-sm font-medium text-slate-300">Instagram</span>
                  <span className="text-sm text-slate-400">@{user.instagramUsername}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Secure Account Form */}
          {user?.isProvisional && !user?.email && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Mail className="w-5 h-5 text-accent" /> Secure Your Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-slate-400">
                  Add an email and password to secure your account and access all features.
                </p>
                <Input
                  label="Email Address"
                  type="email"
                  value={accountForm.email}
                  onChange={(e) => setAccountForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="your@email.com"
                />
                <div className="relative">
                  <Input
                    label="Password"
                    type={accountForm.showPassword ? 'text' : 'password'}
                    value={accountForm.password}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Min. 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setAccountForm(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                    className="absolute right-3 top-[34px] text-slate-500 hover:text-white transition"
                  >
                    {accountForm.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Input
                  label="Confirm Password"
                  type={accountForm.showPassword ? 'text' : 'password'}
                  value={accountForm.confirmPassword}
                  onChange={(e) => setAccountForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Confirm password"
                />
                <Button
                  className="w-full"
                  onClick={handleSecureAccount}
                  isLoading={saving}
                >
                  Secure Account
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-6 animate-fade-in">
          {/* Invite New Member */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" /> Invite Team Member
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Input
                      label="Email Address"
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="teammate@example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Role
                    </label>
                    <select
                      value={inviteForm.role}
                      onChange={(e) => setInviteForm(prev => ({ ...prev, role: e.target.value as any }))}
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="agent">Agent</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" className="w-full md:w-auto">
                  <Mail className="w-4 h-4 mr-2" />
                  Send Invitation
                </Button>
              </form>
            </CardContent>
          </Card>

          {teamLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Current Members */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" /> Team Members ({members.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {members.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-slate-400">No team members yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {members.map((member) => (
                        <div
                          key={member.user.id}
                          className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                                <Users className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium text-white">
                                  {member.user.email}
                                  {member.user.id === user?.id && (
                                    <span className="ml-2 text-xs text-slate-400">(You)</span>
                                  )}
                                </p>
                                <p className="text-sm text-slate-400">
                                  Joined {new Date(member.joinedAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {member.role === 'owner' ? (
                              <Badge variant="primary">Owner</Badge>
                            ) : (
                              <select
                                value={member.role}
                                onChange={(e) => handleUpdateRole(member.user.id, e.target.value)}
                                disabled={member.user.id === user?.id}
                                className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <option value="viewer">Viewer</option>
                                <option value="agent">Agent</option>
                                <option value="admin">Admin</option>
                              </select>
                            )}
                            {member.role !== 'owner' && member.user.id !== user?.id && (
                              <button
                                onClick={() => handleRemoveMember(member.user.id, member.user.email || 'this user')}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition"
                                title="Remove member"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pending Invitations */}
              {invites.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-primary" /> Pending Invitations ({invites.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {invites.map((invite) => (
                        <div
                          key={invite._id}
                          className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-white">{invite.email}</p>
                            <p className="text-sm text-slate-400">
                              Role: <span className="font-medium capitalize">{invite.role}</span> ·
                              Expires {new Date(invite.expiresAt).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleCancelInvite(invite._id)}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                            title="Cancel invitation"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Role Descriptions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="w-5 h-5 text-primary" /> Role Permissions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div className="p-3 bg-white/5 rounded-lg">
                      <p className="font-medium text-white mb-1">Owner</p>
                      <p className="text-slate-400">Full access to everything including billing and workspace deletion</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg">
                      <p className="font-medium text-white mb-1">Admin</p>
                      <p className="text-slate-400">Manage team members, settings, and all workspace features</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg">
                      <p className="font-medium text-white mb-1">Agent</p>
                      <p className="text-slate-400">Manage conversations, knowledge base, and categories</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg">
                      <p className="font-medium text-white mb-1">Viewer</p>
                      <p className="text-slate-400">Read-only access to conversations and reports</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {activeTab === 'automations' && (
        <div className="space-y-6 animate-fade-in">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Stats */}
              {stats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card variant="solid">
                    <CardContent className="p-6">
                      <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Comments Processed</div>
                      <div className="text-2xl font-bold text-white mt-1">{stats.commentDm.sent}</div>
                      {stats.commentDm.failed > 0 && <div className="text-xs text-red-400 mt-1">{stats.commentDm.failed} failed</div>}
                    </CardContent>
                  </Card>
                  <Card variant="solid">
                    <CardContent className="p-6">
                      <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Auto-Replies</div>
                      <div className="text-2xl font-bold text-white mt-1">{stats.autoReply.sent}</div>
                    </CardContent>
                  </Card>
                  <Card variant="solid">
                    <CardContent className="p-6">
                      <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Follow-ups</div>
                      <div className="text-2xl font-bold text-white mt-1">{stats.followup.sent}</div>
                      <div className="text-xs text-slate-500 mt-1">{stats.followup.pending} pending</div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* AI Reply Policy */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-accent" /> AI Control Center
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Decision Mode</label>
                      <select
                        value={formData.decisionMode}
                        onChange={(e) => setFormData(prev => ({ ...prev, decisionMode: e.target.value as any }))}
                        className="input-field w-full"
                      >
                        <option value="full_auto">Full Auto (AI Responds)</option>
                        <option value="assist">Assist (Drafts Only)</option>
                        <option value="info_only">Info Only</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                        <Info className="w-3 h-3" /> Controls how autonomously the AI acts.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Reply Length</label>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={formData.maxReplySentences}
                        onChange={(e) => setFormData(prev => ({ ...prev, maxReplySentences: parseInt(e.target.value) }))}
                        className="input-field w-full"
                      />
                      <p className="text-xs text-slate-500 mt-1.5">Max sentences per reply.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <Button
                      variant={formData.allowHashtags ? "primary" : "secondary"}
                      onClick={() => handleToggle('allowHashtags')}
                      size="sm"
                      className={!formData.allowHashtags ? "opacity-50" : ""}
                    >
                      Hashtags {formData.allowHashtags ? 'Allowed' : 'Blocked'}
                    </Button>
                    <Button
                      variant={formData.allowEmojis ? "primary" : "secondary"}
                      onClick={() => handleToggle('allowEmojis')}
                      size="sm"
                      className={!formData.allowEmojis ? "opacity-50" : ""}
                    >
                      Emojis {formData.allowEmojis ? 'Allowed' : 'Blocked'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Language */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-blue-400" /> Language
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Base Language</label>
                    <select
                      value={formData.defaultLanguage}
                      onChange={(e) => setFormData(prev => ({ ...prev, defaultLanguage: e.target.value }))}
                      className="input-field w-full"
                    >
                      {LANGUAGES.map(lang => (
                        <option key={lang.code} value={lang.code}>{lang.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Force Reply Language</label>
                    <select
                      value={formData.defaultReplyLanguage}
                      onChange={(e) => setFormData(prev => ({ ...prev, defaultReplyLanguage: e.target.value }))}
                      className="input-field w-full"
                    >
                      {LANGUAGES.map(lang => (
                        <option key={lang.code} value={lang.code}>{lang.name}</option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Automation Toggles */}
              <div className="grid grid-cols-1 gap-6">
                {/* Inbound DM */}
                <Card className={formData.dmAutoReplyEnabled ? 'border-primary/50 bg-primary/5' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-blue-400" /> Auto-Reply to DMs
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${formData.dmAutoReplyEnabled ? 'text-primary' : 'text-slate-500'}`}>
                          {formData.dmAutoReplyEnabled ? 'Active' : 'Disabled'}
                        </span>
                        <Button
                          size="sm"
                          variant={formData.dmAutoReplyEnabled ? "primary" : "outline"}
                          onClick={() => handleToggle('dmAutoReplyEnabled')}
                        >
                          {formData.dmAutoReplyEnabled ? 'Turn Off' : 'Turn On'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-400">
                      Automatically replying to incoming DMs using your Knowledge Base and Category instructions.
                    </p>
                  </CardContent>
                </Card>

                {/* Comment to DM */}
                <Card className={formData.commentDmEnabled ? 'border-primary/50 bg-primary/5' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-orange-400" /> Comment → DM
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${formData.commentDmEnabled ? 'text-primary' : 'text-slate-500'}`}>
                          {formData.commentDmEnabled ? 'Active' : 'Disabled'}
                        </span>
                        <Button
                          size="sm"
                          variant={formData.commentDmEnabled ? "primary" : "outline"}
                          onClick={() => handleToggle('commentDmEnabled')}
                        >
                          {formData.commentDmEnabled ? 'Turn Off' : 'Turn On'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-slate-400">
                      Send a DM when someone comments on your posts.
                    </p>
                    {formData.commentDmEnabled && (
                      <div className="space-y-2 animate-fade-in">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">DM Template</label>
                        <textarea
                          value={formData.commentDmTemplate}
                          onChange={(e) => setFormData(prev => ({ ...prev, commentDmTemplate: e.target.value }))}
                          className="input-field w-full min-h-[80px]"
                          placeholder="Hi! Thanks for your comment..."
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Follow Up */}
                <Card className={formData.followupEnabled ? 'border-primary/50 bg-primary/5' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-purple-400" /> 24h Follow-up
                      </CardTitle>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${formData.followupEnabled ? 'text-primary' : 'text-slate-500'}`}>
                          {formData.followupEnabled ? 'Active' : 'Disabled'}
                        </span>
                        <Button
                          size="sm"
                          variant={formData.followupEnabled ? "primary" : "outline"}
                          onClick={() => handleToggle('followupEnabled')}
                        >
                          {formData.followupEnabled ? 'Turn Off' : 'Turn On'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-slate-400">
                      Send a check-in message before the Instagram 24h window closes.
                    </p>
                    {formData.followupEnabled && (
                      <div className="space-y-4 animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Hours Before Expiry</label>
                            <input
                              type="number"
                              min={1}
                              max={23}
                              value={formData.followupHoursBeforeExpiry}
                              onChange={(e) => setFormData(prev => ({ ...prev, followupHoursBeforeExpiry: parseInt(e.target.value) }))}
                              className="input-field w-full"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Message Template</label>
                          <textarea
                            value={formData.followupTemplate}
                            onChange={(e) => setFormData(prev => ({ ...prev, followupTemplate: e.target.value }))}
                            className="input-field w-full min-h-[80px]"
                            placeholder="Just checking in before this chat closes..."
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
// Force rebuild
