import React, { useState } from 'react';
import { Instagram, Loader2, Sparkles, MessageSquare, Zap } from 'lucide-react';

const Landing: React.FC = () => {
  const [loading, setLoading] = useState(false);

  const handleInstagramLogin = async () => {
    try {
      setLoading(true);
      // Redirect directly to backend OAuth without workspace ID
      // Backend will create user + workspace on first login
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/instagram/auth-login`);
      const data = await response.json();
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('Error initiating Instagram login:', error);
      alert('Failed to connect Instagram. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 p-6">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Instagram className="w-10 h-10 text-white" />
          <span className="text-2xl font-bold text-white">AI Instagram Inbox</span>
        </div>
      </header>

      {/* Main Content */}
      <div className="min-h-screen flex items-center justify-center px-4 py-20">
        <div className="max-w-5xl w-full">
          <div className="text-center mb-12">
            {/* Hero */}
            <div className="mb-8">
              <div className="inline-block bg-white/20 backdrop-blur-sm rounded-full p-6 mb-6">
                <Instagram className="w-24 h-24 text-white" />
              </div>
              <h1 className="text-6xl font-bold text-white mb-4">
                Manage Instagram DMs
                <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-200 to-pink-200">
                  with AI
                </span>
              </h1>
              <p className="text-2xl text-purple-100 mb-8 max-w-2xl mx-auto">
                Automate your Instagram customer support with AI-powered responses
              </p>
            </div>

            {/* Sign in Button */}
            <div className="mb-12">
              <button
                onClick={handleInstagramLogin}
                disabled={loading}
                className="group relative inline-flex items-center gap-4 bg-white text-purple-600 px-12 py-6 rounded-2xl font-bold text-xl shadow-2xl hover:shadow-3xl hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Instagram className="w-8 h-8" />
                    <span>Sign in with Instagram</span>
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-10 transition-opacity" />
                  </>
                )}
              </button>
              <p className="text-white/80 text-sm mt-4">
                Free • No credit card required • Connect in 30 seconds
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white border border-white/20">
                <div className="bg-white/20 rounded-full w-14 h-14 flex items-center justify-center mb-4 mx-auto">
                  <MessageSquare className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-lg mb-2">AI-Powered Replies</h3>
                <p className="text-purple-100 text-sm">
                  Automatically respond to DMs with intelligent, context-aware messages
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white border border-white/20">
                <div className="bg-white/20 rounded-full w-14 h-14 flex items-center justify-center mb-4 mx-auto">
                  <Sparkles className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-lg mb-2">Custom Knowledge Base</h3>
                <p className="text-purple-100 text-sm">
                  Train AI with your FAQs and brand voice for personalized responses
                </p>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 text-white border border-white/20">
                <div className="bg-white/20 rounded-full w-14 h-14 flex items-center justify-center mb-4 mx-auto">
                  <Zap className="w-7 h-7" />
                </div>
                <h3 className="font-bold text-lg mb-2">Instant Setup</h3>
                <p className="text-purple-100 text-sm">
                  Connect your Instagram Business account and start in minutes
                </p>
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 max-w-2xl mx-auto border border-white/20">
            <p className="text-white/90 text-sm text-center">
              <strong>Requirements:</strong> Instagram Business or Creator account connected to a Facebook Page
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-0 left-0 right-0 p-6">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-white/60 text-sm">
            Secure OAuth authentication • No password required
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
