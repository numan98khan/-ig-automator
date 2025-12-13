import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  settingsAPI,
  WorkspaceSettings,
  AutomationStats,
} from '../services/api';
import {
  Settings,
  MessageSquare,
  MessageCircle,
  Clock,
  Globe,
  Save,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

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

export default function Automations() {
  const { currentWorkspace } = useAuth();
  const [, setSettings] = useState<WorkspaceSettings | null>(null);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
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
    if (currentWorkspace) {
      loadSettings();
      loadStats();
    }
  }, [currentWorkspace]);

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

  const handleSave = async () => {
    if (!currentWorkspace) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await settingsAPI.update(currentWorkspace._id, {
        ...formData,
        escalationExamples: formData.escalationExamples
          ? formData.escalationExamples.split('\n').map(line => line.trim()).filter(Boolean)
          : [],
        humanHoldMinutes: Math.max(5, Math.min(720, formData.humanHoldMinutes || 60)),
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-3 md:p-6">
      <div className="mb-4 md:mb-8">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-5 h-5 md:w-6 md:h-6" />
          Automation Settings
        </h1>
        <p className="text-sm md:text-base text-gray-600 mt-1">
          Configure automated responses and follow-ups for your Instagram inbox.
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-4 md:mb-6 p-3 md:p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm md:text-base">
          <AlertCircle className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 md:mb-6 p-3 md:p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm md:text-base">
          <CheckCircle className="w-4 h-4 md:w-5 md:h-5" />
          {success}
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="mb-4 md:mb-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          <div className="bg-white rounded-lg border p-3 md:p-4">
            <div className="text-xs md:text-sm text-gray-500">Comment DMs Sent</div>
            <div className="text-xl md:text-2xl font-bold text-blue-600">{stats.commentDm.sent}</div>
            {stats.commentDm.failed > 0 && (
              <div className="text-xs md:text-sm text-red-500">{stats.commentDm.failed} failed</div>
            )}
          </div>
          <div className="bg-white rounded-lg border p-3 md:p-4">
            <div className="text-xs md:text-sm text-gray-500">Auto-Replies Sent</div>
            <div className="text-xl md:text-2xl font-bold text-green-600">{stats.autoReply.sent}</div>
          </div>
          <div className="bg-white rounded-lg border p-3 md:p-4 sm:col-span-2 md:col-span-1">
            <div className="text-xs md:text-sm text-gray-500">Follow-ups</div>
            <div className="text-xl md:text-2xl font-bold text-purple-600">{stats.followup.sent} sent</div>
            <div className="text-xs md:text-sm text-gray-500">{stats.followup.pending} pending</div>
          </div>
        </div>
      )}

      <div className="space-y-4 md:space-y-6">
        {/* Language Settings */}
        <div className="bg-white rounded-lg border p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Globe className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
            <h2 className="text-base md:text-lg font-semibold">Language Settings</h2>
          </div>

          <div className="space-y-3 md:space-y-4">
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
                Default Response Language
              </label>
              <select
                value={formData.defaultLanguage}
                onChange={(e) => setFormData(prev => ({ ...prev, defaultLanguage: e.target.value }))}
                className="w-full md:w-64 px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                AI will respond in this language by default.
              </p>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
                Preferred Reply Language
              </label>
              <select
                value={formData.defaultReplyLanguage}
                onChange={(e) => setFormData(prev => ({ ...prev, defaultReplyLanguage: e.target.value }))}
                className="w-full md:w-64 px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                Force AI replies into this language even if the customer writes differently.
              </p>
            </div>
          </div>
        </div>

        {/* AI Reply Policy */}
        <div className="bg-white rounded-lg border p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-purple-500" />
            <h2 className="text-base md:text-lg font-semibold">AI Reply Policy</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
                Decision Mode
              </label>
              <select
                value={formData.decisionMode}
                onChange={(e) => setFormData(prev => ({ ...prev, decisionMode: e.target.value as any }))}
                className="w-full px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="full_auto">Full auto</option>
                <option value="assist">Assist</option>
                <option value="info_only">Info only</option>
              </select>
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                How bold the AI should be: full_auto answers more, info_only escalates more.
              </p>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
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
                className="w-full md:w-32 px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                AI replies will be trimmed to this many sentences.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleToggle('allowHashtags')}
                className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs md:text-sm rounded-full ${
                  formData.allowHashtags ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {formData.allowHashtags ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                Hashtags {formData.allowHashtags ? 'Allowed' : 'Blocked'}
              </button>
              <button
                onClick={() => handleToggle('allowEmojis')}
                className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs md:text-sm rounded-full ${
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
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
                Escalation Guidelines
              </label>
              <textarea
                value={formData.escalationGuidelines}
                onChange={(e) => setFormData(prev => ({ ...prev, escalationGuidelines: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe when a human should step in..."
              />
            </div>
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
                Escalation Examples (one per line)
              </label>
              <textarea
                value={formData.escalationExamples}
                onChange={(e) => setFormData(prev => ({ ...prev, escalationExamples: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Custom pricing request\nUrgent safety issue\nSensitive personal data"
              />
            </div>
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
                Human Escalation Behavior
              </label>
              <select
                value={formData.humanEscalationBehavior}
                onChange={(e) => setFormData(prev => ({ ...prev, humanEscalationBehavior: e.target.value as any }))}
                className="w-full px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ai_silent">Human takes over (AI silent)</option>
                <option value="ai_allowed">AI can keep assisting</option>
              </select>
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                When escalation is required, choose if AI pauses or continues supporting.
              </p>
            </div>
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
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
                className="w-full md:w-48 px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                How long AI stays inactive after escalation when set to be silent.
              </p>
            </div>
          </div>
        </div>

        {/* Comment → DM Automation */}
        <div className="bg-white rounded-lg border p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 md:mb-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
              <h2 className="text-base md:text-lg font-semibold">Comment → DM Automation</h2>
            </div>
            <button
              onClick={() => handleToggle('commentDmEnabled')}
              className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs md:text-sm rounded-full ${
                formData.commentDmEnabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {formData.commentDmEnabled ? (
                <>
                  <ToggleRight className="w-4 h-4 md:w-5 md:h-5" />
                  Enabled
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4 md:w-5 md:h-5" />
                  Disabled
                </>
              )}
            </button>
          </div>

          <p className="text-xs md:text-sm text-gray-600 mb-3 md:mb-4">
            Automatically send a DM to users who comment on your posts.
          </p>

          <div className="space-y-3 md:space-y-4">
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
                DM Template
              </label>
              <textarea
                value={formData.commentDmTemplate}
                onChange={(e) => setFormData(prev => ({ ...prev, commentDmTemplate: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Thanks for your comment! We'd love to help you with more information..."
              />
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                This message will be sent as a DM when someone comments on your posts.
              </p>
            </div>
          </div>
        </div>

        {/* Inbound DM Auto-Reply */}
        <div className="bg-white rounded-lg border p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 md:mb-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
              <h2 className="text-base md:text-lg font-semibold">Inbound DM Auto-Reply</h2>
            </div>
            <button
              onClick={() => handleToggle('dmAutoReplyEnabled')}
              className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs md:text-sm rounded-full ${
                formData.dmAutoReplyEnabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {formData.dmAutoReplyEnabled ? (
                <>
                  <ToggleRight className="w-4 h-4 md:w-5 md:h-5" />
                  Enabled
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4 md:w-5 md:h-5" />
                  Disabled
                </>
              )}
            </button>
          </div>

          <p className="text-xs md:text-sm text-gray-600 mb-3 md:mb-4">
            Automatically generate and send AI responses to incoming DMs. Messages are categorized
            and responses use your knowledge base and category-specific instructions.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 md:p-4">
            <p className="text-xs md:text-sm text-blue-700">
              <strong>How it works:</strong> When enabled, incoming messages are automatically categorized
              and responded to using AI. The AI uses your general knowledge base and category-specific
              instructions to generate appropriate responses.
            </p>
          </div>
        </div>

        {/* 24h Follow-up */}
        <div className="bg-white rounded-lg border p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 md:mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 md:w-5 md:h-5 text-purple-500" />
              <h2 className="text-base md:text-lg font-semibold">24h Follow-up Automation</h2>
            </div>
            <button
              onClick={() => handleToggle('followupEnabled')}
              className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs md:text-sm rounded-full ${
                formData.followupEnabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {formData.followupEnabled ? (
                <>
                  <ToggleRight className="w-4 h-4 md:w-5 md:h-5" />
                  Enabled
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4 md:w-5 md:h-5" />
                  Disabled
                </>
              )}
            </button>
          </div>

          <p className="text-xs md:text-sm text-gray-600 mb-3 md:mb-4">
            Automatically send a follow-up message before the 24-hour messaging window expires.
          </p>

          <div className="space-y-3 md:space-y-4">
            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
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
                className="w-24 md:w-32 px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                Follow-up will be sent {formData.followupHoursBeforeExpiry} hour(s) before the 24h window closes.
              </p>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1">
                Follow-up Template
              </label>
              <textarea
                value={formData.followupTemplate}
                onChange={(e) => setFormData(prev => ({ ...prev, followupTemplate: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 text-sm md:text-base border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Just checking in to see if you had any other questions..."
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 md:px-6 py-2 md:py-2.5 text-sm md:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4" />
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
    </div>
  );
}
