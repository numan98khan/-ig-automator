import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import { Shield, Eye, EyeOff, Mail, CheckCircle, AlertCircle, Users } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import Team from './Team';

type TabType = 'account' | 'team';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    if (tabParam === 'account' || tabParam === 'team') {
      setActiveTab(tabParam as TabType);
    }
  }, [searchParams]);

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

  const tabs = [
    {
      id: 'account' as TabType,
      label: 'Account Security',
      icon: Shield,
      badge: user?.isProvisional || !user?.emailVerified,
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

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your workspace security and team access.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-64 flex-shrink-0">
          <div className="bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-xl p-2 space-y-1 shadow-sm backdrop-blur-sm">
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
