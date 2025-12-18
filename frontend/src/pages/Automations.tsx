import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { settingsAPI, WorkspaceSettings, AutomationStats, GoalType, GoalConfigs } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import {
  Save,
  MessageSquare,
  MessageCircle,
  Clock,
  Globe,
  AlertCircle,
  CheckCircle,
  Loader2,
  Zap,
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

const GOAL_OPTIONS: { value: GoalType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'capture_lead', label: 'Capture lead' },
  { value: 'book_appointment', label: 'Book appointment' },
  { value: 'start_order', label: 'Start order' },
  { value: 'handle_support', label: 'Handle support' },
  { value: 'drive_to_channel', label: 'Drive to channel' },
];

const DEFAULT_GOAL_CONFIGS: GoalConfigs = {
  leadCapture: {
    collectName: true,
    collectPhone: true,
    collectEmail: false,
    collectCustomNote: false,
  },
  booking: {
    bookingLink: '',
    collectDate: true,
    collectTime: true,
    collectServiceType: false,
  },
  order: {
    catalogUrl: '',
    collectProductName: true,
    collectQuantity: true,
    collectVariant: false,
  },
  support: {
    askForOrderId: true,
    askForPhoto: false,
  },
  drive: {
    targetType: 'website',
    targetLink: '',
  },
};

