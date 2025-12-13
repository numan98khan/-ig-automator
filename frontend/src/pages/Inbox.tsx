import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
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
import { Send, Sparkles, Instagram, Loader2, RefreshCw, CheckCircle, Tag, Check, CheckCheck, ArrowLeft, MoreVertical, Search, MessageSquare } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

const Inbox: React.FC = () => {
  const { currentWorkspace } = useAuth();
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
  }, [currentWorkspace]);

  useEffect(() => {
    if (!currentWorkspace) return;
    const interval = setInterval(() => {
      loadConversations();
      if (selectedConversation) {
        loadMessages();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentWorkspace, selectedConversation]);

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
  }, [currentWorkspace]);

  const loadData = async () => {
    if (!currentWorkspace) return;
    try {
      setLoading(true);
      const [accountsData, conversationsData, categoriesData] = await Promise.all([
        instagramAPI.getByWorkspace(currentWorkspace._id),
        conversationAPI.getByWorkspace(currentWorkspace._id),
        categoriesAPI.getByWorkspace(currentWorkspace._id),
      ]);

      setInstagramAccounts(accountsData || []);
      setCategories(categoriesData || []);

      const connectedAccount = accountsData?.find(acc => acc.status === 'connected');
      if (connectedAccount && (!conversationsData || conversationsData.length === 0)) {
        try {
          await instagramSyncAPI.syncMessages(currentWorkspace._id);
          const updatedConversations = await conversationAPI.getByWorkspace(currentWorkspace._id);
          setConversations(updatedConversations || []);
          if (updatedConversations && updatedConversations.length > 0 && !selectedConversation) {
            setSelectedConversation(updatedConversations[0]);
          }
        } catch (syncError) {
          console.error('❌ Error syncing Instagram messages:', syncError);
          setConversations(conversationsData || []);
        }
      } else {
        setConversations(conversationsData || []);
        if (conversationsData && conversationsData.length > 0 && !selectedConversation) {
          setSelectedConversation(conversationsData[0]);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async () => {
    if (!currentWorkspace) return;
    try {
      const conversationsData = await conversationAPI.getByWorkspace(currentWorkspace._id);
      setConversations(conversationsData || []);
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
      setMessages([...messages, message]);
      setShouldAutoScroll(true);
      setTimeout(scrollToBottom, 100);
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
    <div className="flex h-full min-h-0 gap-4 md:gap-6">
      {/* Conversation List */}
      <div className={`w-full md:w-80 flex flex-col glass-panel rounded-2xl overflow-hidden min-h-0 border border-border ${selectedConversation ? 'hidden md:flex' : 'flex'
        }`}>
        <div className="p-4 border-b border-border bg-background/50 backdrop-blur-md">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Messages</h2>
              <p className="text-xs text-muted-foreground">@{instagramAccounts?.[0]?.username}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncAll}
              disabled={syncingAll}
              isLoading={syncingAll}
              className="h-8 border border-border bg-background text-foreground hover:bg-secondary hover:text-foreground shadow-sm"
              leftIcon={!syncingAll ? <RefreshCw className="w-3.5 h-3.5" /> : undefined}
            >
              Sync
            </Button>
          </div>
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search messages..."
              className="w-full bg-secondary/50 border border-input rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {conversations.map((conv) => (
            <div
              key={conv._id || conv.instagramConversationId}
              onClick={() => setSelectedConversation(conv)}
              className={`p-4 border-b border-border cursor-pointer transition-all duration-200 hover:bg-muted/50 ${selectedConversation?._id === conv._id || selectedConversation?.instagramConversationId === conv.instagramConversationId
                ? 'bg-primary/5 border-l-2 border-l-primary'
                : 'border-l-2 border-l-transparent'
                }`}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className={`font-medium text-sm md:text-base ${selectedConversation?._id === conv._id ? 'text-foreground' : 'text-foreground/80'}`}>
                  {conv.participantName}
                </h3>
                <span className="text-xs text-muted-foreground">{formatTime(conv.lastMessageAt)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">@{conv.participantHandle}</p>

              {conv.lastMessage && (
                <p className="text-xs text-muted-foreground truncate pr-4">{conv.lastMessage}</p>
              )}

              <div className="flex gap-2 mt-2.5 flex-wrap">
                {/* Status Badges */}
                {conv.isSynced ? (
                  <div className="flex items-center gap-1 text-[10px] text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/20 px-1.5 py-0.5 rounded">
                    <CheckCircle className="w-3 h-3" /> Synced
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    Not Synced
                  </div>
                )}
                {conv.categoryName && (
                  <Badge variant="primary" className="text-[10px] py-0">{conv.categoryName}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col glass-panel rounded-2xl overflow-hidden min-h-0 border border-border ${selectedConversation ? 'flex' : 'hidden md:flex'
        }`}>
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-border bg-background/50 backdrop-blur-md flex justify-between items-center">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="font-bold text-foreground text-base md:text-lg leading-tight">{selectedConversation.participantName}</h2>
                  <p className="text-xs text-muted-foreground">@{selectedConversation.participantHandle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSyncConversation}
                  isLoading={syncing}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {!syncing && <RefreshCw className="w-4 h-4" />}
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`flex ${msg.from === 'customer' ? 'justify-start' : 'justify-end'}`}
                  onMouseEnter={() => msg.from === 'customer' && setHoveredMessageId(msg._id)}
                  onMouseLeave={() => setHoveredMessageId(null)}
                >
                  <div className="relative max-w-[85%] md:max-w-lg group">
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.from === 'customer'
                        ? 'bg-secondary text-foreground border border-border rounded-tl-sm'
                        : msg.from === 'ai'
                          ? 'bg-muted text-foreground border border-border rounded-tr-sm'
                          : 'bg-primary text-primary-foreground rounded-tr-sm shadow-glow-sm'
                        }`}
                    >
                      {msg.from === 'ai' && (
                        <div className="flex items-center gap-1.5 mb-1.5 text-foreground/70 text-xs font-semibold uppercase tracking-wider">
                          <Sparkles className="w-3 h-3" />
                          <span>AI Assistant</span>
                        </div>
                      )}

                      <p className="whitespace-pre-wrap">{msg.text}</p>

                      <div className={`flex items-center justify-end gap-1.5 mt-1.5 text-[10px] ${msg.from === 'customer' ? 'text-muted-foreground' : 'text-primary-foreground/70'
                        }`}>
                        <span>{formatTime(msg.createdAt)}</span>
                        {msg.from !== 'customer' && (
                          <span title={msg.seenAt ? 'Seen' : 'Sent'}>
                            {msg.seenAt ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Category Tooltip/Dropdown */}
                    {msg.from === 'customer' && hoveredMessageId === msg._id && !categoryDropdownOpen && (
                      <div className="absolute left-0 -bottom-8 animate-fade-in z-10">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-xs h-6 px-2 bg-background border-border"
                          onClick={() => setCategoryDropdownOpen(msg._id)}
                        >
                          <Tag className="w-3 h-3 mr-1" />
                          {msg.categoryId?.nameEn || 'Categorize'}
                        </Button>
                      </div>
                    )}

                    {categoryDropdownOpen === msg._id && (
                      <div
                        ref={categoryDropdownRef}
                        className="absolute left-0 top-full mt-2 z-20 glass-panel rounded-lg py-1 min-w-[180px] max-h-60 overflow-y-auto animate-fade-in"
                      >
                        <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border uppercase tracking-wider">Select Category</div>
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
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-border bg-background/50 backdrop-blur-md">
              {/* AI Quick Action */}
              <div className="mb-3 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleGenerateAIReply}
                  disabled={generatingAI}
                  className="text-foreground hover:bg-muted hover:text-foreground"
                  leftIcon={generatingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                >
                  {generatingAI ? 'Thinking...' : 'Generate Reply'}
                </Button>
              </div>

              <form onSubmit={handleSendMessage} className="flex gap-3 items-end">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full bg-secondary/50 border border-input rounded-xl px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={sendingMessage || !newMessage.trim()}
                  isLoading={sendingMessage}
                  className={`rounded-xl w-12 h-12 p-0 flex items-center justify-center shrink-0 transition-all ${!newMessage.trim()
                      ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-md'
                    }`}
                >
                  {!sendingMessage && <Send className="w-5 h-5 ml-0.5" />}
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
    </div>
  );
};

export default Inbox;
