import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowRight, MessageSquare, BookOpen, Tags, TestTube, Users, AlertCircle } from 'lucide-react';

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

interface SearchItem {
  title: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  tags: string[];
}

const searchIndex: SearchItem[] = [
  {
    title: 'Inbox',
    description: 'Jump to conversations, unreplied threads, or escalations.',
    path: '/inbox',
    icon: MessageSquare,
    tags: ['conversation', 'reply', 'follow-up'],
  },
  {
    title: 'Knowledge Base',
    description: 'Search saved responses, policies, and playbooks.',
    path: '/knowledge',
    icon: BookOpen,
    tags: ['docs', 'articles', 'collections'],
  },
  {
    title: 'Categories & Policies',
    description: 'Adjust AI instructions and escalation rules by topic.',
    path: '/categories',
    icon: Tags,
    tags: ['policy', 'routing', 'automation'],
  },
  {
    title: 'Sandbox (Test)',
    description: 'Run a live chat test or simulate scripted scenarios.',
    path: '/sandbox',
    icon: TestTube,
    tags: ['testing', 'simulation'],
  },
  {
    title: 'Alerts',
    description: 'Human escalations and SLA risks ready for triage.',
    path: '/alerts',
    icon: AlertCircle,
    tags: ['escalation', 'sla'],
  },
  {
    title: 'Team',
    description: 'Invite teammates, manage roles, and approvals.',
    path: '/team',
    icon: Users,
    tags: ['members', 'roles', 'permissions'],
  },
];

const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ open, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const results = useMemo(() => {
    if (!query) return searchIndex;
    const lowerQuery = query.toLowerCase();
    return searchIndex.filter((item) =>
      item.title.toLowerCase().includes(lowerQuery)
      || item.description.toLowerCase().includes(lowerQuery)
      || item.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)),
    );
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  const handleSelect = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      navigate(path);
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm flex items-start justify-center pt-24 px-4">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations, knowledge, categories, or teammates"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md">ESC</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
          {results.map((item) => (
            <button
              key={item.path}
              onClick={() => handleSelect(item.path)}
              className="w-full flex items-start gap-3 p-3 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition text-left"
            >
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{item.title}</p>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] px-2 py-1 rounded-full bg-muted text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}

          {results.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-6">
              No matches yet. Try searching for a conversation topic, policy, or teammate.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
