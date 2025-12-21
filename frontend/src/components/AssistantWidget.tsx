import React, { useMemo, useState } from 'react';
import { MessageCircle, X, Sparkles, Loader2, Info } from 'lucide-react';
import { askAssistant } from '../services/assistant';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';

interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantWidgetProps {
  locationHint?: string;
  workspaceName?: string;
  workspaceId?: string;
}

const AssistantWidget: React.FC<AssistantWidgetProps> = ({ locationHint, workspaceName, workspaceId }) => {
  const { theme } = useTheme();
  const { currentWorkspace } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const surface = useMemo(
    () => (theme === 'light' ? 'bg-white border border-black/5 shadow-2xl' : 'bg-background/90 border border-border/60 shadow-2xl'),
    [theme],
  );

  const handleSend = async () => {
    const question = input.trim();
    if (!question) return;
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setInput('');
    setLoading(true);
    try {
      const response = await askAssistant({
        question,
        workspaceName: workspaceName || currentWorkspace?.name,
        workspaceId: workspaceId || currentWorkspace?._id,
        locationHint,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: response.answer }]);
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Assistant is unavailable right now.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 md:bottom-6 md:right-6">
        {open && (
          <div className={`w-[320px] max-w-[90vw] rounded-2xl p-4 backdrop-blur-xl ${surface}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/30">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">SendFx Assistant</p>
                  <p className="text-xs text-muted-foreground">Ask about product, pricing, or guardrails</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-full hover:bg-muted transition text-muted-foreground"
                aria-label="Close assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
              {messages.length === 0 && (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  <span>Examples: “What does SendFx do?”, “How are guardrails enforced?”, “What plans exist?”</span>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div
                  key={`${msg.role}-${idx}`}
                  className={`rounded-xl px-3 py-2 text-sm whitespace-pre-line ${msg.role === 'user'
                    ? 'bg-primary/10 text-primary-foreground/90 dark:text-primary-foreground/80 border border-primary/20'
                    : 'bg-muted/60 text-foreground border border-border/60'
                    }`}
                >
                  {msg.content}
                </div>
              ))}
              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating answer…</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about SendFx..."
                className="flex-1 rounded-xl border border-border bg-background/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="shrink-0"
                leftIcon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              >
                Ask
              </Button>
            </div>
          </div>
        )}

        <button
          onClick={() => setOpen(!open)}
          className="rounded-full bg-gradient-to-r from-primary to-primary/80 text-white shadow-xl hover:shadow-2xl transition-all duration-200 p-4 flex items-center gap-2 border border-primary/40"
          aria-label="Open SendFx Assistant"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="hidden sm:inline text-sm font-semibold">Ask SendFx</span>
        </button>
      </div>
    </>
  );
};

export default AssistantWidget;
