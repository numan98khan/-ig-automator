import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Instagram, Loader2, Sparkles, MessageSquare, Zap, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Landing: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, currentWorkspace } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check for errors in URL params
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const tokenParam = params.get('token');
    const instagramConnected = params.get('instagram_connected');

    // DEBUG: Log all URL parameters
    console.log('🔍 Landing page URL params:', {
      error: errorParam,
      token: tokenParam ? 'PRESENT' : 'MISSING',
      instagram_connected: instagramConnected,
      full_url: window.location.href,
      all_params: Object.fromEntries(params.entries())
    });

    if (errorParam) {
      setError(`Authentication failed: ${errorParam}`);
      console.error('❌ OAuth error:', errorParam);
      // Keep error in URL for 5 seconds before cleaning
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
      }, 5000);
      return;
    }

    // If user is already logged in with workspace, redirect to inbox
    if (user && currentWorkspace) {
      console.log('✅ User authenticated, redirecting to inbox');
      navigate('/inbox');
    }
  }, [user, currentWorkspace, navigate]);

  const handleInstagramLogin = async () => {
    try {
      setLoading(true);
      setError(null);

      // Redirect directly to backend OAuth without workspace ID
      // Backend will create user + workspace on first login
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      console.log('Initiating Instagram OAuth, API URL:', apiUrl);

      const response = await fetch(`${apiUrl}/api/instagram/auth-login`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Redirecting to Instagram OAuth:', data.authUrl);
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('Error initiating Instagram login:', error);
      setError('Failed to connect Instagram. Please check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 overflow-y-auto">
      {/* Header */}
      <header className="p-4 md:p-6">
        <div className="max-w-7xl mx-auto flex items-center gap-2 md:gap-3">
          <Instagram className="w-8 h-8 md:w-10 md:h-10 text-white" />
          <span className="text-lg md:text-2xl font-bold text-white">AI Instagram Inbox</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="px-4 py-8 md:py-12 pb-24">
        <div className="max-w-5xl w-full mx-auto">
          <div className="text-center mb-8 md:mb-12">
            {/* Hero */}
            <div className="mb-6 md:mb-8">
              <div className="inline-block bg-white/20 backdrop-blur-sm rounded-full p-4 md:p-6 mb-4 md:mb-6">
                <Instagram className="w-16 h-16 md:w-24 md:h-24 text-white" />
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-3 md:mb-4 px-4">
                Manage Instagram DMs
                <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-200 to-pink-200">
                  with AI
                </span>
              </h1>
              <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-purple-100 mb-6 md:mb-8 max-w-2xl mx-auto px-4">
                Automate your Instagram customer support with AI-powered responses
              </p>
            </div>

            {/* Sign in Button */}
            <div className="mb-8 md:mb-12 px-4">
              <button
                onClick={handleInstagramLogin}
                disabled={loading}
                className="group relative inline-flex items-center gap-2 md:gap-4 bg-white text-purple-600 px-6 py-4 md:px-12 md:py-6 rounded-xl md:rounded-2xl font-bold text-base md:text-xl shadow-2xl hover:shadow-3xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-6 h-6 md:w-8 md:h-8 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Instagram className="w-6 h-6 md:w-8 md:h-8" />
                    <span>Sign in with Instagram</span>
                    <div className="absolute inset-0 rounded-xl md:rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-10 transition-opacity" />
                  </>
                )}
              </button>
              <p className="text-white/80 text-xs md:text-sm mt-3 md:mt-4">
                Free • No credit card required • Connect in 30 seconds
              </p>

              {/* Error Message */}
              {error && (
                <div className="mt-4 max-w-md mx-auto">
                  <div className="bg-red-500/20 backdrop-blur-md border border-red-400/50 rounded-xl p-3 md:p-4 flex items-start gap-2 md:gap-3">
                    <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-red-200 flex-shrink-0 mt-0.5" />
                    <div className="text-left">
                      <p className="text-red-100 font-semibold text-xs md:text-sm">Error</p>
                      <p className="text-red-200 text-xs md:text-sm mt-1">{error}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto px-4">
              <div className="bg-white/10 backdrop-blur-md rounded-xl md:rounded-2xl p-4 md:p-6 text-white border border-white/20">
                <div className="bg-white/20 rounded-full w-12 h-12 md:w-14 md:h-14 flex items-center justify-center mb-3 md:mb-4 mx-auto">
                  <MessageSquare className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <h3 className="font-bold text-base md:text-lg mb-2">AI-Powered Replies</h3>
                <p className="text-purple-100 text-xs md:text-sm">
                  Automatically respond to DMs with intelligent, context-aware messages
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-xl md:rounded-2xl p-4 md:p-6 text-white border border-white/20">
                <div className="bg-white/20 rounded-full w-12 h-12 md:w-14 md:h-14 flex items-center justify-center mb-3 md:mb-4 mx-auto">
                  <Sparkles className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <h3 className="font-bold text-base md:text-lg mb-2">Custom Knowledge Base</h3>
                <p className="text-purple-100 text-xs md:text-sm">
                  Train AI with your FAQs and brand voice for personalized responses
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-xl md:rounded-2xl p-4 md:p-6 text-white border border-white/20">
                <div className="bg-white/20 rounded-full w-12 h-12 md:w-14 md:h-14 flex items-center justify-center mb-3 md:mb-4 mx-auto">
                  <Zap className="w-6 h-6 md:w-7 md:h-7" />
                </div>
                <h3 className="font-bold text-base md:text-lg mb-2">Instant Setup</h3>
                <p className="text-purple-100 text-xs md:text-sm">
                  Connect your Instagram Business account and start in minutes
                </p>
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className="bg-white/10 backdrop-blur-md rounded-lg md:rounded-xl p-3 md:p-4 max-w-2xl mx-auto border border-white/20 mx-4">
            <p className="text-white/90 text-xs md:text-sm text-center">
              <strong>Requirements:</strong> Instagram Business or Creator account connected to a Facebook Page
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="p-4 md:p-6 pb-6 md:pb-8">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-white/60 text-xs md:text-sm">
            Secure OAuth authentication • No password required
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
