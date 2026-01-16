import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAccountContext } from '../context/AccountContext';
import ReactMarkdown from 'react-markdown';
import {
  conversationAPI,
  messageAPI,
  instagramAPI,
  instagramSyncAPI,
  tierAPI,
  TierSummaryResponse,
  Conversation,
  Message,
  InstagramAccount,
  AutomationSessionSummary,
} from '../services/api';
import {
  Send,
  Sparkles,
  Instagram,
  Loader2,
  Check,
  CheckCheck,
  ArrowLeft,
  Search,
  MessageSquare,
  PanelRightOpen,
  PanelRightClose,
  Paperclip,
  Clock3,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ImageAttachment, VideoAttachment, VoiceAttachment, LinkPreviewComponent, FileAttachment } from '../components/MessageMedia';
import { useDemoMode } from '../hooks/useDemoMode';

type InboxCacheEntry = {
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  selectedConversationId: string | null;
  instagramAccounts: InstagramAccount[];
  workspaceTier?: TierSummaryResponse['workspace'];
  updatedAt: number;
};

const inboxCache = new Map<string, InboxCacheEntry>();

const getInboxCacheKey = (workspaceId: string, accountId?: string | null) => (
  `${workspaceId}:${accountId || 'none'}`
);

const InboxSkeleton: React.FC = () => (
  <div className="h-full flex flex-col">
    <div className="flex h-full min-h-0 gap-3 md:gap-4">
      <div className="w-full md:w-[340px] lg:w-[360px] flex-shrink-0 flex flex-col rounded-xl border border-border glass-panel shadow-sm min-h-0">
        <div className="p-3 border-b border-border bg-background/50 rounded-t-xl space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-20" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-border/60">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`inbox-skeleton-${index}`} className="p-3 space-y-2">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col rounded-xl border border-border glass-panel shadow-sm min-h-0">
        <div className="px-4 md:px-5 py-3 border-b border-border bg-background/60 rounded-t-xl">
          <Skeleton className="h-5 w-44" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4">
          <div className="max-w-3xl mx-auto space-y-4">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-16 w-2/3 ml-auto" />
            <Skeleton className="h-16 w-4/5" />
            <Skeleton className="h-16 w-2/3 ml-auto" />
          </div>
        </div>
        <div className="px-4 md:px-5 py-3 border-t border-border bg-background/60 rounded-b-xl">
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  </div>
);