export default function Automations() {
  const { currentWorkspace } = useAuth();
  const [, setSettings] = useState<WorkspaceSettings | null>(null);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    primaryGoal: 'none' as GoalType,
    secondaryGoal: 'none' as GoalType,
    goalConfigs: DEFAULT_GOAL_CONFIGS,
  });

  useEffect(() => {
    if (!currentWorkspace) {
      setStats(null);
      setLoading(false);
      return;
    }

    loadSettings();
    loadStats();
  }, [currentWorkspace]);

  const loadSettings = async () => {
    if (!currentWorkspace) return;

    setLoading(true);
    setError(null);

    try {
      const data = await settingsAPI.getByWorkspace(currentWorkspace._id);
      const mergedGoalConfigs: GoalConfigs = {
        leadCapture: { ...DEFAULT_GOAL_CONFIGS.leadCapture, ...(data.goalConfigs?.leadCapture || {}) },
        booking: { ...DEFAULT_GOAL_CONFIGS.booking, ...(data.goalConfigs?.booking || {}) },
        order: { ...DEFAULT_GOAL_CONFIGS.order, ...(data.goalConfigs?.order || {}) },
        support: { ...DEFAULT_GOAL_CONFIGS.support, ...(data.goalConfigs?.support || {}) },
        drive: { ...DEFAULT_GOAL_CONFIGS.drive, ...(data.goalConfigs?.drive || {}) },
      };
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
        primaryGoal: data.primaryGoal || 'none',
        secondaryGoal: data.secondaryGoal || 'none',
        goalConfigs: mergedGoalConfigs,
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
        primaryGoal: formData.primaryGoal,
        secondaryGoal: formData.secondaryGoal,
        goalConfigs: formData.goalConfigs,
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

  const updateGoalConfig = <K extends keyof GoalConfigs>(key: K, value: Partial<GoalConfigs[K]>) => {
    setFormData(prev => ({
      ...prev,
      goalConfigs: {
        ...prev.goalConfigs,
        [key]: {
          ...prev.goalConfigs[key],
          ...value,
        },
      },
    }));
  };

  const renderGoalConfig = (goal: GoalType) => {
    if (goal === 'capture_lead') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {[
            { key: 'collectName', label: 'Ask for name' },
            { key: 'collectPhone', label: 'Ask for phone number' },
            { key: 'collectEmail', label: 'Ask for email' },
            { key: 'collectCustomNote', label: 'Ask for extra notes' },
          ].map(option => (
            <label key={option.key} className="flex items-center gap-2 text-sm md:text-base">
              <input
                type="checkbox"
                checked={(formData.goalConfigs.leadCapture as any)[option.key]}
                onChange={(e) => updateGoalConfig('leadCapture', { [option.key]: e.target.checked } as any)}
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }

    if (goal === 'book_appointment') {
      return (
        <div className="space-y-3 mt-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Booking link (optional)</label>
            <input
              type="text"
              value={formData.goalConfigs.booking.bookingLink || ''}
              onChange={(e) => updateGoalConfig('booking', { bookingLink: e.target.value })}
              className="input-field w-full"
              placeholder="https://..."
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { key: 'collectDate', label: 'Ask for date' },
              { key: 'collectTime', label: 'Ask for time' },
              { key: 'collectServiceType', label: 'Ask for service type' },
            ].map(option => (
              <label key={option.key} className="flex items-center gap-2 text-sm md:text-base">
                <input
                  type="checkbox"
                  checked={(formData.goalConfigs.booking as any)[option.key]}
                  onChange={(e) => updateGoalConfig('booking', { [option.key]: e.target.checked } as any)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (goal === 'start_order') {
      return (
        <div className="space-y-3 mt-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Catalog / checkout URL</label>
            <input
              type="text"
              value={formData.goalConfigs.order.catalogUrl || ''}
              onChange={(e) => updateGoalConfig('order', { catalogUrl: e.target.value })}
              className="input-field w-full"
              placeholder="https://..."
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { key: 'collectProductName', label: 'Ask for product name' },
              { key: 'collectQuantity', label: 'Ask for quantity' },
              { key: 'collectVariant', label: 'Ask for size/color' },
            ].map(option => (
              <label key={option.key} className="flex items-center gap-2 text-sm md:text-base">
                <input
                  type="checkbox"
                  checked={(formData.goalConfigs.order as any)[option.key]}
                  onChange={(e) => updateGoalConfig('order', { [option.key]: e.target.checked } as any)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      );
    }

    if (goal === 'handle_support') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {[
            { key: 'askForOrderId', label: 'Ask for order ID' },
            { key: 'askForPhoto', label: 'Ask for photo' },
          ].map(option => (
            <label key={option.key} className="flex items-center gap-2 text-sm md:text-base">
              <input
                type="checkbox"
                checked={(formData.goalConfigs.support as any)[option.key]}
                onChange={(e) => updateGoalConfig('support', { [option.key]: e.target.checked } as any)}
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }

    if (goal === 'drive_to_channel') {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Target channel</label>
            <select
              value={formData.goalConfigs.drive.targetType}
              onChange={(e) => updateGoalConfig('drive', { targetType: e.target.value as GoalConfigs['drive']['targetType'] })}
              className="input-field w-full"
            >
              {['website', 'WhatsApp', 'store', 'app'].map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Target link / address</label>
            <input
              type="text"
              value={formData.goalConfigs.drive.targetLink || ''}
              onChange={(e) => updateGoalConfig('drive', { targetLink: e.target.value })}
              className="input-field w-full"
              placeholder="https://... or store address"
            />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Automations</h1>
          <p className="text-slate-400">Manage your AI automation preferences and guardrails.</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          isLoading={saving}
          leftIcon={!saving && <Save className="w-4 h-4" />}
        >
          Save Changes
        </Button>
      </div>

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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
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
                    onChange={(e) => setFormData(prev => ({ ...prev, decisionMode: e.target.value as typeof formData.decisionMode }))}
                    className="input-field w-full"
                  >
                    <option value="full_auto">Full Auto</option>
                    <option value="assist">Assist</option>
                    <option value="info_only">Info Only</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400"></span>
                    Controls how autonomously the AI acts.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Human escalation</label>
                  <select
                    value={formData.humanEscalationBehavior}
                    onChange={(e) => setFormData(prev => ({ ...prev, humanEscalationBehavior: e.target.value as typeof formData.humanEscalationBehavior }))}
                    className="input-field w-full"
                  >
                    <option value="ai_silent">Pause AI when human joins</option>
                    <option value="ai_allowed">AI can continue helping</option>
                  </select>
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Hold time when escalating to human (minutes)</label>
                    <input
                      type="number"
                      min={5}
                      max={720}
                      value={formData.humanHoldMinutes}
                      onChange={(e) => setFormData(prev => ({ ...prev, humanHoldMinutes: parseInt(e.target.value) || 60 }))}
                      className="input-field w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Escalation guardrails</label>
                  <textarea
                    value={formData.escalationGuidelines}
                    onChange={(e) => setFormData(prev => ({ ...prev, escalationGuidelines: e.target.value }))}
                    className="input-field w-full min-h-[100px]"
                    placeholder="When to involve a human..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Escalation examples</label>
                  <textarea
                    value={formData.escalationExamples}
                    onChange={(e) => setFormData(prev => ({ ...prev, escalationExamples: e.target.value }))}
                    className="input-field w-full min-h-[100px]"
                    placeholder={`Example 1: Customer asks about refund\nExample 2: Sensitive topic...`}
                  />
                  <p className="text-xs text-slate-500 mt-1">One example per line.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Max sentences per reply</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.maxReplySentences}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxReplySentences: parseInt(e.target.value) }))}
                    className="input-field w-full"
                  />
                  <p className="text-xs text-slate-500 mt-1.5">Max sentences per reply.</p>
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
              </div>

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

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-400" /> Conversation Goals
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-slate-400">
                    Pick the main objectives for DM conversations and the fields you want the AI to collect.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    <div>
                      <label className="block text-xs md:text-sm font-medium text-gray-300 mb-1">Primary DM Goal</label>
                      <select
                        value={formData.primaryGoal}
                        onChange={(e) => setFormData(prev => ({ ...prev, primaryGoal: e.target.value as GoalType }))}
                        className="input-field w-full"
                      >
                        {GOAL_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs md:text-sm font-medium text-gray-300 mb-1">Secondary DM Goal (optional)</label>
                      <select
                        value={formData.secondaryGoal}
                        onChange={(e) => setFormData(prev => ({ ...prev, secondaryGoal: e.target.value as GoalType }))}
                        className="input-field w-full"
                      >
                        {GOAL_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {formData.primaryGoal !== 'none' && (
                    <div className="mt-2">
                      <div className="text-sm font-medium text-gray-200">Primary goal configuration</div>
                      {renderGoalConfig(formData.primaryGoal)}
                    </div>
                  )}

                  {formData.secondaryGoal !== 'none' && (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <div className="text-sm font-medium text-gray-200">Secondary goal configuration</div>
                      {renderGoalConfig(formData.secondaryGoal)}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-6">
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
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
