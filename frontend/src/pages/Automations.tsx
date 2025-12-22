import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { automationAPI, knowledgeAPI, Automation, KnowledgeItem, TriggerType, GoalType } from '../services/api';
import {
  Zap,
  Plus,
  MessageSquare,
  Calendar,
  Package,
  AlertTriangle,
  Moon,
  Link as LinkIcon,
  PlayCircle,
  Clock,
  Loader2,
  Target,
  MessageCircle,
  Share2,
  Megaphone,
  Video,
  ExternalLink,
  Edit2,
  Trash2,
  Power,
  PowerOff,
  TrendingUp,
  Send,
  CheckCircle,
  Info,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';

// Trigger metadata
const TRIGGER_METADATA: Record<TriggerType, { icon: React.ReactNode; label: string; description: string; badge?: string }> = {
  post_comment: {
    icon: <MessageSquare className="w-5 h-5" />,
    label: 'Post or Reel Comments',
    description: 'User comments on your Post or Reel',
  },
  story_reply: {
    icon: <MessageCircle className="w-5 h-5" />,
    label: 'Story Reply',
    description: 'User replies to your Story',
  },
  dm_message: {
    icon: <Send className="w-5 h-5" />,
    label: 'Instagram Message',
    description: 'User sends a message',
  },
  story_share: {
    icon: <Share2 className="w-5 h-5" />,
    label: 'Story Share',
    description: 'User shares your Post or Reel as a Story',
    badge: 'NEW',
  },
  instagram_ads: {
    icon: <Megaphone className="w-5 h-5" />,
    label: 'Instagram Ads',
    description: 'User clicks an Instagram Ad',
    badge: 'PRO',
  },
  live_comment: {
    icon: <Video className="w-5 h-5" />,
    label: 'Live Comments',
    description: 'User comments on your Live',
  },
  ref_url: {
    icon: <ExternalLink className="w-5 h-5" />,
    label: 'Instagram Ref URL',
    description: 'User clicks a referral link',
  },
};

const GOAL_OPTIONS: { value: GoalType; label: string; description: string }[] = [
  { value: 'none', label: 'No specific goal', description: 'Just have a conversation' },
  { value: 'capture_lead', label: 'Capture Lead', description: 'Collect customer information' },
  { value: 'book_appointment', label: 'Book Appointment', description: 'Schedule a booking' },
  { value: 'start_order', label: 'Start Order', description: 'Begin order process' },
  { value: 'handle_support', label: 'Handle Support', description: 'Provide customer support' },
  { value: 'drive_to_channel', label: 'Drive to Channel', description: 'Direct to external link' },
];

const Automations: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [activeSection, setActiveSection] = useState<'automations' | 'routing' | 'followups' | 'integrations'>('automations');
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    triggerType: 'post_comment' as TriggerType,
    replyType: 'constant_reply' as 'constant_reply' | 'ai_reply',
    constantMessage: '',
    aiGoalType: 'none' as GoalType,
    aiGoalDescription: '',
    aiKnowledgeIds: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentWorkspace) {
      loadData();
    }
  }, [currentWorkspace]);

  const loadData = async () => {
    if (!currentWorkspace) return;

    try {
      setLoading(true);
      setError(null);
      const [automationsData, knowledgeData] = await Promise.all([
        automationAPI.getByWorkspace(currentWorkspace._id),
        knowledgeAPI.getByWorkspace(currentWorkspace._id),
      ]);
      setAutomations(automationsData);
      setKnowledgeItems(knowledgeData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load automations');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setEditingAutomation(null);
    setFormData({
      name: '',
      description: '',
      triggerType: 'post_comment',
      replyType: 'constant_reply',
      constantMessage: '',
      aiGoalType: 'none',
      aiGoalDescription: '',
      aiKnowledgeIds: [],
    });
    setIsCreateModalOpen(true);
  };

  const handleOpenEditModal = (automation: Automation) => {
    setEditingAutomation(automation);
    const replyStep = automation.replySteps[0];
    setFormData({
      name: automation.name,
      description: automation.description || '',
      triggerType: automation.triggerType,
      replyType: replyStep.type,
      constantMessage: replyStep.constantReply?.message || '',
      aiGoalType: replyStep.aiReply?.goalType || 'none',
      aiGoalDescription: replyStep.aiReply?.goalDescription || '',
      aiKnowledgeIds: replyStep.aiReply?.knowledgeItemIds || [],
    });
    setIsCreateModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace) return;

    setSaving(true);
    try {
      const replyStep = formData.replyType === 'constant_reply'
        ? {
            type: 'constant_reply' as const,
            constantReply: { message: formData.constantMessage },
          }
        : {
            type: 'ai_reply' as const,
            aiReply: {
              goalType: formData.aiGoalType,
              goalDescription: formData.aiGoalDescription,
              knowledgeItemIds: formData.aiKnowledgeIds,
            },
          };

      if (editingAutomation) {
        await automationAPI.update(editingAutomation._id, {
          name: formData.name,
          description: formData.description,
          triggerType: formData.triggerType,
          replySteps: [replyStep],
        });
      } else {
        await automationAPI.create({
          name: formData.name,
          description: formData.description,
          workspaceId: currentWorkspace._id,
          triggerType: formData.triggerType,
          replySteps: [replyStep],
          isActive: true,
        });
      }

      setIsCreateModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Error saving automation:', err);
      setError('Failed to save automation');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (automation: Automation) => {
    try {
      await automationAPI.toggle(automation._id);
      loadData();
    } catch (err) {
      console.error('Error toggling automation:', err);
      setError('Failed to toggle automation');
    }
  };

  const handleDelete = async (automation: Automation) => {
    if (!confirm(`Are you sure you want to delete "${automation.name}"?`)) return;

    try {
      await automationAPI.delete(automation._id);
      loadData();
    } catch (err) {
      console.error('Error deleting automation:', err);
      setError('Failed to delete automation');
    }
  };

  const toggleKnowledge = (knowledgeId: string) => {
    setFormData(prev => ({
      ...prev,
      aiKnowledgeIds: prev.aiKnowledgeIds.includes(knowledgeId)
        ? prev.aiKnowledgeIds.filter(id => id !== knowledgeId)
        : [...prev.aiKnowledgeIds, knowledgeId],
    }));
  };

  if (!currentWorkspace) return null;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Automation Control Center</h1>
          <p className="text-muted-foreground">
            Configure playbooks, triggers, routing rules, and AI policies to automate your customer conversations safely and effectively.
          </p>
        </div>
      </div>

      {/* Main Content - Side Nav + Content Area */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Side Navigation */}
        <aside className="lg:w-64 flex-shrink-0">
          <div className="bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-xl p-2 space-y-1 shadow-sm backdrop-blur-sm">
            <button
              onClick={() => setActiveSection('automations')}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
                activeSection === 'automations'
                  ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <Target className="w-4 h-4" />
              <span className="flex-1 text-sm font-medium">Automations</span>
            </button>
            <button
              onClick={() => setActiveSection('routing')}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
                activeSection === 'routing'
                  ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <PlayCircle className="w-4 h-4" />
              <span className="flex-1 text-sm font-medium">Routing & Handoffs</span>
            </button>
            <button
              onClick={() => setActiveSection('followups')}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
                activeSection === 'followups'
                  ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span className="flex-1 text-sm font-medium">Follow-ups</span>
            </button>
            <button
              onClick={() => setActiveSection('integrations')}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors text-left ${
                activeSection === 'integrations'
                  ? 'bg-primary/12 text-foreground border border-primary/30 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 border border-transparent'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              <span className="flex-1 text-sm font-medium">Integrations</span>
            </button>
          </div>
        </aside>

        {/* Right Content Area */}
        <div className="flex-1 space-y-6">
          {/* Error Alert */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 animate-fade-in">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 font-medium text-sm">{error}</span>
            </div>
          )}
          {activeSection === 'automations' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Available Automations</h2>
                <Button onClick={handleOpenCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
                  Create Automation
                </Button>
              </div>

              {loading ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : automations.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
                  <Target className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No automations yet</h3>
                  <p className="text-muted-foreground mb-6">
                    Create your first automation to start automating your Instagram conversations.
                  </p>
                  <Button onClick={handleOpenCreateModal} leftIcon={<Plus className="w-4 h-4" />}>
                    Create Automation
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {automations.map((automation) => {
                    const trigger = TRIGGER_METADATA[automation.triggerType];
                    const replyStep = automation.replySteps[0];

                    return (
                      <div
                        key={automation._id}
                        className="bg-card/80 dark:bg-white/5 border border-border/70 dark:border-white/10 rounded-xl p-6 shadow-sm backdrop-blur-sm hover:shadow-lg transition-all relative group"
                      >
                        {/* Badge for trigger */}
                        {trigger.badge && (
                          <div className="absolute top-4 right-4">
                            <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                              trigger.badge === 'PRO' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'
                            }`}>
                              {trigger.badge}
                            </span>
                          </div>
                        )}

                        {/* Icon and Title */}
                        <div className="flex items-start gap-3 mb-4">
                          <div className="p-2 bg-primary/10 text-primary rounded-lg">
                            {trigger.icon}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg mb-1">{automation.name}</h3>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {automation.description || trigger.description}
                            </p>
                          </div>
                        </div>

                        {/* Trigger Info */}
                        <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                          <div className="text-xs font-medium text-muted-foreground mb-1">TRIGGER</div>
                          <div className="text-sm font-medium">{trigger.label}</div>
                        </div>

                        {/* Reply Info */}
                        <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                          <div className="text-xs font-medium text-muted-foreground mb-1">REPLY</div>
                          <div className="text-sm font-medium">
                            {replyStep.type === 'constant_reply' ? (
                              <span>Constant Reply</span>
                            ) : (
                              <span>AI Reply - {GOAL_OPTIONS.find(g => g.value === replyStep.aiReply?.goalType)?.label}</span>
                            )}
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                          <div>
                            <div className="text-muted-foreground text-xs">Triggered</div>
                            <div className="font-semibold">{automation.stats.totalTriggered}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">Replies Sent</div>
                            <div className="font-semibold">{automation.stats.totalRepliesSent}</div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleToggle(automation)}
                            variant={automation.isActive ? 'default' : 'outline'}
                            className="flex-1"
                            size="sm"
                            leftIcon={automation.isActive ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                          >
                            {automation.isActive ? 'Active' : 'Inactive'}
                          </Button>
                          <button
                            onClick={() => handleOpenEditModal(automation)}
                            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(automation)}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeSection === 'routing' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center py-16 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
                <PlayCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-2xl font-semibold mb-2">Routing & Handoffs</h3>
                <p className="text-muted-foreground text-lg mb-4">Coming Soon</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Advanced routing rules and handoff configurations will be available here.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'followups' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center py-16 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
                <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-2xl font-semibold mb-2">Follow-ups</h3>
                <p className="text-muted-foreground text-lg mb-4">Configure automated follow-up messages</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Set up automated follow-up messages to re-engage customers at the right time.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'integrations' && (
            <div className="space-y-6 animate-fade-in">
              <div className="text-center py-16 border-2 border-dashed border-border/70 dark:border-white/10 rounded-xl bg-muted/40 dark:bg-white/5">
                <LinkIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-2xl font-semibold mb-2">Integrations</h3>
                <p className="text-muted-foreground text-lg mb-4">Coming Soon</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Connect to external services like Sheets, Calendly, and more.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={editingAutomation ? 'Edit Automation' : 'Create Automation'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Welcome New Followers"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Description (optional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what this automation does..."
              rows={3}
              className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
          </div>

          {/* Trigger Type */}
          <div>
            <label className="block text-sm font-medium mb-2">Trigger</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
              {Object.entries(TRIGGER_METADATA).map(([type, meta]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData({ ...formData, triggerType: type as TriggerType })}
                  className={`text-left border rounded-lg p-3 transition-all ${
                    formData.triggerType === type
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-primary">{meta.icon}</div>
                    <span className="font-medium text-sm">{meta.label}</span>
                    {meta.badge && (
                      <span className={`ml-auto px-1.5 py-0.5 rounded text-xs font-bold ${
                        meta.badge === 'PRO' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'
                      }`}>
                        {meta.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{meta.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Reply Type */}
          <div>
            <label className="block text-sm font-medium mb-2">Reply Type</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, replyType: 'constant_reply' })}
                className={`text-left border rounded-lg p-4 transition-all ${
                  formData.replyType === 'constant_reply'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-medium mb-1">Constant Reply</div>
                <p className="text-xs text-muted-foreground">Send a predefined message</p>
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, replyType: 'ai_reply' })}
                className={`text-left border rounded-lg p-4 transition-all ${
                  formData.replyType === 'ai_reply'
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-medium mb-1">AI Reply</div>
                <p className="text-xs text-muted-foreground">AI generates responses with a goal</p>
              </button>
            </div>
          </div>

          {/* Constant Reply */}
          {formData.replyType === 'constant_reply' && (
            <div>
              <label className="block text-sm font-medium mb-1.5">Message</label>
              <textarea
                value={formData.constantMessage}
                onChange={(e) => setFormData({ ...formData, constantMessage: e.target.value })}
                placeholder="Enter your message..."
                rows={4}
                className="w-full px-3 py-2 bg-transparent border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                required
              />
            </div>
          )}

          {/* AI Reply */}
          {formData.replyType === 'ai_reply' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Goal</label>
                <select
                  value={formData.aiGoalType}
                  onChange={(e) => setFormData({ ...formData, aiGoalType: e.target.value as GoalType })}
                  className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring text-sm"
                  required
                >
                  {GOAL_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Goal Description (optional)</label>
                <Input
                  value={formData.aiGoalDescription}
                  onChange={(e) => setFormData({ ...formData, aiGoalDescription: e.target.value })}
                  placeholder="Describe the goal in natural language..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Knowledge Items</label>
                {knowledgeItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-4 bg-muted/30 rounded-lg">
                    No knowledge items available. Create knowledge items first.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                    {knowledgeItems.map(item => (
                      <label
                        key={item._id}
                        className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded-md cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={formData.aiKnowledgeIds.includes(item._id)}
                          onChange={() => toggleKnowledge(item._id)}
                          className="rounded border-border"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{item.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{item.content}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              {editingAutomation ? 'Save Changes' : 'Create Automation'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Automations;
