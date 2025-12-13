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
    return <div className="p-4 text-gray-600">Select a workspace to view escalations.</div>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-3 md:p-6 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 md:w-6 md:h-6 text-amber-600" />
          Human-in-the-Loop Alerts
        </h1>
        <p className="text-sm md:text-base text-gray-600 mt-1">
          Conversations that require a human. See why escalation happened, what the AI said, and resolve when handled.
        </p>
        {settings && (
          <div className="mt-3 text-xs md:text-sm text-gray-600 flex gap-4 flex-wrap">
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
              Mode: {settings.humanEscalationBehavior === 'ai_allowed' ? 'AI allowed during escalation' : 'AI silent during escalation'}
            </span>
            <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700">
              AI pause: {settings.humanHoldMinutes ?? 60} min
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 md:p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm md:text-base">
          {error}
        </div>
      )}

      {items.length === 0 && (
        <div className="p-4 md:p-6 bg-white border rounded-lg text-gray-600">
          No active escalations. When AI flags a conversation for human review, it will appear here.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((item) => (
          <div key={item.escalation._id} className="bg-white border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <User className="w-4 h-4 text-gray-500" />
                  {item.conversation.participantName} ({item.conversation.participantHandle})
                </div>
                <div className="text-xs text-gray-500">Escalated: {formatTime(item.escalation.createdAt)}</div>
              </div>
              <button
                onClick={() => handleResolve(item.escalation._id)}
                disabled={savingId === item.escalation._id}
                className="flex items-center gap-2 px-3 py-1.5 text-xs md:text-sm rounded-full bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50"
              >
                {savingId === item.escalation._id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Mark Resolved
              </button>
            </div>

            <div className="text-sm text-gray-800">
              <span className="font-medium text-gray-900">Topic:</span>{' '}
              {item.escalation.topicSummary || 'Escalation requested by AI'}
            </div>
            <div className="text-sm text-gray-800">
              <span className="font-medium text-gray-900">Reason:</span>{' '}
              {item.escalation.reason || 'Human review required'}
            </div>

            {item.lastEscalation && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-xs uppercase text-amber-700 font-semibold mb-1">Last AI escalation message</div>
                <p className="text-sm text-gray-900">{item.lastEscalation.text}</p>
                {item.lastEscalation.aiEscalationReason && (
                  <p className="text-xs text-gray-600 mt-1">Reason: {item.lastEscalation.aiEscalationReason}</p>
                )}
              </div>
            )}

            <div>
              <div className="text-xs uppercase text-gray-500 mb-1">Recent messages</div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {item.recentMessages.map((msg) => (
                  <div
                    key={msg._id}
                    className={`text-sm p-2 rounded ${
                      msg.from === 'ai' ? 'bg-blue-50 text-blue-900' : msg.from === 'customer' ? 'bg-gray-50 text-gray-800' : 'bg-green-50 text-green-900'
                    }`}
                  >
                    <div className="text-xs text-gray-500 mb-1">
                      {msg.from.toUpperCase()} • {new Date(msg.createdAt).toLocaleString()}
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
