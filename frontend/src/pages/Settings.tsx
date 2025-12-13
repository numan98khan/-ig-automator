import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  settingsAPI,
  authAPI,
  WorkspaceSettings,
  AutomationStats,
} from '../services/api';
import {
  Settings as SettingsIcon,
  Shield,
  Users,
  Sliders,
  Eye,
  EyeOff,
  Mail,
  CheckCircle,
  RefreshCw,
  Save,
  Globe,
  MessageSquare,
  MessageCircle,
  Clock,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
} from 'lucide-react';

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
    <div className="max-w-6xl mx-auto p-3 md:p-6">
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 md:w-6 md:h-6" />
          Settings
        </h1>
        <p className="text-sm md:text-base text-gray-600 mt-1">
          Manage your account, team, and automation settings.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition font-medium text-sm md:text-base whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.badge && (
                  <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          {/* Account Status */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-600" />
              Account Status
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">Account Type</span>
                <span className={`text-sm px-3 py-1 rounded-full ${
                  user?.isProvisional
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {user?.isProvisional ? 'Provisional (Instagram Only)' : 'Secured'}
                </span>
              </div>

              {user?.email && (
                <>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">Email</span>
                    <span className="text-sm text-gray-600">{user.email}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">Email Verification</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm px-3 py-1 rounded-full ${
                        user.emailVerified
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {user.emailVerified ? 'Verified' : 'Not Verified'}
                      </span>
                      {!user.emailVerified && (
                        <button
                          onClick={handleResendVerification}
                          disabled={saving}
                          className="text-xs px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                        >
                          {saving ? 'Sending...' : 'Resend Email'}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {user?.instagramUsername && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">Instagram</span>
                  <span className="text-sm text-gray-600">@{user.instagramUsername}</span>
                </div>
              )}
            </div>
          </div>

          {/* Secure Account Form (for provisional users) */}
          {user?.isProvisional && !user?.email && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5 text-purple-600" />
                Secure Your Account
              </h2>

              <p className="text-sm text-gray-600 mb-6">
                Add an email and password to secure your account, manage multiple Instagram accounts, and invite team members.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={accountForm.email}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={accountForm.showPassword ? 'text' : 'password'}
                      value={accountForm.password}
                      onChange={(e) => setAccountForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent pr-10"
                      placeholder="Min. 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setAccountForm(prev => ({ ...prev, showPassword: !prev.showPassword }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {accountForm.showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    type={accountForm.showPassword ? 'text' : 'password'}
                    value={accountForm.confirmPassword}
                    onChange={(e) => setAccountForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="Confirm password"
                  />
                </div>

                <button
                  onClick={handleSecureAccount}
                  disabled={saving}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Securing Account...' : 'Secure Account'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-600" />
              Team Management
            </h2>

            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-2">Team management coming soon!</p>
              <p className="text-sm text-gray-500">
                Invite team members to collaborate on your workspace.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'automations' && (
        <div className="space-y-6">
          {/* Stats Overview */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg border p-4">
                <div className="text-sm text-gray-500">Comment DMs Sent</div>
                <div className="text-2xl font-bold text-blue-600">{stats.commentDm.sent}</div>
                {stats.commentDm.failed > 0 && (
                  <div className="text-sm text-red-500">{stats.commentDm.failed} failed</div>
                )}
              </div>
              <div className="bg-white rounded-lg border p-4">
                <div className="text-sm text-gray-500">Auto-Replies Sent</div>
                <div className="text-2xl font-bold text-green-600">{stats.autoReply.sent}</div>
              </div>
              <div className="bg-white rounded-lg border p-4">
                <div className="text-sm text-gray-500">Follow-ups</div>
                <div className="text-2xl font-bold text-purple-600">{stats.followup.sent} sent</div>
                <div className="text-sm text-gray-500">{stats.followup.pending} pending</div>
              </div>
            </div>
          )}

          {/* Language Settings */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold">Language Settings</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Default Response Language
                </label>
                <select
                  value={formData.defaultLanguage}
                  onChange={(e) => setFormData(prev => ({ ...prev, defaultLanguage: e.target.value }))}
                  className="w-64 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  AI will respond in this language by default.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preferred Reply Language
                </label>
                <select
                  value={formData.defaultReplyLanguage}
                  onChange={(e) => setFormData(prev => ({ ...prev, defaultReplyLanguage: e.target.value }))}
                  className="w-64 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  Force AI replies into this language even if the customer writes differently.
                </p>
              </div>
            </div>
          </div>

          {/* AI Reply Policy */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="w-5 h-5 text-purple-500" />
              <h2 className="text-lg font-semibold">AI Reply Policy</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Decision Mode
                </label>
                <select
                  value={formData.decisionMode}
                  onChange={(e) => setFormData(prev => ({ ...prev, decisionMode: e.target.value as any }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="full_auto">Full auto</option>
                  <option value="assist">Assist</option>
                  <option value="info_only">Info only</option>
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  How bold the AI should be: full_auto answers more, info_only escalates more.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Reply Sentences
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={formData.maxReplySentences}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    maxReplySentences: Math.max(1, Math.min(5, parseInt(e.target.value) || 3)),
                  }))}
                  className="w-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  AI replies will be trimmed to this many sentences.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggle('allowHashtags')}
                  className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-full ${
                    formData.allowHashtags ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {formData.allowHashtags ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  Hashtags {formData.allowHashtags ? 'Allowed' : 'Blocked'}
                </button>
                <button
                  onClick={() => handleToggle('allowEmojis')}
                  className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-full ${
                    formData.allowEmojis ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {formData.allowEmojis ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  Emojis {formData.allowEmojis ? 'Allowed' : 'Blocked'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Escalation Guidelines
                </label>
                <textarea
                  value={formData.escalationGuidelines}
                  onChange={(e) => setFormData(prev => ({ ...prev, escalationGuidelines: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe when a human should step in..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Escalation Examples (one per line)
                </label>
                <textarea
                  value={formData.escalationExamples}
                  onChange={(e) => setFormData(prev => ({ ...prev, escalationExamples: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Custom pricing request&#10;Urgent safety issue&#10;Sensitive personal data"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Human Escalation Behavior
                </label>
                <select
                  value={formData.humanEscalationBehavior}
                  onChange={(e) => setFormData(prev => ({ ...prev, humanEscalationBehavior: e.target.value as any }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="ai_silent">Human takes over (AI silent)</option>
                  <option value="ai_allowed">AI can keep assisting</option>
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  When escalation is required, choose if AI pauses or continues supporting.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI Pause Duration (minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={720}
                  value={formData.humanHoldMinutes}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    humanHoldMinutes: Math.max(5, Math.min(720, parseInt(e.target.value) || 60)),
                  }))}
                  className="w-48 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  How long AI stays inactive after escalation when set to be silent.
                </p>
              </div>
            </div>
          </div>

          {/* Comment → DM Automation */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold">Comment → DM Automation</h2>
              </div>
              <button
                onClick={() => handleToggle('commentDmEnabled')}
                className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-full ${
                  formData.commentDmEnabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {formData.commentDmEnabled ? (
                  <>
                    <ToggleRight className="w-5 h-5" />
                    Enabled
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-5 h-5" />
                    Disabled
                  </>
                )}
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Automatically send a DM to users who comment on your posts.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                DM Template
              </label>
              <textarea
                value={formData.commentDmTemplate}
                onChange={(e) => setFormData(prev => ({ ...prev, commentDmTemplate: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Thanks for your comment! We'd love to help you with more information..."
              />
              <p className="text-sm text-gray-500 mt-1">
                This message will be sent as a DM when someone comments on your posts.
              </p>
            </div>
          </div>

          {/* Inbound DM Auto-Reply */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold">Inbound DM Auto-Reply</h2>
              </div>
              <button
                onClick={() => handleToggle('dmAutoReplyEnabled')}
                className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-full ${
                  formData.dmAutoReplyEnabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {formData.dmAutoReplyEnabled ? (
                  <>
                    <ToggleRight className="w-5 h-5" />
                    Enabled
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-5 h-5" />
                    Disabled
                  </>
                )}
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Automatically generate and send AI responses to incoming DMs. Messages are categorized
              and responses use your knowledge base and category-specific instructions.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-700">
                <strong>How it works:</strong> When enabled, incoming messages are automatically categorized
                and responded to using AI. The AI uses your general knowledge base and category-specific
                instructions to generate appropriate responses.
              </p>
            </div>
          </div>

          {/* 24h Follow-up */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-500" />
                <h2 className="text-lg font-semibold">24h Follow-up Automation</h2>
              </div>
              <button
                onClick={() => handleToggle('followupEnabled')}
                className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-full ${
                  formData.followupEnabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {formData.followupEnabled ? (
                  <>
                    <ToggleRight className="w-5 h-5" />
                    Enabled
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-5 h-5" />
                    Disabled
                  </>
                )}
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Automatically send a follow-up message before the 24-hour messaging window expires.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Send Follow-up Before Window Expires (hours)
                </label>
                <input
                  type="number"
                  value={formData.followupHoursBeforeExpiry}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    followupHoursBeforeExpiry: Math.max(1, Math.min(23, parseInt(e.target.value) || 2))
                  }))}
                  min={1}
                  max={23}
                  className="w-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Follow-up will be sent {formData.followupHoursBeforeExpiry} hour(s) before the 24h window closes.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Follow-up Template
                </label>
                <textarea
                  value={formData.followupTemplate}
                  onChange={(e) => setFormData(prev => ({ ...prev, followupTemplate: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Just checking in to see if you had any other questions..."
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveAutomations}
              disabled={saving || loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Settings
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
