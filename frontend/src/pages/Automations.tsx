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
      const updated = await settingsAPI.update(currentWorkspace._id, formData);
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
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Automation Settings
        </h1>
        <p className="text-gray-600 mt-1">
          Configure automated responses and follow-ups for your Instagram inbox.
        </p>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
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

      <div className="space-y-6">
        {/* Language Settings */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold">Language Settings</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Response Language
              </label>
              <select
                value={formData.defaultLanguage}
                onChange={(e) => setFormData(prev => ({ ...prev, defaultLanguage: e.target.value }))}
                className="w-full md:w-64 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
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

          <p className="text-gray-600 text-sm mb-4">
            Automatically send a DM to users who comment on your posts.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                DM Template
              </label>
              <textarea
                value={formData.commentDmTemplate}
                onChange={(e) => setFormData(prev => ({ ...prev, commentDmTemplate: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Thanks for your comment! We'd love to help you with more information..."
              />
              <p className="text-sm text-gray-500 mt-1">
                This message will be sent as a DM when someone comments on your posts.
              </p>
            </div>
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
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
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

          <p className="text-gray-600 text-sm mb-4">
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
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${
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

          <p className="text-gray-600 text-sm mb-4">
            Automatically send a follow-up message before the 24-hour messaging window expires.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
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
            onClick={handleSave}
            disabled={saving}
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
    </div>
  );
}
