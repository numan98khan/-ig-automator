import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { instagramAPI } from '../services/api';
import { Instagram, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';

const ConnectInstagram: React.FC = () => {
  const { currentWorkspace, user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(true);

  useEffect(() => {
    // Check if user already has Instagram connected
    const checkInstagramAccount = async () => {
      if (!currentWorkspace) {
        setCheckingAccount(false);
        return;
      }

      try {
        const accounts = await instagramAPI.getByWorkspace(currentWorkspace._id);
        if (accounts.length > 0) {
          // User already has Instagram connected, redirect to inbox
          navigate('/inbox');
        }
      } catch (error) {
        console.error('Error checking Instagram accounts:', error);
      } finally {
        setCheckingAccount(false);
      }
    };

    checkInstagramAccount();
  }, [currentWorkspace, navigate]);

  // Check for OAuth success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('instagram_connected') === 'true') {
      // Remove the query parameter and redirect to inbox
      window.history.replaceState({}, '', window.location.pathname);
      navigate('/inbox');
    }
  }, [navigate]);

  const handleConnectInstagram = async () => {
    if (!currentWorkspace) {
      // If no workspace, create one first
      navigate('/workspace/create');
      return;
    }

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

  if (checkingAccount) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-4">
      <div className="max-w-2xl w-full">
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header with Gradient */}
          <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 p-8 text-white">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-white/20 backdrop-blur-sm rounded-full p-6">
                <Instagram className="w-16 h-16" />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-center mb-2">
              Welcome{user?.email ? `, ${user.email.split('@')[0]}` : ''}! 👋
            </h1>
            <p className="text-center text-purple-100 text-lg">
              Let's connect your Instagram to get started
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Why connect Instagram?
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Manage DMs with AI</h3>
                    <p className="text-gray-600">
                      Automatically respond to Instagram direct messages using AI-powered replies
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Handle Comments</h3>
                    <p className="text-gray-600">
                      Respond to post comments quickly and professionally with AI assistance
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Custom Knowledge Base</h3>
                    <p className="text-gray-600">
                      Train the AI with your FAQs and brand voice for personalized responses
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-gray-900">Real-time Notifications</h3>
                    <p className="text-gray-600">
                      Get instant updates when you receive new messages or comments
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Requirements */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
              <h3 className="font-semibold text-blue-900 mb-2">Requirements:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Instagram Business or Creator account</li>
                <li>• Account must be connected to a Facebook Page</li>
                <li>• You'll be redirected to Instagram to authorize access</li>
              </ul>
            </div>

            {/* Connect Button */}
            <button
              onClick={handleConnectInstagram}
              disabled={loading}
              className="w-full bg-gradient-to-r from-purple-600 via-pink-600 to-orange-500 text-white px-8 py-5 rounded-xl hover:from-purple-700 hover:via-pink-700 hover:to-orange-600 font-bold text-lg transition shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 group"
            >
              {loading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Instagram className="w-6 h-6" />
                  Connect Instagram Account
                  <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              Secure OAuth authentication via Instagram
            </p>
          </div>
        </div>

        {/* Footer Note */}
        <p className="text-center text-sm text-gray-600 mt-6">
          Don't have a Business account?{' '}
          <a
            href="https://help.instagram.com/502981923235522"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-600 hover:text-purple-700 font-medium underline"
          >
            Learn how to switch
          </a>
        </p>
      </div>
    </div>
  );
};

export default ConnectInstagram;