const Inbox: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const { activeAccount, accounts: accountContextList } = useAccountContext();
  const location = useLocation();
  const navigate = useNavigate();
  const { isDemoMode } = useDemoMode();
  const requestedConversationId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('conversationId');
  }, [location.search]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [instagramAccounts, setInstagramAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [workspaceTier, setWorkspaceTier] = useState<TierSummaryResponse['workspace']>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unreplied' | 'escalated'>('all');
  const [contextOpen, setContextOpen] = useState(false);
  const [draftSource, setDraftSource] = useState<'ai' | null>(null);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [automationSession, setAutomationSession] = useState<AutomationSessionSummary | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionAction, setSessionAction] = useState<'pause' | 'stop' | null>(null);
  const workspaceId = currentWorkspace?._id ?? null;
  const activeAccountId = activeAccount?._id ?? null;
  const selectedConversationId = selectedConversation?._id ?? null;
  const hasConnection = useMemo(
    () => accountContextList.length > 0 || isDemoMode,
    [accountContextList.length, isDemoMode],
  );
  const emptyStateTitle = hasConnection
    ? 'No conversations yet.'
    : 'Connect Instagram to start seeing DMs.';
  const emptyStateDescription = hasConnection
    ? 'When you connect your account, new messages will appear here.'
    : 'Finish setup on Home to start receiving messages.';

  const getCurrentCacheKey = () => (
    workspaceId ? getInboxCacheKey(workspaceId, activeAccountId) : null
  );

  const updateInboxCache = (updates: Partial<InboxCacheEntry>) => {
    const cacheKey = getCurrentCacheKey();
    if (!cacheKey) return;
    const prev = inboxCache.get(cacheKey);
    const next: InboxCacheEntry = {
      conversations: prev?.conversations || [],
      messagesByConversation: prev?.messagesByConversation || {},
      selectedConversationId: prev?.selectedConversationId || null,
      instagramAccounts: prev?.instagramAccounts || [],
      workspaceTier: prev?.workspaceTier,
      updatedAt: Date.now(),
      ...updates,
    };
    inboxCache.set(cacheKey, next);
  };

  const loadAutomationSession = async (options?: { silent?: boolean }) => {
    if (!selectedConversation?._id) {
      setAutomationSession(null);
      setSessionLoading(false);
      return;
    }
    const shouldShowLoading = !options?.silent && !automationSession;
    if (shouldShowLoading) {
      setSessionLoading(true);
    }
    try {
      const data = await conversationAPI.getAutomationSession(selectedConversation._id);
      setAutomationSession(data);
    } catch (error) {
      console.error('Error loading automation session:', error);
      if (!automationSession) {
        setAutomationSession(null);
      }
    } finally {
      if (shouldShowLoading) {
        setSessionLoading(false);
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (shouldAutoScroll && messages.length > previousMessageCount) {
      scrollToBottom();
    }
    setPreviousMessageCount(messages.length);
  }, [messages]);

  useEffect(() => {
    if (workspaceId) {
      const cacheKey = getInboxCacheKey(workspaceId, activeAccountId);
      const cached = inboxCache.get(cacheKey);
      if (cached) {
        setInstagramAccounts(cached.instagramAccounts);
        setWorkspaceTier(cached.workspaceTier);
        setConversations(cached.conversations);
        const requested = requestedConversationId
          ? cached.conversations.find((conv) => conv._id === requestedConversationId)
          : null;
        const cachedSelected = cached.selectedConversationId
          ? cached.conversations.find((conv) => conv._id === cached.selectedConversationId)
          : null;
        const nextSelected = requested || cachedSelected || cached.conversations[0] || null;
        setSelectedConversation(nextSelected);
        if (nextSelected) {
          setMessages(cached.messagesByConversation[nextSelected._id] || []);
        } else {
          setMessages([]);
        }
        setLoading(false);
      }
      loadData({ silent: Boolean(cached) });
    }
  }, [workspaceId, activeAccountId, requestedConversationId]);

  useEffect(() => {
    if (!workspaceId) return;
    const interval = setInterval(() => {
      loadConversations();
      if (selectedConversationId) {
        loadMessages();
        loadAutomationSession({ silent: true });
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [workspaceId, selectedConversationId, activeAccountId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram_connected') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      if (workspaceId) {
        loadData();
      }
    }
  }, [workspaceId, activeAccountId]);

  const loadData = async (options?: { silent?: boolean }) => {
    if (!workspaceId) return;
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      const [accountsData, conversationsData, tierData] = await Promise.all([
        instagramAPI.getByWorkspace(workspaceId),
        conversationAPI.getByWorkspace(workspaceId),
        tierAPI.getWorkspace(workspaceId),
      ]);

      setInstagramAccounts(accountsData || accountContextList || []);
      setWorkspaceTier(tierData);
      updateInboxCache({
        instagramAccounts: accountsData || accountContextList || [],
        workspaceTier: tierData,
      });

      if (!activeAccountId) {
        setConversations([]);
        setSelectedConversation(null);
        setMessages([]);
        updateInboxCache({
          conversations: [],
          selectedConversationId: null,
          messagesByConversation: {},
        });
        return;
      }

      const scopedConversations = (conversationsData || []).filter(
        (conv) => conv.instagramAccountId === activeAccountId,
      );

      setConversations(scopedConversations || []);
      const requested = requestedConversationId
        ? scopedConversations.find((conv) => conv._id === requestedConversationId)
        : null;
      const existingSelection = selectedConversation
        ? scopedConversations.find((conv) => conv._id === selectedConversation._id)
        : null;
      const nextSelected = requested || existingSelection || scopedConversations[0] || null;
      setSelectedConversation(nextSelected);
      updateInboxCache({
        conversations: scopedConversations || [],
        selectedConversationId: nextSelected?._id || null,
      });
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  const loadConversations = async () => {
    if (!workspaceId || !activeAccountId) return;
    try {
      const conversationsData = await conversationAPI.getByWorkspace(workspaceId);
      const scopedConversations = (conversationsData || []).filter(
        (conv) => conv.instagramAccountId === activeAccountId,
      );
      setConversations(scopedConversations || []);
      updateInboxCache({ conversations: scopedConversations || [] });
      if (selectedConversation && selectedConversation.instagramAccountId !== activeAccountId) {
        setSelectedConversation(null);
        updateInboxCache({ selectedConversationId: null });
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  useEffect(() => {
    if (!selectedConversationId) return;
    loadMessages();
    loadAutomationSession({ silent: true });
    setShouldAutoScroll(true);
  }, [selectedConversationId]);

  const loadMessages = async () => {
    if (!selectedConversationId) return;
    const conversationId = selectedConversationId;
    try {
      const data = await messageAPI.getByConversation(conversationId);
      setMessages((prevMessages) => {
        const cacheKey = getCurrentCacheKey();
        const previousMessageCache = cacheKey
          ? inboxCache.get(cacheKey)?.messagesByConversation
          : undefined;
        const nextMessages = prevMessages.length !== data.length
          ? data
          : data.map((newMsg, index) => {
            const prevMsg = prevMessages[index];
            if (prevMsg && prevMsg._id === newMsg._id) return newMsg;
            return newMsg;
          });
        updateInboxCache({
          messagesByConversation: {
            ...(previousMessageCache || {}),
            [conversationId]: nextMessages,
          },
          selectedConversationId: conversationId,
        });
        return nextMessages;
      });
      await messageAPI.markSeen(conversationId);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    if (!selectedConversation._id) {
      alert('Please wait while the conversation loads...');
      return;
    }

    setSendingMessage(true);
    try {
      const message = await instagramSyncAPI.sendMessage(selectedConversation._id, newMessage);
      setMessages((prev) => {
        const cacheKey = getCurrentCacheKey();
        const previousMessageCache = cacheKey
          ? inboxCache.get(cacheKey)?.messagesByConversation
          : undefined;
        const next = [...prev, message];
        if (selectedConversation) {
          updateInboxCache({
            messagesByConversation: {
              ...(previousMessageCache || {}),
              [selectedConversation._id]: next,
            },
            selectedConversationId: selectedConversation._id,
          });
        }
        return next;
      });
      setNewMessage('');
      setDraftSource(null);
      setShouldAutoScroll(true);
      setTimeout(scrollToBottom, 100);
      loadAutomationSession({ silent: true });
    } catch (error: any) {
      console.error('Error sending message:', error);
      alert(error.response?.data?.error || 'Failed to send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleGenerateAIReply = async () => {
    if (!selectedConversation || !selectedConversation._id) return;
    setGeneratingAI(true);
    try {
      const message = await messageAPI.generateAIReply(selectedConversation._id);
      setNewMessage(message.text || '');
      setDraftSource('ai');
      loadAutomationSession({ silent: true });
    } catch (error) {
      console.error('Error generating AI reply:', error);
      alert('Failed to generate AI reply. Please try again.');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handlePauseSession = async () => {
    if (!selectedConversation?._id) return;
    setSessionAction('pause');
    try {
      await conversationAPI.pauseAutomationSession(selectedConversation._id, 'manual_pause');
      await loadAutomationSession({ silent: true });
    } catch (error) {
      console.error('Error pausing automation session:', error);
      alert('Failed to pause automation session.');
    } finally {
      setSessionAction(null);
    }
  };

  const handleStopSession = async () => {
    if (!selectedConversation?._id) return;
    if (!window.confirm('Stop the active automation session?')) return;
    setSessionAction('stop');
    try {
      await conversationAPI.stopAutomationSession(selectedConversation._id, 'manual_stop');
      await loadAutomationSession({ silent: true });
    } catch (error) {
      console.error('Error stopping automation session:', error);
      alert('Failed to stop automation session.');
    } finally {
      setSessionAction(null);
    }
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  const getInitials = (name?: string, handle?: string) => {
    const base = (name || handle || '').replace('@', '').trim();
    if (!base) return 'IG';
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  const getSessionStatusMeta = (status?: string) => {
    if (!status) {
      return { label: 'Inactive', className: 'bg-muted text-muted-foreground' };
    }
    if (status === 'active') {
      return { label: 'Active', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100' };
    }
    if (status === 'paused') {
      return { label: 'Paused', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-100' };
    }
    if (status === 'handoff') {
      return { label: 'Handoff', className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100' };
    }
    return { label: status, className: 'bg-muted text-muted-foreground' };
  };

  const session = automationSession?.session;
  const sessionMeta = getSessionStatusMeta(session?.status);
  const sessionInstanceName = automationSession?.instance?.name;
  const sessionTemplateName = automationSession?.template?.name;
  const sessionVersionLabel = automationSession?.version?.versionLabel;
  const sessionVersionNumber = automationSession?.version?.version;
  const sessionNode = automationSession?.currentNode;
  const sessionVars = session?.state?.vars && typeof session.state.vars === 'object'
    ? session.state.vars
    : undefined;
  const detectedIntent = typeof sessionVars?.detectedIntent === 'string'
    ? sessionVars.detectedIntent
    : undefined;
  const agentStep = typeof sessionVars?.agentStep === 'string' ? sessionVars.agentStep : undefined;
  const agentStepIndex = typeof sessionVars?.agentStepIndex === 'number' ? sessionVars.agentStepIndex : undefined;
  const agentStepCount = typeof sessionVars?.agentStepCount === 'number' ? sessionVars.agentStepCount : undefined;
  const agentQuestionsAsked = typeof sessionVars?.agentQuestionsAsked === 'number'
    ? sessionVars.agentQuestionsAsked
    : undefined;
  const agentProgress = typeof agentStepIndex === 'number'
    ? `${agentStepIndex + 1}${typeof agentStepCount === 'number' ? `/${agentStepCount}` : ''}`
    : undefined;
  const agentMissingSlots = Array.isArray(sessionVars?.agentMissingSlots)
    ? sessionVars.agentMissingSlots.filter((slot) => typeof slot === 'string' && slot.trim())
    : [];
  const conversationConnectedAt = useMemo(() => {
    if (!selectedConversation) return null;
    const account = instagramAccounts.find((acc) => acc._id === selectedConversation.instagramAccountId);
    return account?.createdAt ? new Date(account.createdAt) : null;
  }, [instagramAccounts, selectedConversation]);

  const handleConnectInstagram = async () => {
    if (!currentWorkspace) return;
    const igLimit = workspaceTier?.limits?.instagramAccounts;
    const igUsed = workspaceTier?.usage?.instagramAccounts || 0;
    if (typeof igLimit === 'number' && igUsed >= igLimit) {
      alert('Instagram account limit reached for your plan.');
      return;
    }
    try {
      setLoading(true);
      const { authUrl } = await instagramAPI.getAuthUrl(currentWorkspace._id);
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating Instagram connection:', error);
      alert('Failed to connect Instagram. Please try again.');
      setLoading(false);
    }
  };

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return conversations.filter((conv) => {
      const matchesSearch =
        !term ||
        conv.participantName.toLowerCase().includes(term) ||
        conv.participantHandle.toLowerCase().includes(term) ||
        (conv.lastMessage || '').toLowerCase().includes(term);

      const isEscalated = Boolean(conv.humanRequired);
      const lastCustomerAt = conv.lastCustomerMessageAt ? new Date(conv.lastCustomerMessageAt).getTime() : 0;
      const lastBusinessAt = conv.lastBusinessMessageAt ? new Date(conv.lastBusinessMessageAt).getTime() : 0;
      const isUnreplied = lastCustomerAt > lastBusinessAt || isEscalated;

      if (!matchesSearch) return false;
      if (activeFilter === 'escalated') return isEscalated;
      if (activeFilter === 'unreplied') return isUnreplied;
      return true;
    });
  }, [activeFilter, conversations, searchTerm]);

  // Render Loading
  if (loading) {
    return <InboxSkeleton />;
  }

  // Render Connect State
  if (instagramAccounts.length === 0) {
    const igLimit = workspaceTier?.limits?.instagramAccounts;
    const igUsed = workspaceTier?.usage?.instagramAccounts || 0;
    const igLimitReached = typeof igLimit === 'number' ? igUsed >= igLimit : false;
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md glass-panel p-8 rounded-2xl animate-fade-in">
          <div className="bg-gradient-primary w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-glow">
            <Instagram className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Connect Your Instagram</h2>
          <p className="text-slate-400 mb-8">
            Connect your Instagram Business account to start managing DMs with AI superpowers.
          </p>
          {igLimitReached && (
            <div className="mb-4 text-sm text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              Instagram account limit reached ({igUsed}/{igLimit}). Upgrade the owner&apos;s tier to connect another account.
            </div>
          )}
          <Button
            onClick={handleConnectInstagram}
            disabled={loading || igLimitReached}
            className="w-full"
            size="lg"
            leftIcon={<Instagram className="w-5 h-5" />}
          >
            {igLimitReached ? 'Limit reached' : loading ? 'Connecting...' : 'Connect Instagram Account'}
          </Button>
        </div>
      </div>
    );
  }

  // Render Main Inbox
  return (
    <div className="h-full flex flex-col">
        <div className="flex h-full min-h-0 gap-3 md:gap-4">
          {/* Conversation List */}
          <div
            className={`w-full md:w-[340px] lg:w-[360px] flex-shrink-0 flex flex-col rounded-xl border border-border glass-panel shadow-sm min-h-0 ${selectedConversation ? 'hidden md:flex' : 'flex'}`}
          >
            <div className="p-3 border-b border-border bg-background/50 rounded-t-xl">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold leading-tight text-foreground">Inbox</h2>
                  <p className="text-xs text-muted-foreground truncate">{instagramAccounts?.[0]?.username}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3 overflow-x-auto">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'unreplied', label: 'Unreplied' },
                  { key: 'escalated', label: 'Escalated' },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setActiveFilter(filter.key as 'all' | 'unreplied' | 'escalated')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${activeFilter === filter.key
                      ? 'bg-primary/10 text-primary border-primary/40'
                      : 'text-muted-foreground border-border hover:text-foreground hover:border-primary/40'
                      }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search conversations"
                  className="w-full bg-secondary/50 border border-input rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-border/60">
              {filteredConversations.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3">
                  <MessageSquare className="w-8 h-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{emptyStateTitle}</p>
                    <p className="text-xs text-muted-foreground mt-1">{emptyStateDescription}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate('/home')}
                  >
                    Go to Home to finish setup
                  </Button>
                </div>
              )}

              {filteredConversations.map((conv) => (
                <div
                  key={conv._id || conv.instagramConversationId}
                  onClick={() => setSelectedConversation(conv)}
                  className={`p-3 cursor-pointer transition-all duration-200 ${selectedConversation?._id === conv._id || selectedConversation?.instagramConversationId === conv.instagramConversationId
                    ? 'bg-primary/5 border-l-2 border-l-primary'
                    : 'hover:bg-muted/60 border-l-2 border-l-transparent'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center text-xs font-semibold text-muted-foreground overflow-hidden flex-shrink-0">
                        {conv.participantProfilePictureUrl ? (
                          <img
                            src={conv.participantProfilePictureUrl}
                            alt={conv.participantName || 'Instagram user'}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span>{getInitials(conv.participantName, conv.participantHandle)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-sm font-semibold truncate text-foreground">{conv.participantName}</h3>
                          <span className="text-xs text-muted-foreground truncate">{conv.participantHandle}</span>
                        </div>
                        {conv.lastMessage && (
                          <p className="text-xs text-muted-foreground truncate mt-1">{conv.lastMessage}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {conv.humanRequired && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100">
                              Escalated
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap mt-0.5">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Area */}
          <div
            className={`flex-1 flex flex-col rounded-xl border border-border glass-panel shadow-sm min-h-0 ${selectedConversation ? 'flex' : 'hidden md:flex'}`}
          >
            {selectedConversation ? (
              <>
                <div className="px-4 md:px-5 py-3 border-b border-border bg-background/60 flex items-center justify-between gap-3 rounded-t-xl">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => setSelectedConversation(null)}
                      className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center text-xs font-semibold text-muted-foreground overflow-hidden flex-shrink-0">
                      {selectedConversation.participantProfilePictureUrl ? (
                        <img
                          src={selectedConversation.participantProfilePictureUrl}
                          alt={selectedConversation.participantName || 'Instagram user'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span>{getInitials(selectedConversation.participantName, selectedConversation.participantHandle)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-base md:text-lg leading-tight text-foreground truncate">
                        {selectedConversation.participantName}
                      </h2>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span>{selectedConversation.participantHandle}</span>
                        {selectedConversation.humanRequired && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100">
                            Escalated
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hidden lg:inline-flex text-muted-foreground hover:text-foreground"
                      onClick={() => setContextOpen((prev) => !prev)}
                      leftIcon={contextOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                    >
                      Context
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-5 py-4 custom-scrollbar">
                  <div className="max-w-3xl mx-auto space-y-3">
                    {messages.map((msg) => {
                      const isHistorical = Boolean(
                        conversationConnectedAt &&
                        msg.createdAt &&
                        new Date(msg.createdAt).getTime() < conversationConnectedAt.getTime(),
                      );
                      return (
                        <div
                          key={msg._id}
                          className={`flex ${msg.from === 'customer' ? 'justify-start' : 'justify-end'}`}
                        >
                          <div className={`relative max-w-[85%] md:max-w-2xl group ${isHistorical ? 'opacity-60 grayscale' : ''}`}>
                            <div
                              className={`px-3.5 py-3 rounded-xl text-sm leading-relaxed shadow-sm ${msg.from === 'customer'
                                ? 'bg-secondary text-foreground border border-border'
                                : msg.from === 'ai'
                                  ? 'bg-primary text-primary-foreground shadow-md'
                                  : 'bg-primary text-primary-foreground shadow-md'
                                }`}
                            >
                              {msg.from === 'ai' && (
                                <div className="flex items-center gap-1.5 mb-1.5 text-muted/80 text-[11px] font-semibold uppercase tracking-wide">
                                  <Sparkles className="w-3 h-3" />
                                  <span>AI Assistant</span>
                                </div>
                              )}

                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="space-y-2 mb-2">
                                  {msg.attachments.map((attachment, index) => (
                                    <div key={index}>
                                      {attachment.type === 'image' && <ImageAttachment attachment={attachment} />}
                                      {attachment.type === 'video' && <VideoAttachment attachment={attachment} />}
                                      {(attachment.type === 'audio' || attachment.type === 'voice') && <VoiceAttachment attachment={attachment} />}
                                      {attachment.type === 'file' && <FileAttachment attachment={attachment} />}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {msg.linkPreview && (
                                <div className="mb-2">
                                  <LinkPreviewComponent linkPreview={msg.linkPreview} />
                                </div>
                              )}

                              {msg.text && (
                                <ReactMarkdown
                                  className="prose prose-invert prose-sm max-w-none text-sm leading-relaxed [&>*]:my-2 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                                >
                                  {msg.text}
                                </ReactMarkdown>
                              )}

                              <div
                                className={`flex items-center justify-end gap-1.5 mt-1.5 text-[11px] ${msg.from === 'customer' ? 'text-muted-foreground' : 'text-primary-foreground/80'
                                  }`}
                              >
                                <span>{formatTime(msg.createdAt)}</span>
                                {msg.from !== 'customer' && (
                                  <span title={msg.seenAt ? 'Seen' : 'Sent'}>
                                    {msg.seenAt ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                                  </span>
                                )}
                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                <div className="px-4 md:px-5 py-3 border-t border-border bg-background/60 rounded-b-xl">
                  <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">AI auto-replies</span>
                      <button
                        type="button"
                        onClick={() => setAutoReplyEnabled((prev) => !prev)}
                        className={`px-2.5 py-1 rounded-full border text-[11px] font-medium transition ${autoReplyEnabled ? 'bg-primary/10 text-primary border-primary/40' : 'text-muted-foreground border-border'
                          }`}
                      >
                        {autoReplyEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
                    {draftSource === 'ai' && <span className="text-[11px] text-primary">AI draft ready to edit</span>}
                  </div>

                  <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                    <button
                      type="button"
                      className="w-10 h-10 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/60 flex items-center justify-center"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="w-full bg-secondary/50 border border-input rounded-lg px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={generatingAI || !selectedConversation}
                      onClick={handleGenerateAIReply}
                      leftIcon={generatingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      className="h-11 px-4"
                    >
                      {generatingAI ? 'Thinking' : 'Generate'}
                    </Button>
                    <Button
                      type="submit"
                      disabled={sendingMessage || !newMessage.trim()}
                      isLoading={sendingMessage}
                      className="h-11 px-5"
                      leftIcon={!sendingMessage ? <Send className="w-4 h-4" /> : undefined}
                    >
                      Send
                    </Button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-lg font-medium">Select a conversation to start chatting</p>
              </div>
            )}
          </div>

          {/* Context Drawer */}
          {contextOpen && selectedConversation && (
            <aside className="hidden lg:flex w-[320px] flex-shrink-0 flex-col rounded-xl border border-border glass-panel shadow-sm min-h-0 p-4 gap-4 overflow-hidden">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Context</h3>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setContextOpen(false)}
                >
                  Collapse
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                <div className="space-y-3">
                  <div className="p-3 rounded-lg border border-border/70 bg-background/70">
                    <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                      <span>Automation session</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sessionMeta.className}`}>
                        {sessionMeta.label}
                      </span>
                    </div>
                  {session ? (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>
                        Instance:{' '}
                        <span className="text-foreground">{sessionInstanceName || session.automationInstanceId}</span>
                      </div>
                      {sessionTemplateName && (
                        <div>
                          Template: <span className="text-foreground">{sessionTemplateName}</span>
                        </div>
                      )}
                      {(sessionVersionLabel || sessionVersionNumber) && (
                        <div>
                          Version:{' '}
                          <span className="text-foreground">
                            {sessionVersionLabel || `v${sessionVersionNumber}`}
                          </span>
                        </div>
                      )}
                      {session.state?.nodeId && (
                        <div>
                          Node: <span className="text-foreground">{session.state.nodeId}</span>
                        </div>
                      )}
                      {typeof session.state?.stepIndex === 'number' && (
                        <div>
                          Step: <span className="text-foreground">{session.state.stepIndex + 1}</span>
                        </div>
                      )}
                      {session.state?.vars && (
                        <div>
                          Vars:{' '}
                          <span className="text-foreground">{Object.keys(session.state.vars || {}).length}</span>
                        </div>
                      )}
                      {detectedIntent && (
                        <div>
                          Detected intent: <span className="text-foreground">{detectedIntent}</span>
                        </div>
                      )}
                      {agentProgress && (
                        <div>
                          Agent progress: <span className="text-foreground">{agentProgress}</span>
                        </div>
                      )}
                      {agentStep && (
                        <div>
                          Agent step: <span className="text-foreground">{agentStep}</span>
                        </div>
                      )}
                      {typeof agentQuestionsAsked === 'number' && (
                        <div>
                          Questions asked: <span className="text-foreground">{agentQuestionsAsked}</span>
                        </div>
                      )}
                      {agentMissingSlots.length > 0 && (
                        <div>
                          Missing slots: <span className="text-foreground">{agentMissingSlots.join(', ')}</span>
                        </div>
                      )}
                      {session.lastAutomationMessageAt && (
                        <div>
                          Last automation: <span className="text-foreground">{formatTime(session.lastAutomationMessageAt)}</span>
                        </div>
                      )}
                      {session.pausedAt && (
                        <div>
                          Paused: <span className="text-foreground">{formatTime(session.pausedAt)}</span>
                        </div>
                      )}
                      {session.pauseReason && (
                        <div>
                          Reason: <span className="text-foreground">{session.pauseReason}</span>
                        </div>
                      )}
                      {sessionNode && (
                        <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-2 py-2 space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                            <span>Current node</span>
                            <span className="text-muted-foreground">{sessionNode.label || sessionNode.type}</span>
                          </div>
                          <div>
                            ID: <span className="text-foreground">{sessionNode.id}</span>
                          </div>
                          <div>
                            Type: <span className="text-foreground">{sessionNode.type}</span>
                          </div>
                          {sessionNode.preview && (
                            <div className="text-foreground">{sessionNode.preview}</div>
                          )}
                          {sessionNode.summary?.map((item, index) => (
                            <div key={`${item.label}-${index}`}>
                              {item.label}: <span className="text-foreground">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">No active session.</p>
                  )}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        className="h-9"
                        disabled={!session || session.status !== 'active' || sessionAction === 'pause' || sessionLoading}
                        onClick={handlePauseSession}
                      >
                        {sessionAction === 'pause' ? 'Pausing...' : 'Pause'}
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-9"
                        disabled={!session || sessionAction === 'stop' || sessionLoading}
                        onClick={handleStopSession}
                      >
                        {sessionAction === 'stop' ? 'Stopping...' : 'Stop'}
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-border/70 bg-background/70 space-y-2">
                    <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                      <span>Escalation</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${selectedConversation.humanRequired
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100'
                        }`}>
                        {selectedConversation.humanRequired ? 'Open' : 'Clear'}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">Reason: {selectedConversation.humanRequiredReason || 'Not escalated'}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="w-4 h-4" />
                      <span>SLA timer: 15m</span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
    </div>
  );
};

export default Inbox;
