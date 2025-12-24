import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, User, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { escalationAPI, EscalationCase, settingsAPI, WorkspaceSettings } from '../services/api';

export default function Escalations() {
  const { currentWorkspace } = useAuth();
  const [items, setItems] = useState<EscalationCase[]>([]);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('Mounting Escalations page');
    if (currentWorkspace) {
      loadData();
    }
  }, [currentWorkspace]);

  const loadData = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      const [escalations, wsSettings] = await Promise.all([
        escalationAPI.listByWorkspace(currentWorkspace._id),
        settingsAPI.getByWorkspace(currentWorkspace._id),
      ]);
      setItems(escalations);
      setSettings(wsSettings);
    } catch (err: any) {
      setError(err.message || 'Failed to load escalations');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (conversationId: string) => {
    setSavingId(conversationId);
    try {
      await escalationAPI.resolve(conversationId);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to resolve escalation');
    } finally {
      setSavingId(null);
    }
  };

  const formatTime = (val?: string) => {
    if (!val) return '—';
    return new Date(val).toLocaleString();
  };

  if (!currentWorkspace) {
    return <div className="p-4 text-muted-foreground">Select a workspace to view escalations.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2 mb-2">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
          Human-in-the-Loop Alerts
        </h1>
        <p className="text-muted-foreground">
          Conversations that require a human. See why escalation happened, what the AI said, and resolve when handled.
        </p>
        {settings && (
          <div className="mt-4 flex gap-3 flex-wrap">
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-secondary text-secondary-foreground border border-border">
              Mode: {settings.humanEscalationBehavior === 'ai_allowed' ? 'AI allowed during escalation' : 'AI silent during escalation'}
            </span>
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-secondary text-secondary-foreground border border-border">
              AI pause: {settings.humanHoldMinutes ?? 60} min
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm font-medium">
          {error}
        </div>
      )}

      {items.length === 0 && (
        <div className="p-12 glass-panel border-dashed rounded-xl text-center text-muted-foreground">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-1">No active escalations</h3>
          <p>When AI flags a conversation for human review, it will appear here.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => (
          <div key={item.escalation._id} className="glass-panel rounded-xl p-5 space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <User className="w-4 h-4 text-muted-foreground" />
                  {item.conversation.participantName} ({item.conversation.participantHandle})
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Escalated: {formatTime(item.escalation.createdAt)}</div>
              </div>
              <button
                onClick={() => handleResolve(item.escalation._id)}
                disabled={savingId === item.escalation._id}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 disabled:opacity-50 transition-colors"
              >
                {savingId === item.escalation._id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Resolve
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="font-medium text-foreground min-w-[60px]">Topic:</span>
                <span className="text-muted-foreground">{item.escalation.topicSummary || 'Escalation requested by AI'}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium text-foreground min-w-[60px]">Reason:</span>
                <span className="text-muted-foreground">{item.escalation.reason || 'Human review required'}</span>
              </div>
            </div>

            {item.lastEscalation && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <div className="text-xs uppercase text-amber-600 dark:text-amber-500 font-bold mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3" />
                  Last AI escalation message
                </div>
                <p className="text-sm text-foreground/90">{item.lastEscalation.text}</p>
                {item.lastEscalation.aiEscalationReason && (
                  <p className="text-xs text-muted-foreground mt-2 border-t border-amber-500/10 pt-2">
                    <span className="font-medium text-amber-600/80 dark:text-amber-500/80">System Reason:</span> {item.lastEscalation.aiEscalationReason}
                  </p>
                )}
              </div>
            )}

            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">Recent messages</div>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {item.recentMessages.map((msg) => (
                  <div
                    key={msg._id}
                    className={`text-sm p-3 rounded-lg border ${msg.from === 'ai'
                      ? 'bg-primary/5 border-primary/10 text-foreground'
                      : msg.from === 'customer'
                        ? 'bg-muted/50 border-border text-foreground'
                        : 'bg-green-500/5 border-green-500/10 text-foreground'
                      }`}
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span className="font-medium">{msg.from.toUpperCase()}</span>
                      <span>{new Date(msg.createdAt).toLocaleString()}</span>
                    </div>
                    <div>{msg.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
