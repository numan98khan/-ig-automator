import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAccountContext } from '../context/AccountContext';
import {
  conversationAPI,
  messageAPI,
  instagramAPI,
  instagramSyncAPI,
  categoriesAPI,
  Conversation,
  Message,
  InstagramAccount,
  MessageCategory,
} from '../services/api';
import {
  Send,
  Sparkles,
  Instagram,
  Loader2,
  RefreshCw,
  Tag,
  Check,
  CheckCheck,
  ArrowLeft,
  MoreVertical,
  Search,
  MessageSquare,
  PanelRightOpen,
  PanelRightClose,
  Paperclip,
  AlertTriangle,
  Clock3,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ImageAttachment, VideoAttachment, VoiceAttachment, LinkPreviewComponent, FileAttachment } from '../components/MessageMedia';

const Inbox: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const { activeAccount, accounts: accountContextList } = useAccountContext();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [instagramAccounts, setInstagramAccounts] = useState<InstagramAccount[]>([]);
  const [categories, setCategories] = useState<MessageCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [previousMessageCount, setPreviousMessageCount] = useState(0);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unreplied' | 'escalated' | 'highIntent'>('all');
  const [contextOpen, setContextOpen] = useState(false);
  const [draftSource, setDraftSource] = useState<'ai' | null>(null);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);

  const lastMessage = useMemo(() => messages[messages.length - 1], [messages]);
  const lastSpeaker = lastMessage?.from;
  const hasAgentSent = useMemo(() => messages.some((msg) => msg.from !== 'customer'), [messages]);
  const hasAiDraft = draftSource === 'ai';

  const roleChips = useMemo(() => {
    const chips: { label: string; tone: 'neutral' | 'brand' | 'muted' }[] = [];

    if (lastSpeaker === 'customer') {
      chips.push({ label: 'Customer', tone: 'neutral' });
    }

    if (hasAiDraft) {
      chips.push({ label: 'AI Draft', tone: 'muted' });
    } else if (lastSpeaker && lastSpeaker !== 'customer') {
      chips.push({ label: 'Sent', tone: 'brand' });
    } else if (hasAgentSent) {
      chips.push({ label: 'Sent', tone: 'brand' });
    }

    return chips;
  }, [hasAgentSent, hasAiDraft, lastSpeaker]);

  const getInitial = (name?: string) => name?.trim()?.[0]?.toUpperCase() || 'C';

  const lastMessage = useMemo(() => messages[messages.length - 1], [messages]);
  const lastSpeaker = lastMessage?.from;
  const hasAgentSent = useMemo(() => messages.some((msg) => msg.from !== 'customer'), [messages]);
  const hasAiDraft = draftSource === 'ai';

  const handleSyncConversation = async () => {
    if (!selectedConversation || !selectedConversation.instagramConversationId) return;

    setSyncing(true);
    try {
      await instagramSyncAPI.syncMessages(currentWorkspace?._id || '', selectedConversation.instagramConversationId);
      await loadConversations();
      const updatedConversations = await conversationAPI.getByWorkspace(currentWorkspace?._id || '');
      const syncedConv = updatedConversations.find(c => c.instagramConversationId === selectedConversation.instagramConversationId);

      if (syncedConv) {
        setSelectedConversation(syncedConv);
        await loadMessages();
      }
    } catch (error) {
      console.error('Error syncing individual conversation:', error);
      alert('Failed to sync messages. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncAll = async () => {
    if (!currentWorkspace) return;

    setSyncingAll(true);
    try {
      await instagramSyncAPI.syncMessages(currentWorkspace._id);
      await loadConversations();
      // alert('All conversations synced successfully!'); // Removed alert for cleaner UX
    } catch (error) {
      console.error('Error syncing all conversations:', error);
      alert('Failed to sync all conversations. Please try again.');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleCategoryChange = async (messageId: string, categoryId: string) => {
    try {
      await messageAPI.updateCategory(messageId, categoryId);
      await loadMessages();
      await loadConversations();
      setCategoryDropdownOpen(null);
    } catch (error) {
      console.error('Error updating category:', error);
      alert('Failed to update category. Please try again.');
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
    if (currentWorkspace) {
      loadData();
    }
  }, [currentWorkspace, activeAccount]);

  useEffect(() => {
    if (!currentWorkspace) return;
    const interval = setInterval(() => {
      loadConversations();
      if (selectedConversation) {
        loadMessages();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentWorkspace, selectedConversation, activeAccount]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setCategoryDropdownOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram_connected') === 'true') {
      window.history.replaceState({}, '', window.location.pathname);
      if (currentWorkspace) {
        loadData();
      }
    }
  }, [currentWorkspace, activeAccount]);

  const loadData = async () => {
    if (!currentWorkspace) return;
    try {
      setLoading(true);
      const [accountsData, conversationsData, categoriesData] = await Promise.all([
        instagramAPI.getByWorkspace(currentWorkspace._id),
        conversationAPI.getByWorkspace(currentWorkspace._id),
        categoriesAPI.getByWorkspace(currentWorkspace._id),
      ]);

      setInstagramAccounts(accountsData || accountContextList || []);
      setCategories(categoriesData || []);

      if (!activeAccount) {
        setConversations([]);
        setSelectedConversation(null);
        return;
      }

      const scopedConversations = (conversationsData || []).filter(
        (conv) => conv.instagramAccountId === activeAccount._id,
      );

      const connectedAccount = accountsData?.find((acc) => acc._id === activeAccount._id && acc.status === 'connected');
      if (connectedAccount && scopedConversations.length === 0) {
        try {
          await instagramSyncAPI.syncMessages(currentWorkspace._id);
          const updatedConversations = await conversationAPI.getByWorkspace(currentWorkspace._id);
          const filteredUpdated = (updatedConversations || []).filter(
            (conv) => conv.instagramAccountId === activeAccount._id,
          );
          setConversations(filteredUpdated || []);
          if (filteredUpdated && filteredUpdated.length > 0 && !selectedConversation) {
            setSelectedConversation(filteredUpdated[0]);
          } else if (filteredUpdated.length === 0) {
            setSelectedConversation(null);
          }
        } catch (syncError) {
          console.error('❌ Error syncing Instagram messages:', syncError);
          setConversations(scopedConversations || []);
        }
      } else {
        setConversations(scopedConversations || []);
        if (scopedConversations && scopedConversations.length > 0 && !selectedConversation) {
          setSelectedConversation(scopedConversations[0]);
        } else if (scopedConversations.length === 0) {
          setSelectedConversation(null);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async () => {
    if (!currentWorkspace || !activeAccount) return;
    try {
      const conversationsData = await conversationAPI.getByWorkspace(currentWorkspace._id);
      const scopedConversations = (conversationsData || []).filter(
        (conv) => conv.instagramAccountId === activeAccount._id,
      );
      setConversations(scopedConversations || []);
      if (selectedConversation && selectedConversation.instagramAccountId !== activeAccount._id) {
        setSelectedConversation(null);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  useEffect(() => {
    if (selectedConversation) {
      if (!selectedConversation.isSynced && selectedConversation.instagramConversationId) {
        handleSyncConversation();
      } else {
        loadMessages();
      }
      setShouldAutoScroll(true);
    }
  }, [selectedConversation]);

  const loadMessages = async () => {
    if (!selectedConversation || !selectedConversation._id) return;
    try {
      const data = await messageAPI.getByConversation(selectedConversation._id);
      setMessages(prevMessages => {
        if (prevMessages.length !== data.length) return data;
        return data.map((newMsg, index) => {
          const prevMsg = prevMessages[index];
          if (prevMsg && prevMsg._id === newMsg._id) return newMsg;
          return newMsg;
        });
      });
      await messageAPI.markSeen(selectedConversation._id);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    if (!selectedConversation._id) {
      alert('Please wait while the conversation syncs...');
      return;
    }

    setSendingMessage(true);
    try {
      const message = await instagramSyncAPI.sendMessage(selectedConversation._id, newMessage);
      setMessages([...messages, message]);
      setNewMessage('');
      setDraftSource(null);
      setShouldAutoScroll(true);
      setTimeout(scrollToBottom, 100);
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
    } catch (error) {
      console.error('Error generating AI reply:', error);
      alert('Failed to generate AI reply. Please try again.');
    } finally {
      setGeneratingAI(false);
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

  const handleConnectInstagram = async () => {
    if (!currentWorkspace) return;
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

  const hasUnsynced = useMemo(() => conversations.some((conv) => !conv.isSynced), [conversations]);

  const filteredConversations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return conversations.filter((conv) => {
      const matchesSearch =
        !term ||
        conv.participantName.toLowerCase().includes(term) ||
        conv.participantHandle.toLowerCase().includes(term) ||
        (conv.lastMessage || '').toLowerCase().includes(term);

      const isEscalated = Boolean(conv.humanRequired);
      const isHighIntent = conv.categoryName ? /lead|booking|order|purchase|pricing/i.test(conv.categoryName) : false;
      const isUnreplied = !conv.isSynced || isEscalated;

      if (!matchesSearch) return false;
      if (activeFilter === 'escalated') return isEscalated;
      if (activeFilter === 'highIntent') return isHighIntent;
      if (activeFilter === 'unreplied') return isUnreplied;
      return true;
    });
  }, [activeFilter, conversations, searchTerm]);

  // Render Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Render Connect State
  if (instagramAccounts.length === 0) {
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
          <Button
            onClick={handleConnectInstagram}
            disabled={loading}
            className="w-full"
            size="lg"
            leftIcon={<Instagram className="w-5 h-5" />}
          >
            {loading ? 'Connecting...' : 'Connect Instagram Account'}
          </Button>
        </div>
      </div>
    );
  }

  // Render Main Inbox
  return (
    <div className="h-full">
      <div className="max-w-[1400px] mx-auto h-full flex flex-col">
        <div className="flex h-full min-h-0 gap-3 md:gap-4 px-0">
          {/* Conversation List */}
          <div
            className={`w-full md:w-[340px] lg:w-[360px] flex-shrink-0 flex flex-col rounded-xl border border-border glass-panel shadow-sm min-h-0 ${selectedConversation ? 'hidden md:flex' : 'flex'}`}
          >
            <div className="p-3 border-b border-border bg-background/50">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold leading-tight text-foreground">Inbox</h2>
                  <p className="text-xs text-muted-foreground truncate">@{instagramAccounts?.[0]?.username}</p>
                </div>
                {hasUnsynced && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSyncAll}
                    disabled={syncingAll}
                    isLoading={syncingAll}
                    className="h-8 border border-border bg-background text-foreground hover:bg-muted/70"
                    leftIcon={!syncingAll ? <RefreshCw className="w-3.5 h-3.5" /> : undefined}
                  >
                    Sync
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2 mb-3 overflow-x-auto">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'unreplied', label: 'Unreplied' },
                  { key: 'escalated', label: 'Escalated' },
                  { key: 'highIntent', label: 'High intent' },
                ].map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setActiveFilter(filter.key as 'all' | 'unreplied' | 'escalated' | 'highIntent')}
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
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-6 text-center">
                  No conversations found.
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
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-sm font-semibold truncate text-foreground">{conv.participantName}</h3>
                        <span className="text-xs text-muted-foreground truncate">@{conv.participantHandle}</span>
                      </div>
                      {conv.lastMessage && (
                        <p className="text-xs text-muted-foreground truncate mt-1">{conv.lastMessage}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {!conv.isSynced && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-100 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Needs sync
                          </span>
                        )}
                        {conv.humanRequired && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100">
                            Escalated
                          </span>
                        )}
                        {conv.categoryName && (
                          <Badge variant="primary" className="text-[11px] py-0 px-2 rounded-full">
                            {conv.categoryName}
                          </Badge>
                        )}
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
                <div className="px-4 md:px-5 py-3 border-b border-border bg-background/60 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => setSelectedConversation(null)}
                      className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-base md:text-lg leading-tight text-foreground truncate">
                        {selectedConversation.participantName}
                      </h2>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                        <span>@{selectedConversation.participantHandle}</span>
                        {selectedConversation.categoryName && (
                          <Badge variant="secondary" className="text-[11px] px-2 py-0 rounded-full">
                            {selectedConversation.categoryName}
                          </Badge>
                        )}
                        {selectedConversation.humanRequired && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-100">
                            Escalated
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {roleChips.map((chip) => (
                          <span
                            key={chip.label}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                              chip.tone === 'brand'
                                ? 'bg-primary/10 text-primary border-primary/30'
                                : chip.tone === 'muted'
                                  ? 'bg-muted/70 text-foreground border-border/70'
                                  : 'bg-secondary text-foreground border-border'
                            }`}
                          >
                            {chip.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!selectedConversation.isSynced && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleSyncConversation}
                        isLoading={syncing}
                        className="text-muted-foreground hover:text-foreground"
                        leftIcon={!syncing ? <RefreshCw className="w-4 h-4" /> : undefined}
                      >
                        Sync
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
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
                      const isCustomer = msg.from === 'customer';
                      const isAI = msg.from === 'ai';
                      const bubbleBase = isCustomer
                        ? 'bg-secondary text-foreground border border-border'
                        : isAI
                          ? 'bg-primary/12 text-foreground border border-primary/30'
                          : 'bg-primary text-primary-foreground shadow-md';
                      const bubbleWidth = isCustomer ? 'max-w-[82%] md:max-w-2xl' : 'max-w-[76%] md:max-w-[70%]';

                      return (
                        <div
                          key={msg._id}
                          className={`flex items-start gap-2 ${isCustomer ? 'justify-start' : 'justify-end flex-row-reverse'}`}
                          onMouseEnter={() => isCustomer && setHoveredMessageId(msg._id)}
                          onMouseLeave={() => setHoveredMessageId(null)}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                              isCustomer
                                ? 'bg-secondary text-foreground border border-border'
                                : isAI
                                  ? 'bg-primary/15 text-primary border border-primary/30'
                                  : 'bg-primary text-primary-foreground shadow-sm'
                            }`}
                            aria-hidden
                          >
                            {isAI ? <Sparkles className="w-4 h-4" /> : getInitial(isCustomer ? selectedConversation?.participantName : 'You')}
                          </div>
                          <div className={`relative ${bubbleWidth} group`}>
                            <div className={`px-3.5 py-3 rounded-xl text-sm leading-relaxed ${bubbleBase}`}>
                              {isAI && (
                                <div className="flex items-center gap-1.5 mb-1.5 text-primary font-semibold text-[11px] uppercase tracking-wide">
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

                              {msg.text && <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>}

                              <div
                                className={`flex items-center justify-end gap-1.5 mt-1.5 text-[11px] ${isCustomer ? 'text-muted-foreground' : isAI ? 'text-primary' : 'text-primary-foreground/85'
                                  }`}
                              >
                                <span>{formatTime(msg.createdAt)}</span>
                                {!isCustomer && (
                                  <span title={msg.seenAt ? 'Seen' : 'Sent'}>
                                    {msg.seenAt ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                                  </span>
                                )}
                              </div>
                            </div>

                            {isCustomer && hoveredMessageId === msg._id && !categoryDropdownOpen && (
                              <div className="absolute left-0 -bottom-9 animate-fade-in z-10">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="text-xs h-7 px-2.5 bg-background border-border"
                                  onClick={() => setCategoryDropdownOpen(msg._id)}
                                  leftIcon={<Tag className="w-3.5 h-3.5" />}
                                >
                                  {msg.categoryId?.nameEn || 'Categorize'}
                                </Button>
                              </div>
                            )}

                            {categoryDropdownOpen === msg._id && (
                              <div
                                ref={categoryDropdownRef}
                                className="absolute left-0 top-full mt-2 z-20 bg-card border border-border rounded-lg py-1 min-w-[200px] max-h-60 overflow-y-auto animate-fade-in shadow-lg"
                              >
                                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border uppercase tracking-wider">
                                  Select Category
                                </div>
                                {categories.map((cat) => (
                                  <button
                                    key={cat._id}
                                    onClick={() => handleCategoryChange(msg._id, cat._id)}
                                    className={`w-full text-left px-3 py-2 text-sm transition hover:bg-muted/50 ${msg.categoryId?._id === cat._id ? 'text-primary font-medium bg-primary/5' : 'text-foreground'
                                      }`}
                                  >
                                    {cat.nameEn}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                <div className="px-4 md:px-5 py-3 border-t border-border bg-background/60">
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
            <aside className="hidden lg:flex w-[320px] flex-shrink-0 flex-col rounded-xl border border-border glass-panel shadow-sm min-h-0 p-4 gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Context</h3>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setContextOpen(false)}
                >
                  Collapse
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-lg border border-border/70 bg-background/70">
                  <p className="text-xs text-muted-foreground">AI status</p>
                  <div className="mt-1 flex items-center justify-between text-sm font-medium text-foreground">
                    <span>{autoReplyEnabled ? 'Auto-reply on' : 'Auto-reply paused'}</span>
                    <span className="text-xs text-muted-foreground">Assist mode</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg border border-border/70 bg-background/70 space-y-1">
                  <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                    <span>Category</span>
                    {selectedConversation.categoryName ? (
                      <Badge variant="secondary" className="text-[11px] px-2 py-0 rounded-full">
                        {selectedConversation.categoryName}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unassigned</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Confidence: high</p>
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

                <div className="p-3 rounded-lg border border-border/70 bg-background/70 space-y-2">
                  <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                    <span>Knowledge used</span>
                    <span className="text-xs text-muted-foreground">Recent</span>
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {selectedConversation.categoryName ? (
                      <li className="px-2 py-1 rounded-md bg-muted/50 text-foreground">{selectedConversation.categoryName} playbook</li>
                    ) : (
                      <li className="px-2 py-1 rounded-md bg-muted/30">No linked knowledge yet</li>
                    )}
                  </ul>
                </div>

                <div className="p-3 rounded-lg border border-border/70 bg-background/70 space-y-2">
                  <p className="text-sm font-semibold text-foreground">Quick actions</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" className="h-10" leftIcon={<AlertTriangle className="w-4 h-4" />}>
                      Escalate
                    </Button>
                    <Button variant="secondary" className="h-10" onClick={() => setAutoReplyEnabled(false)}>
                      Pause AI
                    </Button>
                    <Button variant="secondary" className="h-10" leftIcon={<Tag className="w-4 h-4" />}>
                      Change category
                    </Button>
                    <Button variant="secondary" className="h-10">
                      Add to KB
                    </Button>
                  </div>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inbox;
