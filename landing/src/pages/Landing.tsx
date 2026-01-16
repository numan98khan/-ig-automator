import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Clock,
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
import { Badge } from '../components/ui/Badge';
import AssistantWidget from '../components/AssistantWidget';
import Seo from '../components/Seo';
import { requireEnv } from '../utils/env';

const Landing: React.FC = () => {
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [showAssistant, setShowAssistant] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { user, currentWorkspace } = useAuth();
  const { theme, setTheme, uiTheme } = useTheme();
  const navigate = useNavigate();
  const seoDescription =
    'SendFx is Instagram DM automation and a lightweight CRM for SMBs. Route and qualify DMs, reply with guardrails and approvals, and sync leads to Google Sheets.';
  const siteUrl = requireEnv('VITE_SITE_URL').replace(/\/$/, '');
  const appUrl = requireEnv('VITE_APP_URL').replace(/\/$/, '');
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
  const redirectToApp = (mode: 'login' | 'signup') => {
    window.location.href = `${appUrl}/${mode}`;
  };
  const openAuthModal = (mode: 'login' | 'signup') => {
    setError(null);
    redirectToApp(mode);
  };
  const closeEmailModal = () => {
    setShowEmailModal(false);
    setError(null);
  };

  const location = useLocation();
  const isLight = theme === 'light';
  const isComic = uiTheme === 'comic';
  const isStudio = uiTheme === 'studio';
  const surfaceMain = isLight
    ? (isComic
      ? 'comic-panel bg-white'
      : 'bg-card/90 border border-border/70 shadow-[0_22px_70px_-40px_rgba(0,0,0,0.35)]')
    : 'bg-card/70 border border-border/60 backdrop-blur-xl shadow-2xl';
  const surfaceSoft = isLight
    ? (isComic
      ? 'comic-panel-soft bg-white'
      : 'bg-card/85 border border-border/70 shadow-[0_18px_60px_-38px_rgba(0,0,0,0.35)]')
    : 'bg-background/60 border border-border/60 backdrop-blur-md';
  const modalCardClass = isLight
    ? 'bg-card border border-border/70 shadow-2xl'
    : 'bg-card border border-border/60 shadow-2xl';
  const modalInputClass = isLight
    ? 'bg-background border-border/60 focus:ring-primary/40'
    : 'bg-background border-border/60 focus:ring-primary/40';
  const pageBackground = isLight
    ? (isComic ? 'bg-[#fffbe6]' : isStudio ? 'bg-[#fbf6ef]' : 'bg-[#f7f8fb]')
    : 'bg-background';
  const sectionHeadingClass = isComic ? 'comic-display' : '';
  const heroOverlayClass =
    'rounded-2xl border border-border/60 bg-background/95 p-3 text-foreground shadow-[0_18px_40px_-26px_rgba(15,23,42,0.6)] backdrop-blur-sm';

  useEffect(() => {
    // Check for errors in URL params
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const messageParam = params.get('message');

    if (errorParam) {
      // Use custom message if provided, otherwise use default error message
      if (messageParam) {
        setError(decodeURIComponent(messageParam));
        setShowEmailModal(true);
      } else if (errorParam === 'account_secured') {
        setError('You have already secured your account. Please log in with your email and password.');
        setShowEmailModal(true);
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

    // If user is already logged in with workspace, redirect to Home or original destination
    if (user && currentWorkspace) {
      console.log('✅ User authenticated, redirecting...');
      const from = location.state?.from?.pathname || '/app/home';
      // If the destination is the public landing, go to Home
      const target = (from === '/' || from === '/landing' || from === '/app')
        ? '/app/home'
        : from;
      navigate(target, { replace: true });
    }
  }, [user, currentWorkspace, navigate, location]);

  useEffect(() => {
    if (showAssistant) return;

    const reveal = () => setShowAssistant(true);
    const handleScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const progress = window.scrollY / scrollable;
      if (progress >= 0.3) {
        reveal();
      }
    };

    const timeoutId = window.setTimeout(reveal, 9000);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [showAssistant]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError(null);
    redirectToApp('login');
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setError(null);
    redirectToApp('signup');
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
      <div className={`min-h-screen relative overflow-x-hidden flex flex-col selection:bg-primary/30 ${pageBackground}`}>

      {/* Background Ambience */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {!isLight && (
          <>
            {/* Mesh gradient blobs */}
            <div className={`absolute ${isComic && isLight ? 'top-[-20%] left-[-20%] w-[50%] h-[50%]' : 'top-[-10%] left-[-10%] w-[45%] h-[45%]'} rounded-full ${isLight ? (isComic ? 'bg-[radial-gradient(circle_at_center,_rgba(255,79,216,0.28),_transparent_60%)] blur-2xl' : isStudio ? 'bg-[radial-gradient(circle_at_center,_rgba(251,146,60,0.18),_transparent_60%)] blur-2xl' : 'bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.14),_transparent_55%)] blur-2xl') : 'bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.2),_transparent_60%)] blur-3xl'}`} />
            <div className={`absolute ${isComic && isLight ? 'top-[5%] right-[-20%] w-[55%] h-[55%]' : 'top-[10%] right-[-12%] w-[50%] h-[50%]'} rounded-full ${isLight ? (isComic ? 'bg-[radial-gradient(circle_at_center,_rgba(0,212,255,0.25),_transparent_60%)] blur-2xl' : isStudio ? 'bg-[radial-gradient(circle_at_center,_rgba(20,184,166,0.18),_transparent_60%)] blur-2xl' : 'bg-[radial-gradient(circle_at_center,_rgba(59,130,246,0.1),_transparent_55%)] blur-2xl') : 'bg-[radial-gradient(circle_at_center,_rgba(56,189,248,0.18),_transparent_60%)] blur-3xl'}`} />
            <div className={`absolute ${isComic && isLight ? 'bottom-[-18%] left-[0%] w-[65%] h-[65%]' : 'bottom-[-12%] left-[5%] w-[60%] h-[60%]'} rounded-full ${isLight ? (isComic ? 'bg-[radial-gradient(circle_at_center,_rgba(255,226,74,0.25),_transparent_65%)] blur-2xl' : isStudio ? 'bg-[radial-gradient(circle_at_center,_rgba(251,191,36,0.14),_transparent_65%)] blur-2xl' : 'bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.08),_transparent_65%)] blur-2xl') : 'bg-[radial-gradient(circle_at_center,_rgba(94,234,212,0.16),_transparent_65%)] blur-3xl'}`} />

            {/* Grid overlay */}
            <div
              className="absolute inset-0 mix-blend-soft-light"
              style={{
                backgroundImage: isLight
                  ? (isComic
                    ? 'radial-gradient(rgba(15,23,42,0.18) 1px, transparent 1px)'
                    : 'linear-gradient(to right, rgba(15,23,42,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.05) 1px, transparent 1px)')
                  : `linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)`,
                backgroundSize: isLight ? (isComic ? '26px 26px' : '44px 44px') : '44px 44px',
              }}
            />

            {/* Vignette */}
            <div className={`absolute inset-0 ${isLight ? (isComic ? 'bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0)_0%,_rgba(15,23,42,0.08)_72%,_rgba(15,23,42,0.18)_100%)]' : 'bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0)_0%,_rgba(15,23,42,0.06)_70%,_rgba(15,23,42,0.12)_100%)]') : 'bg-[radial-gradient(circle_at_center,_rgba(0,0,0,0)_0%,_rgba(0,0,0,0.25)_70%,_rgba(0,0,0,0.5)_100%)]'}`} />
          </>
        )}

        {/* Subtle Grain Overlay */}
        <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />
      </div>

      {/* Header */}
      <header className="p-6 relative z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
 
          <div
            // className={`p-2 rounded-xl ${isLight ? (isComic ? 'comic-panel-soft' : 'bg-card border border-border') : 'bg-card border border-border'} dark:bg-white/90 dark:border-white/10`}
            className={`p-2 rounded-xl  `}
          >
            {isStudio ? (
              <>
                <img
                  src="/sendfx-studio.png"
                  alt="SendFx logo"
                  className="h-7 w-auto shrink-0 object-contain dark:hidden"
                />
                <img
                  src="/sendfx-studio-dark.png"
                  alt="SendFx logo"
                  // className="hidden h-7 w-auto shrink-0 object-contain dark:block"
                  className="hidden h-7 w-auto shrink-0 object-contain dark:block"
                />
              </>
            ) : (
              <>
                <img
                  src="/sendfx.png"
                  alt="SendFx logo"
                  className="h-8 w-auto shrink-0 object-contain dark:hidden"
                />
                <img
                  src="/sendfx-dark.png"
                  alt="SendFx logo"
                  className="hidden h-8 w-auto shrink-0 object-contain dark:block"
                />
              </>
            )}
          </div>

          </div>

          
          <div className="hidden md:flex items-center gap-7 text-[15px] font-semibold text-muted-foreground">
            <a href="#overview" className="hover:text-foreground transition-colors">Overview</a>
            <a href="#product" className="hover:text-foreground transition-colors">Product</a>
            <a href="#templates" className="hover:text-foreground transition-colors">Use cases</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-full bg-background/50 border border-border text-foreground/80 hover:text-foreground hover:bg-muted transition-colors backdrop-blur-md"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="hidden md:flex items-center gap-2">
              <Button onClick={() => openAuthModal('signup')}>Sign up free</Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 pb-16 md:pb-24 relative z-10">
        <div className="max-w-7xl mx-auto space-y-16 md:space-y-24">

          {/* Hero */}
          <section id="overview" className="grid md:grid-cols-[1.05fr,0.95fr] gap-10 md:gap-12 items-start">
            <div
              className={`space-y-4 md:space-y-5 text-left ${isComic && isLight ? 'comic-panel-soft bg-white/70 backdrop-blur-md p-6 md:p-8' : ''}`}
            >
              <div
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium backdrop-blur-md ${isComic ? 'comic-sticker text-foreground font-semibold' : 'bg-muted/40 border border-border text-muted-foreground'}`}
              >
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Instagram-first automation for SMBs</span>
              </div>
              <h1 className={`text-4xl sm:text-5xl md:text-5xl lg:text-6xl font-extrabold leading-[1.04] md:leading-[1.06] ${isComic ? 'text-[#ff3fd0] comic-display comic-shadow-text' : 'text-foreground tracking-tight md:tracking-tighter'}`}>
                Instagram DM automation + lightweight CRM for SMBs.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground leading-[1.5] md:leading-[1.6]">
                Route and qualify inbound DMs, reply with guardrails and approvals, and sync leads to Google Sheets without losing the human touch.
              </p>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() => openAuthModal('signup')}
                    className="group inline-flex items-center gap-3 px-6 py-3 text-base"
                  >
                    <span>Sign up free</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                  <Button
                    variant="outline"
                    className={`inline-flex items-center gap-2 ${isComic ? 'shadow-none bg-white/70' : ''}`}
                    onClick={handleWatchDemo}
                  >
                    <PlayCircle className="w-4 h-4" />
                    Watch demo (60s)
                  </Button>
                </div>
                {error && !showEmailModal && (
                  <div className="animate-fade-in">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-left max-w-xl">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-xs text-red-300/80">{error}</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1">
                    <CreditCard className="w-3.5 h-3.5 text-primary" />
                    Free plan
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    Setup in 5 min
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    Cancel anytime
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openAuthModal('login')}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium"
                >
                  Already have an account? Log in
                </button>
              </div>
            </div>

            {/* Hero Visual */}
            <div className="relative h-full">
              <div
                className={`relative overflow-hidden p-0 flex items-center justify-center h-full ${surfaceMain} ${isComic && isLight ? 'md:scale-[1.04]' : 'glass-panel rounded-3xl'}`}
              >
                <div
                  className="absolute -right-12 top-6 h-56 w-56 rounded-full bg-primary/20 blur-3xl opacity-70"
                  aria-hidden="true"
                />
                <div
                  className={`absolute bottom-5 left-1/2 h-6 w-[70%] -translate-x-1/2 rounded-full blur-2xl ${isLight ? 'bg-black/15 opacity-50' : 'bg-black/35 opacity-60'}`}
                  aria-hidden="true"
                />
                <img
                  src="/sd_phone.jpg"
                  alt="SendFx product preview"
                  // className="relative z-10 h-full w-full object-cover object-[35%_center]"
                  className="relative z-10 h-full w-full object-cover object-[85%_center]"
                  loading="eager"
                  decoding="async"
                />
              </div>
              <div className="absolute inset-0 z-20 pointer-events-none">
                <div 
                // className="hidden sm:block absolute -right-4 -top-4 w-[260px] sm:w-[300px] md:w-[320px] lg:w-[340px] md:-right-6 md:-top-6"
                className="hidden sm:block absolute -right-4 -top-4 w-[260px] sm:w-[300px] md:w-[320px] lg:w-[340px] md:-right-6 md:-top-6"
                >
                  <div className={heroOverlayClass}>
                    <Badge variant="warning" className="gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      Approval needed
                    </Badge>
                    <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Suggested reply</p>
                    <p
                      className="mt-1 text-[13px] text-foreground leading-snug"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      We can deliver by Friday. Want me to reserve stock?
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" className="pointer-events-none">Approve</Button>
                      <Button size="sm" variant="outline" className="pointer-events-none">Edit</Button>
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block absolute left-6 bottom-6 w-[240px] sm:w-[280px] md:w-[300px] lg:w-[320px] md:left-8 md:bottom-8">
                  <div className={heroOverlayClass}>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Inbox performance</p>
                    <p className="mt-2 text-base font-semibold text-foreground">AI handled: High</p>
                    <p className="text-xs text-muted-foreground mt-1">Based on recent threads</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="neutral" className="text-[10px] uppercase tracking-wide">
                        Human alert
                      </Badge>
                      <Badge variant="neutral" className="text-[10px] uppercase tracking-wide">
                        Pricing exception
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Typical outcomes */}
          <section className="grid md:grid-cols-3 gap-4 text-left mt-10 md:mt-16">
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
                <h2 className={`text-2xl md:text-3xl font-extrabold text-foreground ${sectionHeadingClass}`}>How SendFx works</h2>
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
                <h3 className={`text-xl md:text-2xl font-extrabold text-foreground ${sectionHeadingClass}`}>Watch a 60-second walkthrough</h3>
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
                    <p>Sign up free to explore templates and workflows inside the app.</p>
                    <Button onClick={() => openAuthModal('signup')} className="mt-1">
                      Sign up free
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
            <h3 className={`text-xl md:text-2xl font-extrabold text-foreground ${sectionHeadingClass}`}>Why SMBs pick SendFx</h3>
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
                <h3 className={`text-xl md:text-2xl font-extrabold text-foreground ${sectionHeadingClass}`}>Use cases and templates built for SMBs</h3>
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
                <h3 className={`text-xl md:text-2xl font-extrabold text-foreground ${sectionHeadingClass}`}>Operational controls that keep you in charge</h3>
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
                <h2 className={`text-2xl md:text-3xl font-extrabold text-foreground mt-2 ${sectionHeadingClass}`}>Simple pricing for Instagram businesses</h2>
                <p className="text-muted-foreground mt-2 max-w-2xl">Sign up free, upgrade as your DM volume grows.</p>
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
                      <div className={`px-3 py-1.5 rounded-full text-xs font-semibold ${isComic ? 'comic-sticker text-foreground' : 'bg-primary/10 text-primary border border-primary/30'}`}>Popular</div>
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
                  <Button onClick={() => openAuthModal('signup')} className="w-full">
                    Sign up free
                  </Button>
                  <p className="text-xs text-muted-foreground">Usage counts when a reply is sent or a flow runs.</p>
                </div>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section className="space-y-4 text-left">
            <h3 className={`text-xl md:text-2xl font-extrabold text-foreground ${sectionHeadingClass}`}>FAQ</h3>
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

      
      {showEmailModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 py-10"
          onClick={closeEmailModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-login-title"
        >
          <div
            className={`w-full max-w-md rounded-2xl p-6 md:p-7 ${modalCardClass}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 id="email-login-title" className="text-xl font-bold text-foreground">
                {authMode === 'login' ? 'Log in with email' : 'Create your account'}
              </h2>
              <button
                type="button"
                onClick={closeEmailModal}
                className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${isLight ? 'bg-white border-black/10 text-slate-500 hover:text-slate-900' : 'bg-[#141824] border-white/10 text-slate-200 hover:text-white'}`}
                aria-label="Close email login"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mt-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-left">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-300/80">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailSignup} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full pl-11 pr-4 py-3 border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${modalInputClass}`}
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
                    className={`w-full pl-11 pr-4 py-3 border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 ${modalInputClass}`}
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                isLoading={authLoading}
                className="w-full"
              >
                {authMode === 'login' ? 'Log in' : 'Create account'}
              </Button>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                {authMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      closeEmailModal();
                      navigate('/request-password-reset');
                    }}
                    className="hover:text-foreground transition"
                  >
                    Forgot password?
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className="hover:text-foreground transition"
                >
                  {authMode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Assistant */}
      {showAssistant && <AssistantWidget locationHint="landing" />}

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
            <div className={`rounded-xl p-4 text-sm text-foreground ${isLight ? (isComic ? 'comic-panel-soft' : 'glass-panel border border-border/60 bg-background/70') : 'glass-panel border border-border/60 bg-background/70'}`}>
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
