import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Instagram, Loader2, Sparkles, MessageSquare, Zap, AlertCircle, ArrowRight, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';

const Landing: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { user, currentWorkspace, login, refreshUser } = useAuth();
  const navigate = useNavigate();

  const location = useLocation();

  useEffect(() => {
    // Check for errors in URL params
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const messageParam = params.get('message');

    if (errorParam) {
      // Use custom message if provided, otherwise use default error message
      if (messageParam) {
        setError(decodeURIComponent(messageParam));
        setShowEmailLogin(true); // Show email login form if account is secured
      } else if (errorParam === 'account_secured') {
        setError('You have already secured your account. Please log in with your email and password.');
        setShowEmailLogin(true);
      } else {
        setError(`Authentication failed: ${errorParam}`);
      }
      console.error('❌ OAuth error:', errorParam);
      // Keep error in URL for 5 seconds before cleaning
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
        setError(null);
      }, 8000);
      return;
    }

    // If user is already logged in with workspace, redirect to inbox or original destination
    if (user && currentWorkspace) {
      console.log('✅ User authenticated, redirecting...');
      const from = location.state?.from?.pathname || '/inbox';
      // If the destination is same as landing (shouldn't happen), go to inbox
      const target = from === '/landing' ? '/inbox' : from;
      navigate(target, { replace: true });
    }
  }, [user, currentWorkspace, navigate, location]);

  const handleInstagramLogin = async () => {
    try {
      setLoading(true);
      setError(null);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/instagram/auth-login`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      window.location.href = data.authUrl;
    } catch (error) {
      console.error('Error initiating Instagram login:', error);
      setError('Failed to connect Instagram. Please check your connection and try again.');
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoginLoading(true);
      setError(null);

      await login(email, password);
      console.log('✅ Login successful, fetching user data...');

      // Refresh user data to get workspaces
      await refreshUser();
      console.log('✅ User data refreshed, navigating to inbox...');

      // Navigate to inbox
      navigate('/inbox', { replace: true });
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.response?.data?.error || 'Invalid email or password');
      setLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col selection:bg-primary/30">

      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/20 rounded-full blur-[120px] animate-pulse-slow pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent/20 rounded-full blur-[120px] animate-pulse-slow pointer-events-none" />


      {/* Header */}
      <header className="p-6 relative z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-primary rounded-xl shadow-glow">
              <Instagram className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">AI Inbox</span>
          </div>
          <Button variant="ghost" className="text-sm">Contact Support</Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center px-4 py-12 md:py-20 relative z-10">
        <div className="max-w-5xl w-full mx-auto text-center">

          {/* Hero Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-primary-foreground/80 text-xs font-medium mb-8 animate-fade-in backdrop-blur-md">
            <Sparkles className="w-3 h-3 text-accent" />
            <span>Now with GPT-4 Turbo Integration</span>
          </div>

          {/* Hero Title */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-white mb-6 tracking-tight leading-tight animate-slide-up">
            Master your DMs
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-secondary-hover">
              using Intelligence.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
            Automate your Instagram customer support with AI-powered responses. Train your assistant, manage conversations, and scale effortlessly.
          </p>

          {/* CTA Section */}
          <div className="flex flex-col items-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            {/* Error Message */}
            {error && (
              <div className="mb-2 animate-fade-in">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-left max-w-md">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-red-200 text-sm font-medium">Notice</p>
                    <p className="text-red-300/80 text-xs mt-0.5">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Email Login Form */}
            {showEmailLogin ? (
              <div className="w-full max-w-md mx-auto animate-fade-in">
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div className="glass-panel p-6 rounded-2xl border border-white/10">
                    <h2 className="text-xl font-bold text-white mb-4 text-center">Log In to Your Account</h2>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="your@email.com"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="Enter your password"
                            required
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loginLoading}
                        className="w-full px-6 py-3 bg-gradient-primary rounded-xl text-white font-semibold hover:shadow-glow hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {loginLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Logging in...</span>
                          </>
                        ) : (
                          <>
                            <span>Log In</span>
                            <ArrowRight className="w-5 h-5" />
                          </>
                        )}
                      </button>

                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => setShowEmailLogin(false)}
                          className="text-sm text-slate-400 hover:text-white transition"
                        >
                          ← Back to Instagram Login
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            ) : (
              <>
                <button
                  onClick={handleInstagramLogin}
                  disabled={loading}
                  className="group relative inline-flex items-center gap-3 px-8 py-4 bg-gradient-primary rounded-2xl text-white font-semibold text-lg hover:shadow-glow hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Connecting secure session...</span>
                    </>
                  ) : (
                    <>
                      <Instagram className="w-5 h-5" />
                      <span>Continue with Instagram</span>
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>

                <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
                  <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Instant Setup</span>
                  <span className="w-1 h-1 bg-slate-700 rounded-full" />
                  <span>No credit card required</span>
                </div>

                {/* Already have an account link */}
                <div className="mt-4">
                  <button
                    onClick={() => setShowEmailLogin(true)}
                    className="text-sm text-slate-400 hover:text-white transition-colors font-medium"
                  >
                    Already have an account? <span className="text-primary">Log in with email</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 md:mt-32 px-4 animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="glass-panel p-6 rounded-2xl text-left hover:bg-white/5 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4 text-primary group-hover:scale-110 transition-transform">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg text-white mb-2">Smart Replies</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Context-aware responses that sound just like you, generated in milliseconds.
              </p>
            </div>

            <div className="glass-panel p-6 rounded-2xl text-left hover:bg-white/5 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center mb-4 text-accent group-hover:scale-110 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg text-white mb-2">Knowledge Base</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Feed the AI your documents and guidelines to ensure accurate information.
              </p>
            </div>

            <div className="glass-panel p-6 rounded-2xl text-left hover:bg-white/5 transition-colors group">
              <div className="w-12 h-12 rounded-xl bg-secondary/20 flex items-center justify-center mb-4 text-slate-300 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg text-white mb-2">24/7 Automation</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Never miss a DM. Handle thousands of conversations simultaneously, day or night.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="p-8 text-center text-slate-600 text-sm relative z-10">
        <p>© 2024 AI Automator. Built for creators.</p>
      </footer>
    </div>
  );
};

export default Landing;
