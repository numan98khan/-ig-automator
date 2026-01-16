import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI, tierAPI, TierSummaryResponse, instagramAPI, InstagramAccount, settingsAPI, WorkspaceSettings } from '../services/api';
import { Shield, Eye, EyeOff, Mail, CheckCircle, AlertCircle, Users, Zap, Gauge, RefreshCw, Instagram, AlertTriangle } from 'lucide-react';
import { useDemoMode } from '../hooks/useDemoMode';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import Team from './Team';

type TabType = 'account' | 'plan' | 'team';

export default function Settings() {
  const { user, refreshUser, currentWorkspace, logout } = useAuth();
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings | null>(null);
  const { isDemoMode, enableDemoMode, disableDemoMode } = useDemoMode(workspaceSettings?.demoModeEnabled);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tierSummary, setTierSummary] = useState<TierSummaryResponse | null>(null);
  const [tierLoading, setTierLoading] = useState(false);
  const [instagramAccounts, setInstagramAccounts] = useState<InstagramAccount[]>([]);
  const [igLoading, setIgLoading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [demoModeUpdating, setDemoModeUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [accountForm, setAccountForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    showPassword: false,
  });

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'account') {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  }, [setSearchParams]);

  useEffect(() => {
    if (user?.isProvisional || !user?.emailVerified) {
      handleTabChange('account');
    }
  }, [handleTabChange, user]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'account' || tabParam === 'plan' || tabParam === 'team') {
      setActiveTab(tabParam as TabType);
    }
  }, [searchParams]);

  useEffect(() => {
    const loadTier = async () => {
      if (!user?.id) return;
      const workspaceId = currentWorkspace?._id || user.defaultWorkspaceId;
      setTierLoading(true);
      try {
        const data = await tierAPI.getMine(workspaceId || undefined);
        setTierSummary(data);
      } catch (err) {
        console.error('Failed to load tier info', err);
      } finally {
        setTierLoading(false);
      }
    };

    loadTier();
  }, [user, currentWorkspace]);

  useEffect(() => {
    const loadWorkspaceSettings = async () => {
      if (!currentWorkspace?._id) return;
      try {
        const data = await settingsAPI.getByWorkspace(currentWorkspace._id);
        setWorkspaceSettings(data);
      } catch (err) {
        console.error('Failed to load workspace settings', err);
      }
    };

    loadWorkspaceSettings();
  }, [currentWorkspace]);

  useEffect(() => {
    const loadInstagramAccounts = async () => {
      if (!currentWorkspace?._id) return;
      setIgLoading(true);
      try {
        const accounts = await instagramAPI.getByWorkspace(currentWorkspace._id);
        setInstagramAccounts(accounts);
      } catch (err) {
        console.error('Failed to load Instagram accounts', err);
      } finally {
        setIgLoading(false);
      }
    };

    loadInstagramAccounts();
  }, [currentWorkspace]);

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

  const handleInstagramAuth = async (options?: { reconnect?: boolean }) => {
    if (!currentWorkspace?._id) return;
    const isReconnect = options?.reconnect === true;

    setReconnecting(true);
    setError(null);

    try {
      const igLimit = combinedLimits.instagramAccounts;
      const igUsed = workspaceUsage.instagramAccounts ?? 0;
      if (!isReconnect && typeof igLimit === 'number' && igUsed >= igLimit) {
        setError(`Instagram account limit reached (${igUsed}/${igLimit}). Upgrade the owner's tier to connect another account.`);
        setReconnecting(false);
        return;
      }

      const { authUrl } = await instagramAPI.getAuthUrl(currentWorkspace._id, { reconnect: isReconnect });
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate Instagram reconnection');
      setReconnecting(false);
    }
  };

  const handleDemoModeUpdate = async (nextValue: boolean) => {
    if (!currentWorkspace?._id || nextValue === isDemoMode) return;
    const previousValue = isDemoMode;
    nextValue ? enableDemoMode() : disableDemoMode();
    setDemoModeUpdating(true);
    try {
      const updated = await settingsAPI.update(currentWorkspace._id, { demoModeEnabled: nextValue });
      setWorkspaceSettings(updated);
    } catch (err) {
      console.error('Failed to update demo mode', err);
      previousValue ? enableDemoMode() : disableDemoMode();
    } finally {
      setDemoModeUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    setError(null);
    setSuccess(null);

    const confirmed = window.confirm(
      'This will permanently delete your account and all workspace data (conversations, messages, automations, analytics, and connected accounts). This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    try {
      await authAPI.deleteAccount();
      logout();
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  const tabs = [
    {
      id: 'account' as TabType,
      label: 'Account Security',
      icon: Shield,
      badge: user?.isProvisional || !user?.emailVerified,
    },
    {
      id: 'plan' as TabType,
      label: 'Plan & Limits',
      icon: Zap,
    },
    {
      id: 'team' as TabType,
      label: 'Team & Access',
      icon: Users,
    },
  ];

  const infoTileClass = 'flex items-center justify-between p-4 rounded-xl border border-border/70 dark:border-white/10 bg-muted/60 dark:bg-white/5 backdrop-blur-sm';
  const infoLabelClass = 'text-sm font-medium text-foreground';
  const infoValueClass = 'text-sm text-muted-foreground';
  const limitValue = (value?: number) => (typeof value === 'number' ? value : '∞');
  const usagePill = (used?: number, limit?: number) => `${used ?? 0} / ${limitValue(limit)}`;

  const workspaceUsage = tierSummary?.workspace?.usage || {};
  const workspaceLimits = tierSummary?.workspace?.limits || {};
  const workspaceTierLimits = tierSummary?.workspace?.tier?.limits || {};
  const baseLimits = tierSummary?.limits || {};
  const combinedLimits = {
    ...workspaceTierLimits,
    ...baseLimits,
    ...workspaceLimits,
  };
  const aiUsage = tierSummary?.usage?.aiMessages;

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your workspace security, plan, and team access.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="flex items-center gap-2 px-3 py-1">
            <Zap className="w-4 h-4 text-primary" />
            {tierSummary?.tier?.name ? `${tierSummary.tier.name} plan` : 'Plan'}
            {tierLoading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-64 flex-shrink-0">
          <div className="bg-white/50 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-xl p-2 space-y-1 shadow-sm backdrop-blur-sm">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${isActive
                    ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-sm font-medium">{tab.label}</span>
                  {tab.badge && (
                    <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 animate-fade-in">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 font-medium text-sm">{error}</span>
            </div>
          )}

        {success && (
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3 text-green-400 animate-fade-in">
            <CheckCircle className="w-5 h-5" />
            <span className="flex-1 font-medium text-sm">{success}</span>
          </div>
        )}

          {activeTab === 'account' && (
            <div className="space-y-6 animate-fade-in">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" /> Account Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className={infoTileClass}>
                    <span className={infoLabelClass}>Type</span>
                    <Badge variant={user?.isProvisional ? 'warning' : 'success'}>
                      {user?.isProvisional ? 'Provisional' : 'Secured'}
                    </Badge>
                  </div>

                  {user?.email && (
                    <>
                      <div className={infoTileClass}>
                        <span className={infoLabelClass}>Email</span>
                        <span className={infoValueClass}>{user.email}</span>
                      </div>

                      <div className={infoTileClass}>
                        <span className={infoLabelClass}>Verified</span>
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
                    <div className={infoTileClass}>
                      <span className={infoLabelClass}>Instagram</span>
                      <span className={infoValueClass}>@{user.instagramUsername}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="w-5 h-5 text-primary" /> Workspace Mode
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className={infoTileClass}>
                    <span className={infoLabelClass}>Mode</span>
                    <Badge variant={isDemoMode ? 'warning' : 'success'}>
                      {isDemoMode ? 'Demo' : 'Live'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Demo mode uses simulated data and never sends Instagram messages. Switch to live mode when you are ready.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={isDemoMode ? 'secondary' : 'outline'}
                      onClick={() => handleDemoModeUpdate(!isDemoMode)}
                      isLoading={demoModeUpdating}
                    >
                      {isDemoMode ? 'Switch to live mode' : 'Enable demo mode'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {user?.isProvisional && !user?.email && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="w-5 h-5 text-accent" /> Secure Your Account
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
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
                        className="absolute right-3 top-[34px] text-muted-foreground hover:text-foreground transition"
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

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Instagram className="w-5 h-5 text-primary" /> Connected Accounts
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {igLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : instagramAccounts.length === 0 ? (
                    <div className="text-center py-8">
                      <Instagram className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                      <p className="text-sm text-muted-foreground mb-4">No Instagram accounts connected</p>
                      <Button
                        onClick={() => handleInstagramAuth()}
                        isLoading={reconnecting}
                        variant="secondary"
                        size="sm"
                      >
                        Connect Instagram
                      </Button>
                    </div>
                  ) : (
                    instagramAccounts.map((account) => {
                      const isExpired = account.tokenExpiresAt
                        ? new Date(account.tokenExpiresAt) < new Date()
                        : false;
                      const expiresIn = account.tokenExpiresAt
                        ? Math.floor((new Date(account.tokenExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null;

                      return (
                        <div key={account._id} className={infoTileClass}>
                          <div className="flex items-center gap-3 flex-1">
                            {account.profilePictureUrl ? (
                              <img
                                src={account.profilePictureUrl}
                                alt={account.username}
                                className="w-10 h-10 rounded-full"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Instagram className="w-5 h-5 text-primary" />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="font-medium text-foreground">@{account.username}</div>
                              <div className="text-xs text-muted-foreground">
                                {account.status === 'connected' ? (
                                  isExpired ? (
                                    <span className="text-red-400">Token expired</span>
                                  ) : expiresIn !== null ? (
                                    expiresIn < 7 ? (
                                      <span className="text-amber-400">Expires in {expiresIn} days</span>
                                    ) : (
                                      <span className="text-green-400">Connected • Expires in {expiresIn} days</span>
                                    )
                                  ) : (
                                    <span className="text-green-400">Connected</span>
                                  )
                                ) : (
                                  <span className="text-muted-foreground">Mock account</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {account.status === 'connected' && (isExpired || (expiresIn !== null && expiresIn < 7)) && (
                            <Button
                              onClick={() => handleInstagramAuth({ reconnect: true })}
                              isLoading={reconnecting}
                              variant={isExpired ? 'primary' : 'secondary'}
                              size="sm"
                            >
                              {isExpired ? 'Reconnect' : 'Refresh Token'}
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}
                  {instagramAccounts.length > 0 && (
                    <div className="pt-2 border-t border-border/50">
                      <Button
                        onClick={() => handleInstagramAuth()}
                        isLoading={reconnecting}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        <Instagram className="w-4 h-4 mr-2" />
                        Add Another Account
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-red-500/40 bg-red-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-500">
                    <AlertTriangle className="w-5 h-5" /> Danger Zone
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Delete your account and all associated data, including Instagram connections, conversations, messages,
                    automations, and analytics. This action cannot be undone.
                  </p>
                  <Button
                    variant="danger"
                    onClick={handleDeleteAccount}
                    isLoading={deleting}
                    disabled={deleting}
                  >
                    Delete Account
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === 'plan' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="col-span-1">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Zap className="w-4 h-4 text-primary" />
                      Plan & Limits
                    </CardTitle>
                    <Badge variant="secondary">{tierSummary?.tier?.status || 'active'}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">Plan</div>
                      <div className="text-sm font-semibold text-foreground">
                        {tierSummary?.tier?.name || 'Not assigned'}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">AI messages</div>
                      <div className="text-sm font-semibold">{usagePill(aiUsage?.used, aiUsage?.limit ?? combinedLimits.aiMessages)}</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <UsageStat label="Instagram" value={usagePill(workspaceUsage.instagramAccounts, combinedLimits.instagramAccounts)} />
                      <UsageStat label="Team" value={usagePill(workspaceUsage.teamMembers, combinedLimits.teamMembers)} />
                      <UsageStat label="Knowledge" value={usagePill(workspaceUsage.knowledgeItems, combinedLimits.knowledgeItems)} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Gauge className="w-4 h-4" />
                      Limits refresh every billing period; upgrade the owner’s tier to increase caps.
                      {tierLoading && <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="space-y-6 animate-fade-in">
              <Team />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}
