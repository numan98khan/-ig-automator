import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Instagram,
  Loader2,
  Sparkles,
  MessageSquare,
  Zap,
  AlertCircle,
  ArrowRight,
  Mail,
  Lock,
  Sun,
  Moon,
  Send,
  ShieldCheck,
  Workflow,
  Compass,
  CreditCard,
  LockKeyhole,
  LineChart,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui/Button';

const Landing: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { user, currentWorkspace, login, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
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
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Mesh gradient blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.2),_transparent_60%)] blur-3xl" />
        <div className="absolute top-[10%] right-[-12%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.18),_transparent_60%)] blur-3xl" />
        <div className="absolute bottom-[-12%] left-[5%] w-[60%] h-[60%] rounded-full bg-[radial-gradient(circle_at_center,_rgba(94,234,212,0.16),_transparent_65%)] blur-3xl" />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.07] mix-blend-soft-light"
          style={{
            backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />

        {/* Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,0)_0%,_rgba(0,0,0,0.25)_70%,_rgba(0,0,0,0.5)_100%)]" />

        {/* Subtle Grain Overlay */}
        <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
      </div>


      {/* Header */}
      <header className="p-6 relative z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-primary to-indigo-500 rounded-xl shadow-glow">
              <Send className="w-6 h-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-extrabold text-foreground tracking-tight">SendFx</span>
              <span className="text-xs text-muted-foreground">Insta DM AI Automator</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#overview" className="hover:text-foreground transition-colors">Overview</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#trust" className="hover:text-foreground transition-colors">Trust</a>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full bg-background/50 border border-border text-foreground/80 hover:text-foreground hover:bg-muted transition-colors backdrop-blur-md"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Button variant="ghost" className="text-sm hidden md:inline-flex">Contact Support</Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div id="overview" className="flex-1 flex flex-col justify-center px-4 py-12 md:py-20 relative z-10">
        <div className="max-w-6xl w-full mx-auto text-center space-y-4 md:space-y-6">

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/40 border border-border text-muted-foreground text-[11px] font-medium mb-4 md:mb-6 animate-fade-in backdrop-blur-md">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>SendFx — new with GPT-4 Turbo flows</span>
          </div>

          {/* Hero Title */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-foreground mb-4 md:mb-6 tracking-tight md:tracking-tighter leading-[1.05] md:leading-[1.08] animate-slide-up">
            Send functions.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 via-primary to-indigo-400 animate-gradient-x">
              Master every DM.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground mb-12 md:mb-14 max-w-2xl mx-auto leading-[1.8] animate-slide-up" style={{ animationDelay: '0.1s' }}>
            SendFx is the DM command center for Instagram—ship AI-powered replies, auto-routes, and human handoffs in one canvas. Build functions, set guardrails, and keep your brand voice consistent across every conversation.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground mb-10 md:mb-14 animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/70 border border-border backdrop-blur-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Safety-first guardrails</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/70 border border-border backdrop-blur-sm">
              <Workflow className="w-4 h-4 text-primary" />
              <span>Composable send flows</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-background/70 border border-border backdrop-blur-sm">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Live in minutes</span>
            </div>
          </div>

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
                  <div className="glass-panel p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-xl">
                    <h2 className="text-xl font-bold text-foreground mb-4 text-center">Log In to Your Account</h2>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">Email</label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-background/50 border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder="your@email.com"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-background/50 border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                          className="text-sm text-muted-foreground hover:text-foreground transition"
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
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
                  >
                    Already have an account? <span className="text-primary">Log in with email</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Features Grid */}
          <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 md:mt-32 px-4 animate-slide-up" style={{ animationDelay: '0.3s' }}>
            <div className="glass-panel p-6 rounded-2xl text-left hover:bg-muted/50 transition-colors group border border-border/50">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 text-primary group-hover:scale-110 transition-transform">
                <Workflow className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg text-foreground mb-2">Function Builder</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Stack AI prompts, actions, and conditions to ship send-ready flows without code.
              </p>
            </div>

            <div className="glass-panel p-6 rounded-2xl text-left hover:bg-muted/50 transition-colors group border border-border/50">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 text-accent group-hover:scale-110 transition-transform">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg text-foreground mb-2">On-brand Replies</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Train SendFx on your tone, offers, and policies so every DM feels human and consistent.
              </p>
            </div>

            <div className="glass-panel p-6 rounded-2xl text-left hover:bg-muted/50 transition-colors group border border-border/50">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4 text-foreground group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-lg text-foreground mb-2">Guardrails & Handoffs</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Route edge cases to humans, set approval stops, and keep compliance locked in.
              </p>
            </div>
          </div>

          {/* Overview Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-14 text-left">
            <div className="glass-panel p-5 rounded-2xl border border-border/60 bg-background/60 backdrop-blur-md flex items-start gap-3">
              <Compass className="w-5 h-5 text-primary mt-1" />
              <div>
                <p className="text-sm text-muted-foreground">Overview</p>
                <p className="text-base text-foreground">Single console for AI replies, routing, and handoffs built for Instagram speed.</p>
              </div>
            </div>
            <div className="glass-panel p-5 rounded-2xl border border-border/60 bg-background/60 backdrop-blur-md flex items-start gap-3">
              <LineChart className="w-5 h-5 text-emerald-400 mt-1" />
              <div>
                <p className="text-sm text-muted-foreground">Performance</p>
                <p className="text-base text-foreground">Measure response gains, approval stops, and agent saves in one view.</p>
              </div>
            </div>
            <div className="glass-panel p-5 rounded-2xl border border-border/60 bg-background/60 backdrop-blur-md flex items-start gap-3">
              <LockKeyhole className="w-5 h-5 text-amber-300 mt-1" />
              <div>
                <p className="text-sm text-muted-foreground">Compliance</p>
                <p className="text-base text-foreground">Role-aware guardrails with auditable histories for every send function.</p>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <section id="pricing" className="mt-20 md:mt-28 text-left">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Pricing</p>
                <h2 className="text-2xl md:text-3xl font-extrabold text-foreground mt-2">Clear plans for scaling send functions</h2>
                <p className="text-muted-foreground mt-2 max-w-2xl">Start fast with Instagram login, then grow into approvals, multi-workspace routing, and advanced analytics.</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="w-4 h-4" />
                <span>Usage-based after free trial</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1.2fr,0.8fr] gap-6">
              <div className="glass-panel p-6 md:p-8 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-md space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pro</p>
                    <p className="text-3xl font-extrabold text-foreground mt-1">$89<span className="text-base font-semibold text-muted-foreground"> / month</span></p>
                  </div>
                  <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/30">Best for teams</div>
                </div>
                <ul className="space-y-3 text-sm text-foreground">
                  <li className="flex items-start gap-2"><ShieldCheck className="w-4 h-4 text-primary mt-0.5" />Unlimited send functions with role-aware guardrails</li>
                  <li className="flex items-start gap-2"><Workflow className="w-4 h-4 text-primary mt-0.5" />Approvals, routing, and human handoffs in one canvas</li>
                  <li className="flex items-start gap-2"><MessageSquare className="w-4 h-4 text-primary mt-0.5" />On-brand AI replies trained on your offers and policies</li>
                  <li className="flex items-start gap-2"><LineChart className="w-4 h-4 text-primary mt-0.5" />Analytics on saves, response speed, and deflection</li>
                </ul>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleInstagramLogin}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white font-semibold hover:shadow-glow hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Instagram className="w-4 h-4" />}
                    Continue with Instagram
                  </button>
                  <Button variant="ghost" className="px-4">Talk to sales</Button>
                </div>
              </div>
              <div className="glass-panel p-6 md:p-8 rounded-2xl border border-border/60 bg-background/60 backdrop-blur-md space-y-4">
                <p className="text-sm text-muted-foreground">Need enterprise?</p>
                <p className="text-xl font-semibold text-foreground">Custom guardrails, SSO, audit exports, and deployment support.</p>
                <Button variant="outline" className="w-full justify-center">Book a demo</Button>
              </div>
            </div>
          </section>

          {/* Trust */}
          <section id="trust" className="mt-20 md:mt-24 text-left">
            <div className="glass-panel p-6 md:p-8 rounded-2xl border border-border/60 bg-card/50 backdrop-blur-md">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Trust & Security</p>
                  <h3 className="text-2xl font-extrabold text-foreground">Built for sensitive inboxes</h3>
                  <p className="text-muted-foreground max-w-2xl">SendFx ships with approvals, role-scoped access, and auditable histories so you can automate confidently without losing control of brand and compliance.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm text-foreground min-w-[240px]">
                  <div className="p-3 rounded-xl border border-border/60 bg-background/60">
                    <p className="font-semibold">SOC2-ready</p>
                    <p className="text-muted-foreground text-xs mt-1">Controls mapped and reviewed.</p>
                  </div>
                  <div className="p-3 rounded-xl border border-border/60 bg-background/60">
                    <p className="font-semibold">Data isolation</p>
                    <p className="text-muted-foreground text-xs mt-1">Workspace-level boundaries.</p>
                  </div>
                  <div className="p-3 rounded-xl border border-border/60 bg-background/60">
                    <p className="font-semibold">Human in loop</p>
                    <p className="text-muted-foreground text-xs mt-1">Approval stops when needed.</p>
                  </div>
                  <div className="p-3 rounded-xl border border-border/60 bg-background/60">
                    <p className="font-semibold">Audit trails</p>
                    <p className="text-muted-foreground text-xs mt-1">Every send function recorded.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="p-8 text-center text-slate-600 text-sm relative z-10">
        <p>© 2024 SendFx. AI send functions for Instagram.</p>
      </footer>
    </div>
  );
};

export default Landing;
