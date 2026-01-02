import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Instagram,
  Loader2,
  Sparkles,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Mail,
  Lock,
  Sun,
  Moon,
  ShieldCheck,
  Workflow,
  CreditCard,
  LockKeyhole,
  PlayCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui/Button';
import AssistantWidget from '../components/AssistantWidget';
import Seo from '../components/Seo';

const Landing: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { user, currentWorkspace, login, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const seoDescription =
    'SendFx is Instagram DM automation and a lightweight CRM for SMBs. Route and qualify DMs, reply with guardrails and approvals, and sync leads to Google Sheets.';
  const siteUrl = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '');
  const demoVideoUrl = (import.meta.env.VITE_DEMO_VIDEO_URL as string | undefined)?.trim();
  const hasDemoVideo = Boolean(demoVideoUrl);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SendFx',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: seoDescription,
    url: `${siteUrl}/`,
  };
  const handleWatchDemo = () => {
    const demoSection = document.getElementById('demo');
    if (demoSection) {
      demoSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const location = useLocation();
  const isLight = theme === 'light';
  const surfaceMain = isLight
    ? 'bg-white/90 border border-black/5 shadow-[0_22px_70px_-40px_rgba(0,0,0,0.35)]'
    : 'bg-card/70 border border-border/60 backdrop-blur-xl shadow-2xl';
  const surfaceSoft = isLight
    ? 'bg-white/85 border border-black/5 shadow-[0_18px_60px_-38px_rgba(0,0,0,0.35)]'
    : 'bg-background/60 border border-border/60 backdrop-blur-md';

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
      const from = location.state?.from?.pathname || '/app/inbox';
      // If the destination is the public landing, go to the app inbox
      const target = (from === '/' || from === '/landing' || from === '/app')
        ? '/app/inbox'
        : from;
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
      navigate('/app/inbox', { replace: true });
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.response?.data?.error || 'Invalid email or password');
      setLoginLoading(false);
    }
  };

  return (
    <>
      <Seo
        title="SendFx | Instagram DM Automation & CRM for SMBs"
        description={seoDescription}
        canonicalPath="/"
        image="/sendfx.png"
        robots="index, follow"
        structuredData={structuredData}
      />
      <div className={`min-h-screen relative overflow-x-hidden flex flex-col selection:bg-primary/30 ${isLight ? 'bg-[#f7f8fb]' : 'bg-background'}`}>

      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Mesh gradient blobs */}
        <div className={`absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full ${isLight ? 'bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.14),_transparent_55%)] blur-2xl' : 'bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.2),_transparent_60%)] blur-3xl'}`} />
        <div className={`absolute top-[10%] right-[-12%] w-[50%] h-[50%] rounded-full ${isLight ? 'bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.1),_transparent_55%)] blur-2xl' : 'bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.18),_transparent_60%)] blur-3xl'}`} />
        <div className={`absolute bottom-[-12%] left-[5%] w-[60%] h-[60%] rounded-full ${isLight ? 'bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.08),_transparent_65%)] blur-2xl' : 'bg-[radial-gradient(circle_at_center,_rgba(94,234,212,0.16),_transparent_65%)] blur-3xl'}`} />

        {/* Grid overlay */}
        <div
          className="absolute inset-0 mix-blend-soft-light"
          style={{
            backgroundImage: isLight
              ? `linear-gradient(to right, rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.05) 1px, transparent 1px)`
              : `linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)`,
            backgroundSize: '44px 44px',
          }}
        />

        {/* Vignette */}
        <div className={`absolute inset-0 ${isLight ? 'bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0)_0%,_rgba(15,23,42,0.06)_70%,_rgba(15,23,42,0.12)_100%)]' : 'bg-[radial-gradient(circle_at_center,_rgba(0,0,0,0)_0%,_rgba(0,0,0,0.25)_70%,_rgba(0,0,0,0.5)_100%)]'}`} />

        {/* Subtle Grain Overlay */}
        <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
      </div>

      {/* Header */}
      <header className="p-6 relative z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
 
          <div 

            // className="p-2 rounded-xl bg-card border border-border shadow-glow"
            className="p-2 rounded-xl bg-card border border-border dark:bg-white/90 dark:border-white/10 "
            
            >
              <img src="/sendfx.png" alt="SendFx logo" 
              
              // className="w-7 h-7"
              
              className="h-8 w-auto shrink-0 object-contain"/>
            </div>

          </div>

          
          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#overview" className="hover:text-foreground transition-colors">Overview</a>
            <a href="#product" className="hover:text-foreground transition-colors">Product</a>
            <a href="#templates" className="hover:text-foreground transition-colors">Use cases</a>
            <a href="#demo" className="hover:text-foreground transition-colors">Demo</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#trust" className="hover:text-foreground transition-colors">Trust</a>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="hidden md:inline-flex items-center gap-2"
              onClick={handleWatchDemo}
            >
              <PlayCircle className="w-4 h-4" />
              Watch demo (60s)
            </Button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full bg-background/50 border border-border text-foreground/80 hover:text-foreground hover:bg-muted transition-colors backdrop-blur-md"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Button onClick={handleInstagramLogin} className="hidden md:inline-flex">Start free</Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 pb-16 md:pb-24 relative z-10">
        <div className="max-w-6xl mx-auto space-y-16 md:space-y-24">

          {/* Hero */}
          <section id="overview" className="grid md:grid-cols-2 gap-10 md:gap-14 items-center">
            <div className="space-y-5 md:space-y-6 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/40 border border-border text-muted-foreground text-[11px] font-medium backdrop-blur-md">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Instagram-first automation for SMBs</span>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-foreground tracking-tight md:tracking-tighter leading-[1.05] md:leading-[1.08]">
                Instagram DM automation + lightweight CRM for SMBs.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-relaxed md:leading-[1.7]">
                Route and qualify inbound DMs, reply with guardrails and approvals, and sync leads to Google Sheets without losing the human touch.
              </p>

              <div className="space-y-3">
                {/* Error Message */}
                {error && (
                  <div className="animate-fade-in">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 text-left max-w-xl">
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                      <div>
                        <p className="text-red-200 text-sm font-medium">Notice</p>
                        <p className="text-red-300/80 text-xs mt-0.5">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {showEmailLogin ? (
                  <div className="w-full max-w-md animate-fade-in">
                    <form onSubmit={handleEmailLogin} className="space-y-4">
                      <div className="glass-panel p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-xl">
                        <h2 className="text-xl font-bold text-foreground mb-4 text-left">Log in with email</h2>

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

                          <div className="text-left">
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
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        onClick={handleInstagramLogin}
                        disabled={loading}
                        className="group inline-flex items-center gap-3 px-6 py-3 text-base"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Instagram className="w-4 h-4" />}
                        <span>Start free</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </Button>
                      <Button
                        variant="outline"
                        className="inline-flex items-center gap-2"
                        onClick={handleWatchDemo}
                      >
                        <PlayCircle className="w-4 h-4" />
                        Watch demo (60s)
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-3">
                      <span>Free plan</span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span>Setup in 5 min</span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span>Cancel anytime</span>
                    </div>
                    <div className="mt-2">
                      <button
                        onClick={() => setShowEmailLogin(true)}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
                      >
                        Prefer email? Log in with email
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-sm text-muted-foreground border border-border/70 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-2 bg-background/60 backdrop-blur-md w-full max-w-full text-left sm:inline-flex sm:w-auto">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Built for SMBs on Instagram: bookings, restaurants, salons, ecommerce, local services</span>
              </div>
            </div>

            {/* Mock Panel */}
            <div className="relative">
              <div className={`glass-panel rounded-3xl p-4 md:p-6 space-y-4 ${surfaceMain}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <p className="text-sm text-foreground font-semibold">Guardrails ON</p>
                  </div>
                  <div className="text-xs text-muted-foreground px-2 py-1 rounded-full border border-border/60">Live</div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-2xl border border-border/60 bg-background/60">
                    <p className="text-xs text-muted-foreground">Inbox</p>
                    <div className="space-y-2 mt-2">
                      <div className="p-2 rounded-xl bg-primary/10 text-primary">New: Shipping ETA?</div>
                      <div className="p-2 rounded-xl bg-muted text-foreground/80">VIP: Bulk order</div>
                      <div className="p-2 rounded-xl bg-muted text-foreground/80">Clinic: Follow-up</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl border border-border/60 bg-background/60">
                    <p className="text-xs text-muted-foreground">Flow</p>
                    <div className="space-y-2 mt-2">
                      <div className="p-2 rounded-xl bg-primary/10 text-primary">Intent detected</div>
                      <div className="p-2 rounded-xl bg-amber-100/10 text-amber-300">Safety check</div>
                      <div className="p-2 rounded-xl bg-emerald-100/10 text-emerald-300">Route to sales</div>
                      <div className="p-2 rounded-xl bg-indigo-100/10 text-indigo-300">Reply + summary</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl border border-border/60 bg-background/60 space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Suggested reply</p>
                      <p className="mt-1 text-sm text-foreground">“We can deliver by Friday. Want me to reserve stock?”</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/30">Approve</div>
                      <div className="px-2 py-1 rounded-full bg-muted text-foreground border border-border/60">Edit</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Typical outcomes */}
          <section className="grid md:grid-cols-3 gap-4 text-left">
            {[
              { label: 'Faster first response', value: '2-4x', detail: 'Automated triage + safe suggested replies' },
              { label: 'Fewer missed DMs', value: '95%+', detail: 'Routing + alerts prevent inbox drops' },
              { label: 'More correct handoffs', value: '3x', detail: 'Approvals and clear summaries for humans' },
            ].map((item) => (
              <div key={item.label} className={`glass-panel p-4 rounded-2xl ${surfaceSoft}`}>
                <p className="text-sm text-muted-foreground">Typical outcomes</p>
                <p className="text-2xl font-extrabold text-foreground mt-1">{item.value}</p>
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.detail}</p>
              </div>
            ))}
          </section>

          {/* How it works */}
          <section id="product" className="space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Workflow className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Product</p>
                <h2 className="text-2xl md:text-3xl font-extrabold text-foreground">How SendFx works</h2>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { title: 'Detect intent and route', body: 'Classify DMs and route to sales, support, or bookings.' },
                { title: 'Draft replies with approvals', body: 'AI drafts responses and stops for approval when needed.' },
                { title: 'Handoff when confidence is low', body: 'Send edge cases to a teammate with context and summary.' },
              ].map((step) => (
                <div key={step.title} className={`glass-panel p-5 rounded-2xl ${surfaceSoft}`}>
                  <p className="text-base font-semibold text-foreground">{step.title}</p>
                  <p className="text-sm text-muted-foreground mt-1.5">{step.body}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">Start with templates. Customize later.</p>
          </section>

          {/* Demo */}
          <section id="demo" className="space-y-6 text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <PlayCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Demo</p>
                <h3 className="text-xl md:text-2xl font-extrabold text-foreground">Watch a 60-second walkthrough</h3>
              </div>
            </div>
            <div className="grid md:grid-cols-[1.4fr,0.6fr] gap-6">
              <div className={`glass-panel p-4 rounded-2xl ${surfaceSoft}`}>
                {hasDemoVideo ? (
                  <div className="aspect-video overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
                    <iframe
                      className="h-full w-full"
                      src={demoVideoUrl}
                      title="SendFx product demo"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <div className="aspect-video rounded-2xl border border-dashed border-border/70 bg-muted/40 flex flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground">
                    <p className="text-base font-semibold text-foreground">Demo video coming soon.</p>
                    <p>Start free to explore templates and workflows inside the app.</p>
                    <Button onClick={handleInstagramLogin} disabled={loading} className="mt-1">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start free'}
                    </Button>
                  </div>
                )}
              </div>
              <div className={`glass-panel p-5 rounded-2xl ${surfaceSoft}`}>
                <p className="text-sm font-semibold text-foreground">What you will see</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>How DMs get classified and routed.</li>
                  <li>Approval stops for sensitive replies.</li>
                  <li>Google Sheets sync for leads.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Core differentiation */}
          <section id="features" className="space-y-6 text-left">
            <h3 className="text-xl md:text-2xl font-extrabold text-foreground">Why SMBs pick SendFx</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: 'On-brand AI replies',
                  body: 'Trained on your menu, pricing, and FAQs so every DM sounds like you.',
                  icon: MessageSquare,
                },
                {
                  title: 'Guardrails + approvals',
                  body: 'Block forbidden claims, require approval for sensitive cases, keep compliance intact.',
                  icon: ShieldCheck,
                },
                {
                  title: 'Smart routing + handoff',
                  body: 'Auto-route to sales, bookings, or support with summaries and context.',
                  icon: Workflow,
                },
              ].map(({ title, body, icon: Icon }) => (
                <div key={title} className={`glass-panel p-6 rounded-2xl text-left hover:bg-muted/40 transition-colors ${surfaceSoft}`}>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 text-primary">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h4 className="font-semibold text-lg text-foreground mb-2">{title}</h4>
                  <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Templates gallery */}
          <section id="templates" className="space-y-6 text-left">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Templates</p>
                <h3 className="text-xl md:text-2xl font-extrabold text-foreground">Use cases and templates built for SMBs</h3>
                <p className="text-sm text-muted-foreground">Bookings, sales, and support templates you can launch in minutes.</p>
              </div>
              <Button
                variant="outline"
                className="hidden md:inline-flex items-center gap-2"
                onClick={handleWatchDemo}
              >
                <PlayCircle className="w-4 h-4" />
                Watch demo (60s)
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {[
                'Bookings and appointments',
                'Restaurant reservations',
                'Pricing and quotes',
                'Product availability',
                'Order tracking',
                'Customer complaints',
              ].map((template) => (
                <div key={template} className={`glass-panel p-5 rounded-2xl flex flex-col gap-3 ${surfaceSoft}`}>
                  <p className="font-semibold text-foreground">{template}</p>
                  <p className="text-sm text-muted-foreground flex-1">Preview flow steps and suggested replies.</p>
                  <Button variant="outline" className="w-full" onClick={() => setPreviewTemplate(template)}>Preview flow</Button>
                </div>
              ))}
            </div>
          </section>

          {/* Control & Safety */}
          <section id="trust" className="space-y-6 text-left">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <LockKeyhole className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Control & Safety</p>
                <h3 className="text-xl md:text-2xl font-extrabold text-foreground">Operational controls that keep you in charge</h3>
              </div>
            </div>
            <div className="grid md:grid-cols-[1.2fr,0.8fr] gap-6">
              <div className={`glass-panel p-6 md:p-8 rounded-2xl space-y-3 ${surfaceSoft}`}>
                {[
                  'Role permissions (who can publish flows)',
                  'Approval stops (manual review before send)',
                  'Audit trail (every send logged with context)',
                  'Safe mode (auto-escalate when confidence is low)',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-foreground">
                    <ShieldCheck className="w-4 h-4 text-primary mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className={`glass-panel rounded-2xl p-4 shadow-lg ${surfaceSoft}`}>
                <div className={`h-full rounded-xl border ${isLight ? 'border-black/5 bg-white/85' : 'border-border/60 bg-gradient-to-br from-background/90 to-muted/60'} p-4 text-sm text-muted-foreground`}>
                  <p className="text-foreground font-semibold mb-2">Control Center</p>
                  <p>Preview flows, approvals, and audit history in one place. (Add live screenshot here for launch.)</p>
                </div>
              </div>
            </div>
          </section>

          {/* Pricing */}
          <section id="pricing" className="space-y-6 text-left">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Pricing</p>
                <h2 className="text-2xl md:text-3xl font-extrabold text-foreground mt-2">Simple pricing for Instagram businesses</h2>
                <p className="text-muted-foreground mt-2 max-w-2xl">Start free, upgrade as your DM volume grows.</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="w-4 h-4" />
                <span>Cancel anytime • Upgrade anytime</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: 'Free', price: '$0', note: 'Get started', perks: ['1 Instagram account', 'Basic inbox + tags', 'Starter templates', 'Manual replies'] },
                { name: 'Starter', price: '$24.99', note: 'Growing SMBs', highlight: true, perks: ['1 workspace', '2 team seats', 'Guardrails + approvals', 'Google Sheets sync'] },
                { name: 'Pro', price: '$99', note: 'High-volume teams', perks: ['3 workspaces', '5 team seats', 'Advanced routing + handoff', 'Priority support'] },
              ].map((plan) => (
                <div
                  key={plan.name}
                  className={`glass-panel p-6 md:p-8 rounded-2xl space-y-4 ${plan.highlight ? (isLight ? 'bg-white border border-primary/40 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.35)]' : 'border-primary/60 bg-primary/5 backdrop-blur-md') : surfaceSoft}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{plan.note}</p>
                      <p className="text-3xl font-extrabold text-foreground mt-1">{plan.price}<span className="text-base font-semibold text-muted-foreground"> / month</span></p>
                    </div>
                    {plan.highlight && (
                      <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/30">Popular</div>
                    )}
                  </div>
                  <ul className="space-y-3 text-sm text-foreground">
                    {plan.perks.map((perk) => (
                      <li key={perk} className="flex items-start gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary mt-0.5" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                  <Button onClick={handleInstagramLogin} disabled={loading} className="w-full">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start free'}
                  </Button>
                  <p className="text-xs text-muted-foreground">Usage counts when a reply is sent or a flow runs.</p>
                </div>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section className="space-y-4 text-left">
            <h3 className="text-xl md:text-2xl font-extrabold text-foreground">FAQ</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { q: 'Is this safe for Instagram?', a: 'Guardrails and approval stops help prevent risky replies before they send.' },
                { q: 'Can I start free without connecting Instagram?', a: 'Yes. Explore templates and workflows, then connect when ready.' },
                { q: 'How long does setup take?', a: 'Most SMBs connect and launch their first flow in under 10 minutes.' },
                { q: 'Can I approve messages before they send?', a: 'Yes. Require approval for any intent or keyword you choose.' },
                { q: 'Does it support bookings and restaurants?', a: 'Yes. Templates cover bookings, menus, pricing, and availability.' },
                { q: 'Can I sync leads to Google Sheets?', a: 'Yes. Send qualified leads and contact updates to Sheets automatically.' },
              ].map(({ q, a }) => (
                <div key={q} className={`glass-panel p-5 rounded-2xl ${surfaceSoft}`}>
                  <p className="font-semibold text-foreground">{q}</p>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      
      {/* Floating Assistant */}
      <AssistantWidget locationHint="landing" />

      {/* Templates modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="max-w-lg w-full bg-card border border-border/80 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xl font-semibold text-foreground">{previewTemplate}</h4>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="text-muted-foreground hover:text-foreground transition"
                aria-label="Close preview"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Example flow: detect intent → route or reply → escalate to human when needed. Customize tone, approvals, and handoff notes.
            </p>
            <div className="glass-panel rounded-xl border border-border/60 bg-background/70 p-4 text-sm text-foreground">
              <p className="font-semibold mb-2">Steps</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Intent detected from incoming DM</li>
                <li>Safety check</li>
                <li>Fetch relevant template answer</li>
                <li>Offer suggested reply with summary</li>
                <li>Approval stop if sensitive; otherwise send</li>
                <li>Escalate to human with context if unsure</li>
              </ol>
            </div>
            <Button onClick={() => setPreviewTemplate(null)} className="w-full">Close</Button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="p-8 text-center text-slate-600 text-sm relative z-10">
        <p>© 2024 SendFx. Instagram DM automation for SMBs.</p>
      </footer>
      </div>
    </>
  );
};

export default Landing;
