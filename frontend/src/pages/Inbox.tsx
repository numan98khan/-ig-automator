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
import { Send, Sparkles, Instagram, Loader2, RefreshCw, CheckCircle, Tag } from 'lucide-react';

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

      // Reload conversations to get the synced version with _id
      await loadConversations();

      // Find the newly synced conversation and select it
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
      alert('All conversations synced successfully!');
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
      // Reload messages to show updated category
      await loadMessages();
      await loadConversations(); // Update conversation list too
      setCategoryDropdownOpen(null);
    } catch (error) {
      console.error('Error updating category:', error);
      alert('Failed to update category. Please try again.');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Only auto-scroll when new messages arrive or user sends a message
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

  // Real-time polling for new messages
  useEffect(() => {
    if (!currentWorkspace) return;

    const interval = setInterval(() => {
      loadConversations();
      if (selectedConversation) {
        loadMessages();
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [currentWorkspace, selectedConversation]);

  // Click outside to close category dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setCategoryDropdownOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check for Instagram OAuth success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram_connected') === 'true') {
      // Remove the query parameter
      window.history.replaceState({}, '', window.location.pathname);
      // Reload data to show the connected account
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

      // If we have a connected Instagram account and no conversations, trigger sync
      const connectedAccount = accountsData?.find(acc => acc.status === 'connected');
      if (connectedAccount && (!conversationsData || conversationsData.length === 0)) {
        console.log('📥 Connected Instagram account detected, syncing messages...');
        try {
          const syncResult = await instagramSyncAPI.syncMessages(currentWorkspace._id);
          console.log('✅ Instagram sync complete:', syncResult);

          // Reload conversations after sync
          const updatedConversations = await conversationAPI.getByWorkspace(currentWorkspace._id);
          setConversations(updatedConversations || []);

          if (updatedConversations && updatedConversations.length > 0 && !selectedConversation) {
            setSelectedConversation(updatedConversations[0]);
          }
        } catch (syncError) {
          console.error('❌ Error syncing Instagram messages:', syncError);
          // Continue anyway - show what we have
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
      // If conversation is not synced, sync it first
      if (!selectedConversation.isSynced && selectedConversation.instagramConversationId) {
        handleSyncConversation();
      } else {
        loadMessages();
      }
      setShouldAutoScroll(true); // Enable auto-scroll for new conversation
    }
  }, [selectedConversation]);

  const loadMessages = async () => {
    if (!selectedConversation || !selectedConversation._id) return;

    try {
      const data = await messageAPI.getByConversation(selectedConversation._id);
      setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation) return;

    // Check if conversation is synced
    if (!selectedConversation._id) {
      alert('Please wait while the conversation syncs...');
      return;
    }

    setSendingMessage(true);
    try {
      // Use Instagram API to send message
      const message = await instagramSyncAPI.sendMessage(selectedConversation._id, newMessage);

      // Immediately add the message to the UI
      setMessages([...messages, message]);
      setNewMessage('');
      setShouldAutoScroll(true);

      // Scroll to bottom after sending
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

  if (!currentWorkspace) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Please create a workspace first</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  const handleConnectInstagram = async () => {
    if (!currentWorkspace) return;

    try {
      setLoading(true);
      const { authUrl } = await instagramAPI.getAuthUrl(currentWorkspace._id);
      // Redirect to Instagram OAuth
      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating Instagram connection:', error);
      alert('Failed to connect Instagram. Please try again.');
      setLoading(false);
    }
  };

  if (instagramAccounts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="text-center max-w-md bg-white rounded-lg shadow-xl p-8">
          <div className="bg-gradient-to-br from-purple-600 to-pink-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Instagram className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Connect Your Instagram</h2>
          <p className="text-gray-600 mb-8">
            Connect your Instagram Business account to start managing DMs and comments with AI-powered responses.
          </p>
          <button
            onClick={handleConnectInstagram}
            disabled={loading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 rounded-lg hover:from-purple-700 hover:to-pink-700 font-semibold transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Connecting...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Instagram className="w-5 h-5" />
                Connect Instagram Account
              </span>
            )}
          </button>
          <p className="text-xs text-gray-500 mt-4">
            You'll be redirected to Instagram to authorize access
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Conversation List */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Conversations</h2>
              <p className="text-sm text-gray-500 mt-1">
                @{instagramAccounts?.[0]?.username || '...'}
              </p>
            </div>
            <button
              onClick={handleSyncAll}
              disabled={syncingAll}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
              title="Sync All Conversations"
            >
              {syncingAll ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync All
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <div
              key={conv._id || conv.instagramConversationId}
              onClick={() => setSelectedConversation(conv)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition ${selectedConversation?._id === conv._id || selectedConversation?.instagramConversationId === conv.instagramConversationId ? 'bg-purple-50' : ''
                }`}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-semibold text-gray-900">{conv.participantName}</h3>
                <span className="text-xs text-gray-500">{formatTime(conv.lastMessageAt)}</span>
              </div>
              <p className="text-sm text-gray-600">{conv.participantHandle}</p>
              {conv.lastMessage && (
                <p className="text-sm text-gray-500 mt-1 truncate">{conv.lastMessage}</p>
              )}
              <div className="flex gap-2 mt-2">
                {conv.isSynced ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <CheckCircle className="w-3 h-3" />
                    Synced
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    Not Synced
                  </span>
                )}
                {conv.categoryName && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                    {conv.categoryName}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="font-semibold text-gray-900">{selectedConversation.participantName}</h2>
                  <p className="text-sm text-gray-500">{selectedConversation.participantHandle}</p>
                </div>
                <button
                  onClick={handleSyncConversation}
                  disabled={syncing}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition disabled:opacity-50"
                  title="Sync Messages"
                >
                  <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin text-purple-600' : ''}`} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`flex ${msg.from === 'customer' ? 'justify-start' : 'justify-end'}`}
                  onMouseEnter={() => msg.from === 'customer' && setHoveredMessageId(msg._id)}
                  onMouseLeave={() => setHoveredMessageId(null)}
                >
                  <div className="relative">
                    <div
                      className={`max-w-md px-4 py-2 rounded-lg ${msg.from === 'customer'
                        ? 'bg-white text-gray-900 border border-gray-200'
                        : msg.from === 'ai'
                          ? 'bg-purple-100 text-purple-900 border border-purple-200'
                          : 'bg-blue-600 text-white'
                        }`}
                    >
                      {msg.from === 'ai' && (
                        <div className="flex items-center gap-1 mb-1">
                          <Sparkles className="w-3 h-3" />
                          <span className="text-xs font-medium">AI</span>
                        </div>
                      )}
                      <p className="text-sm">{msg.text}</p>
                      <p
                        className={`text-xs mt-1 ${msg.from === 'user' ? 'text-blue-100' : 'text-gray-500'
                          }`}
                      >
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>

                    {/* Category Tooltip for Customer Messages */}
                    {msg.from === 'customer' && hoveredMessageId === msg._id && (
                      <div className="absolute left-0 top-full mt-1 z-10">
                        <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg min-w-[200px]">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="flex items-center gap-1">
                              <Tag className="w-3 h-3" />
                              Category:
                            </span>
                            <span className="font-medium">
                              {msg.categoryId?.nameEn || 'Uncategorized'}
                            </span>
                          </div>
                          <button
                            onClick={() => setCategoryDropdownOpen(msg._id)}
                            className="w-full text-left px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition"
                          >
                            Change Category
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Category Dropdown */}
                    {categoryDropdownOpen === msg._id && (
                      <div
                        ref={categoryDropdownRef}
                        className="absolute left-0 top-full mt-1 z-20 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[200px] max-h-60 overflow-y-auto"
                      >
                        {categories.map((cat) => (
                          <button
                            key={cat._id}
                            onClick={() => handleCategoryChange(msg._id, cat._id)}
                            className={`w-full text-left px-4 py-2 hover:bg-gray-100 text-sm transition ${msg.categoryId?._id === cat._id ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-700'
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
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="mb-2">
                <button
                  onClick={handleGenerateAIReply}
                  disabled={generatingAI}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:bg-purple-50 disabled:text-purple-400 font-medium transition"
                >
                  {generatingAI ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate AI Reply
                    </>
                  )}
                </button>
              </div>

              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !newMessage.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition"
                >
                  {sendingMessage ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Select a conversation to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Inbox;
