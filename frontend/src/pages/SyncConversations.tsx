import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { instagramSyncAPI } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';

interface ConversationItem {
  instagramConversationId: string;
  participantName: string;
  updatedAt: string;
  isSynced: boolean;
  categoryId?: string;
  categoryName?: string;
}

const SyncConversations: React.FC = () => {
  const { currentWorkspace } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null); // ID of conv being synced, or 'all'
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentWorkspace) {
      fetchConversations();
    }
  }, [currentWorkspace]);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await instagramSyncAPI.getAvailableConversations(currentWorkspace!._id);
      setConversations(response.data);
    } catch (err: any) {
      console.error('Error fetching conversations:', err);
      setError('Failed to load conversations from Instagram. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncOne = async (conv: ConversationItem) => {
    try {
      setSyncing(conv.instagramConversationId);
      await instagramSyncAPI.syncMessages(currentWorkspace!._id, conv.instagramConversationId);

      // Refresh list to see updated status/category
      await fetchConversations();
    } catch (err) {
      console.error('Sync failed:', err);
      alert('Failed to sync conversation');
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    if (!window.confirm('This might take a while. Sync all conversations?')) return;

    try {
      setSyncing('all');
      await instagramSyncAPI.syncMessages(currentWorkspace!._id);
      await fetchConversations();
    } catch (err) {
      console.error('Sync all failed:', err);
      alert('Failed to sync all conversations');
    } finally {
      setSyncing(null);
    }
  };

  if (!currentWorkspace) return <div>Please select a workspace</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sync Conversations</h1>
          <p className="text-gray-500 mt-1">
            View available conversations on Instagram and sync them to your inbox.
            <br />
            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
              ✨ Includes AI Auto-Categorization
            </span>
          </p>
        </div>
        <div className="flex gap-4">
          <button
            onClick={fetchConversations}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={loading || !!syncing}
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleSyncAll}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            disabled={loading || !!syncing}
          >
            {syncing === 'all' ? 'Syncing...' : 'Sync All'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
          <ExclamationCircleIcon className="w-5 h-5" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading conversations from Instagram...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Participant</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Last Activity</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Status</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Category</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {conversations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No conversations found on Instagram.
                  </td>
                </tr>
              ) : (
                conversations.map((conv) => (
                  <tr key={conv.instagramConversationId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold">
                          {conv.participantName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">{conv.participantName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                    </td>
                    <td className="px-6 py-4">
                      {conv.isSynced ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          Synced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          New
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {conv.isSynced ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {conv.categoryName || 'General'}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleSyncOne(conv)}
                        disabled={!!syncing}
                        className={`text-sm font-medium hover:underline ${conv.isSynced
                            ? 'text-gray-500 hover:text-gray-700'
                            : 'text-indigo-600 hover:text-indigo-800'
                          }`}
                      >
                        {syncing === conv.instagramConversationId
                          ? 'Syncing...'
                          : conv.isSynced ? 'Re-sync' : 'Sync Now'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SyncConversations;
