import React, { useMemo, useState } from 'react';
import { MessageCircle, Sparkles, Loader2, Info } from 'lucide-react';
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

const AssistantWidget: React.FC<AssistantWidgetProps> = ({
  locationHint,
  workspaceName,
  workspaceId,
}) => {
  const { theme } = useTheme();
  const { currentWorkspace } = useAuth();

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const surface = useMemo(
    () =>
      theme === 'light'
        ? 'bg-white border border-black/5 shadow-2xl'
        : 'bg-background/90 border border-border/60 shadow-2xl',
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
    <div className="fixed bottom-4 right-4 z-40 md:bottom-6 md:right-6 group">
      {/* PANEL: appears on hover/focus-within. No layout squeeze (absolute + opacity/transform only). */}
      <div
        className={[
          'absolute bottom-[76px] right-0',
          'transition-[opacity,transform] duration-200 ease-out',
          'opacity-0 translate-y-2 pointer-events-none',
          'group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto',
          'group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto',
        ].join(' ')}
      >
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
                className={[
                  'rounded-xl px-3 py-2 text-sm whitespace-pre-line border',
                  msg.role === 'user'
                    ? 'bg-primary/10 text-secondary-foreground/90 dark:text-secondary-foreground/80 border-primary/20'
                    : 'bg-muted/60 text-foreground border-border/60',
                ].join(' ')}
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
              leftIcon={
                loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />
              }
            >
              Ask
            </Button>
          </div>
        </div>
      </div>

      {/* BUTTON: icon-only by default; expands smoothly on hover with NO squeeze */}
      <button
  type="button"
  className={[
    'relative h-14 w-14 group-hover:w-[168px] group-focus-within:w-[168px]', // tighter than w-44
    'rounded-full overflow-hidden',
    'bg-gradient-to-r from-primary to-primary/80 text-white shadow-xl hover:shadow-2xl',
    'border border-primary/40',
    'transition-[width,box-shadow] duration-220 ease-out',
  ].join(' ')}
  aria-label="Open SendFx Assistant"
>
  {/* Icon: centered collapsed, snaps left on expand */}
  <span
    className={[
      'absolute top-1/2 -translate-y-1/2',
      'left-1/2 -translate-x-1/2',
      'group-hover:left-5 group-hover:translate-x-0',
      'group-focus-within:left-5 group-focus-within:translate-x-0',
      'transition-[left,transform] duration-220 ease-out',
    ].join(' ')}
  >
    <MessageCircle className="w-5 h-5" />
  </span>

  {/* Label: give it a RIGHT boundary so it doesn’t look like empty bubble */}
  <span
    className={[
      'absolute top-1/2 -translate-y-1/2',
      'left-9 right-3',               // ✅ key: right padding boundary
      'text-sm font-semibold whitespace-nowrap',
      'opacity-0 translate-x-2',
      'group-hover:opacity-100 group-hover:translate-x-0',
      'group-focus-within:opacity-100 group-focus-within:translate-x-0',
      'transition-[opacity,transform] duration-220 ease-out',
      'truncate',                      // safety if you change text later
    ].join(' ')}
  >
    Ask SendFx
  </span>
</button>

    </div>
  );
};

export default AssistantWidget;
