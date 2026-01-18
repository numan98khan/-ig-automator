import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Clock,
  CreditCard,
  Lock,
  LockKeyhole,
  Mail,
  MessageSquare,
  Moon,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Sun,
  Workflow,
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
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const messageParam = params.get('message');

    if (errorParam) {
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
      setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
        setError(null);
      }, 8000);
      return;
    }

    if (user && currentWorkspace) {
      console.log('✅ User authenticated, redirecting...');
      const from = location.state?.from?.pathname || '/app/home';
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

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    setError(null);
    redirectToApp('login');
  };

  const handleEmailSignup = async (event: React.FormEvent) => {
    event.preventDefault();
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
      <div className="marketing-shell relative min-h-screen overflow-hidden">
        <div className="marketing-backdrop" aria-hidden="true">
          <div className="marketing-glow marketing-glow--one" />
          <div className="marketing-glow marketing-glow--two" />
          <div className="marketing-glow marketing-glow--three" />
          <div className="marketing-grid" />
        </div>

        <header className="relative z-10 px-6 pt-6">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="marketing-logo">
                <img
                  src="/sendfx.png"
                  alt="SendFx logo"
                  className="h-7 w-auto shrink-0 object-contain dark:hidden"
                />
                <img
                  src="/sendfx-dark.png"
                  alt="SendFx logo"
                  className="hidden h-7 w-auto shrink-0 object-contain dark:block"
                />
              </div>
              <span className="text-sm font-semibold text-white/80">SendFx</span>
            </div>
            <nav className="hidden items-center gap-6 text-xs font-semibold uppercase tracking-[0.2em] text-white/60 md:flex">
              <a className="marketing-nav" href="#overview">Overview</a>
              <a className="marketing-nav" href="#product">Product</a>
              <a className="marketing-nav" href="#templates">Use cases</a>
              <a className="marketing-nav" href="#pricing">Pricing</a>
            </nav>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="marketing-theme"
                title="Toggle Theme"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <Button onClick={() => openAuthModal('signup')} className="hidden md:inline-flex">
                Sign up free
              </Button>
            </div>
          </div>
        </header>

        <main className="relative z-10 px-6 pb-20 pt-10">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-16 md:gap-20">
            <section id="overview" className="grid items-center gap-10 md:grid-cols-[1.05fr,0.95fr]">
              <div className="space-y-6">
                <div className="marketing-pill">
                  <Sparkles className="h-3 w-3 text-amber-300" />
                  <span>Instagram-first automation for SMBs</span>
                </div>
                <h1 className="marketing-hero-title">
                  Instagram DM automation + lightweight CRM for SMBs.
                </h1>
                <p className="marketing-hero-body">
                  Route and qualify inbound DMs, reply with guardrails and approvals, and sync leads to Google Sheets without losing the human touch.
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <Button onClick={() => openAuthModal('signup')} className="group">
                    <span>Sign up free</span>
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                  <Button variant="outline" onClick={handleWatchDemo} className="marketing-outline">
                    <PlayCircle className="h-4 w-4" />
                    Watch demo (60s)
                  </Button>
                </div>
                {error && !showEmailModal && (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-left text-xs text-red-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      <p>{error}</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-white/60">
                  <span className="marketing-meta">
                    <CreditCard className="h-3.5 w-3.5" />
                    Free plan
                  </span>
                  <span className="marketing-meta">
                    <Clock className="h-3.5 w-3.5" />
                    Setup in 5 min
                  </span>
                  <span className="marketing-meta">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Cancel anytime
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openAuthModal('login')}
                  className="text-xs font-semibold text-white/60 transition hover:text-white"
                >
                  Already have an account? Log in
                </button>
              </div>

              <div className="relative">
                <div className="marketing-hero-card">
                  <img
                    src="/sd_phone.jpg"
                    alt="SendFx product preview"
                    className="h-full w-full rounded-[32px] object-cover object-[85%_center]"
                    loading="eager"
                    decoding="async"
                  />
                </div>
                <div className="marketing-float marketing-float--top">
                  <Badge variant="warning" className="gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Approval needed
                  </Badge>
                  <p className="mt-3 text-[11px] uppercase tracking-[0.2em] text-white/50">Suggested reply</p>
                  <p className="mt-1 text-sm text-white">
                    We can deliver by Friday. Want me to reserve stock?
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="pointer-events-none">Approve</Button>
                    <Button size="sm" variant="outline" className="pointer-events-none">
                      Edit
                    </Button>
                  </div>
                </div>
                <div className="marketing-float marketing-float--bottom">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/50">Inbox performance</p>
                  <p className="mt-2 text-base font-semibold text-white">AI handled: High</p>
                  <p className="text-xs text-white/50">Based on recent threads</p>
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
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              {[
                { label: 'Faster first response', value: '2-4x', detail: 'Automated triage + safe suggested replies' },
                { label: 'Fewer missed DMs', value: '95%+', detail: 'Routing + alerts prevent inbox drops' },
                { label: 'More correct handoffs', value: '3x', detail: 'Approvals and clear summaries for humans' },
              ].map((item) => (
                <div key={item.label} className="marketing-stat">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/50">Typical outcomes</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{item.value}</p>
                  <p className="text-sm text-white/70">{item.label}</p>
                  <p className="text-xs text-white/50">{item.detail}</p>
                </div>
              ))}
            </section>

            <section id="product" className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="marketing-icon">
                  <Workflow className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Product</p>
                  <h2 className="marketing-section-title">How SendFx works</h2>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { title: 'Detect intent and route', body: 'Classify DMs and route to sales, support, or bookings.' },
                  { title: 'Draft replies with approvals', body: 'AI drafts responses and stops for approval when needed.' },
                  { title: 'Handoff when confidence is low', body: 'Send edge cases to a teammate with context and summary.' },
                ].map((step) => (
                  <div key={step.title} className="marketing-card">
                    <p className="text-base font-semibold text-white">{step.title}</p>
                    <p className="mt-2 text-sm text-white/60">{step.body}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-white/50">Start with templates. Customize later.</p>
            </section>

            <section id="demo" className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="marketing-icon">
                  <PlayCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Demo</p>
                  <h3 className="marketing-section-title">Watch a 60-second walkthrough</h3>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-[1.4fr,0.6fr]">
                <div className="marketing-video">
                  {hasDemoVideo ? (
                    <div className="aspect-video overflow-hidden rounded-3xl border border-white/10 bg-black/40">
                      <iframe
                        className="h-full w-full"
                        src={demoVideoUrl}
                        title="SendFx product demo"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/20 bg-white/5 px-6 py-12 text-center text-sm text-white/60">
                      <p className="text-base font-semibold text-white">Demo video coming soon.</p>
                      <p>Sign up free to explore templates and workflows inside the app.</p>
                      <Button onClick={() => openAuthModal('signup')} className="mt-1">
                        Sign up free
                      </Button>
                    </div>
                  )}
                </div>
                <div className="marketing-card h-full">
                  <p className="text-sm font-semibold text-white">What you will see</p>
                  <ul className="mt-3 space-y-2 text-sm text-white/60">
                    <li>How DMs get classified and routed.</li>
                    <li>Approval stops for sensitive replies.</li>
                    <li>Google Sheets sync for leads.</li>
                  </ul>
                </div>
              </div>
            </section>

            <section id="features" className="space-y-6">
              <h3 className="marketing-section-title">Why SMBs pick SendFx</h3>
              <div className="grid gap-6 md:grid-cols-3">
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
                  <div key={title} className="marketing-card">
                    <div className="marketing-icon">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h4 className="mt-4 text-lg font-semibold text-white">{title}</h4>
                    <p className="mt-2 text-sm text-white/60">{body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="templates" className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Templates</p>
                  <h3 className="marketing-section-title">Use cases and templates built for SMBs</h3>
                  <p className="text-sm text-white/60">Bookings, sales, and support templates you can launch in minutes.</p>
                </div>
                <Button
                  variant="outline"
                  className="marketing-outline hidden items-center gap-2 md:inline-flex"
                  onClick={handleWatchDemo}
                >
                  <PlayCircle className="h-4 w-4" />
                  Watch demo (60s)
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {[
                  'Bookings and appointments',
                  'Restaurant reservations',
                  'Pricing and quotes',
                  'Product availability',
                  'Order tracking',
                  'Customer complaints',
                ].map((template) => (
                  <div key={template} className="marketing-card">
                    <p className="font-semibold text-white">{template}</p>
                    <p className="mt-2 flex-1 text-sm text-white/60">Preview flow steps and suggested replies.</p>
                    <Button
                      variant="outline"
                      className="marketing-outline mt-4 w-full"
                      onClick={() => setPreviewTemplate(template)}
                    >
                      Preview flow
                    </Button>
                  </div>
                ))}
              </div>
            </section>

            <section id="trust" className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="marketing-icon">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Control & Safety</p>
                  <h3 className="marketing-section-title">Operational controls that keep you in charge</h3>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-[1.2fr,0.8fr]">
                <div className="marketing-card space-y-3">
                  {[
                    'Role permissions (who can publish flows)',
                    'Approval stops (manual review before send)',
                    'Audit trail (every send logged with context)',
                    'Safe mode (auto-escalate when confidence is low)',
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 text-sm text-white">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-cyan-300" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="marketing-card">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
                    <p className="mb-2 text-white">Control Center</p>
                    <p>Preview flows, approvals, and audit history in one place. (Add live screenshot here for launch.)</p>
                  </div>
                </div>
              </div>
            </section>

            <section id="pricing" className="space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Pricing</p>
                  <h2 className="marketing-section-title">Simple pricing for Instagram businesses</h2>
                  <p className="mt-2 max-w-2xl text-sm text-white/60">Sign up free, upgrade as your DM volume grows.</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/60">
                  <CreditCard className="h-4 w-4" />
                  <span>Cancel anytime • Upgrade anytime</span>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {[
                  { name: 'Free', price: '$0', note: 'Get started', perks: ['1 Instagram account', 'Basic inbox + tags', 'Starter templates', 'Manual replies'] },
                  { name: 'Starter', price: '$24.99', note: 'Growing SMBs', highlight: true, perks: ['1 workspace', '2 team seats', 'Guardrails + approvals', 'Google Sheets sync'] },
                  { name: 'Pro', price: '$99', note: 'High-volume teams', perks: ['3 workspaces', '5 team seats', 'Advanced routing + handoff', 'Priority support'] },
                ].map((plan) => (
                  <div
                    key={plan.name}
                    className={`marketing-card ${plan.highlight ? 'marketing-card--highlight' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-white/50">{plan.note}</p>
                        <p className="mt-1 text-3xl font-semibold text-white">
                          {plan.price}
                          <span className="text-base font-semibold text-white/60"> / month</span>
                        </p>
                      </div>
                      {plan.highlight && (
                        <div className="rounded-full border border-cyan-200/40 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                          Popular
                        </div>
                      )}
                    </div>
                    <ul className="space-y-3 text-sm text-white">
                      {plan.perks.map((perk) => (
                        <li key={perk} className="flex items-start gap-2">
                          <ShieldCheck className="mt-0.5 h-4 w-4 text-cyan-300" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>
                    <Button onClick={() => openAuthModal('signup')} className="w-full">
                      Sign up free
                    </Button>
                    <p className="text-xs text-white/50">Usage counts when a reply is sent or a flow runs.</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="marketing-section-title">FAQ</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { q: 'Is this safe for Instagram?', a: 'Guardrails and approval stops help prevent risky replies before they send.' },
                  { q: 'Can I start free without connecting Instagram?', a: 'Yes. Explore templates and workflows, then connect when ready.' },
                  { q: 'How long does setup take?', a: 'Most SMBs connect and launch their first flow in under 10 minutes.' },
                  { q: 'Can I approve messages before they send?', a: 'Yes. Require approval for any intent or keyword you choose.' },
                  { q: 'Does it support bookings and restaurants?', a: 'Yes. Templates cover bookings, menus, pricing, and availability.' },
                  { q: 'Can I sync leads to Google Sheets?', a: 'Yes. Send qualified leads and contact updates to Sheets automatically.' },
                ].map(({ q, a }) => (
                  <div key={q} className="marketing-card">
                    <p className="font-semibold text-white">{q}</p>
                    <p className="mt-2 text-sm text-white/60">{a}</p>
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
              className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151725]/90 p-6 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 id="email-login-title" className="text-xl font-bold text-white">
                  {authMode === 'login' ? 'Log in with email' : 'Create your account'}
                </h2>
                <button
                  type="button"
                  onClick={closeEmailModal}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 text-white/60 transition hover:text-white"
                  aria-label="Close email login"
                >
                  ✕
                </button>
              </div>

              {error && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-left">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <p className="text-xs text-red-200/80">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailSignup} className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/60">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                      placeholder="your@email.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/60">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/40 py-3 pl-11 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
                      placeholder="Enter your password"
                      required
                    />
                  </div>
                </div>

                <Button type="submit" size="lg" isLoading={authLoading} className="w-full">
                  {authMode === 'login' ? 'Log in' : 'Create account'}
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
                  {authMode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        closeEmailModal();
                        navigate('/request-password-reset');
                      }}
                      className="transition hover:text-white"
                    >
                      Forgot password?
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    className="transition hover:text-white"
                  >
                    {authMode === 'login' ? 'New here? Create an account' : 'Already have an account? Log in'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showAssistant && <AssistantWidget locationHint="landing" />}

        {previewTemplate && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
            <div className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-[#151725]/90 p-6 text-white shadow-2xl">
              <div className="flex items-center justify-between">
                <h4 className="text-xl font-semibold">{previewTemplate}</h4>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="text-white/60 transition hover:text-white"
                  aria-label="Close preview"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-white/60">
                Example flow: detect intent → route or reply → escalate to human when needed. Customize tone, approvals, and handoff notes.
              </p>
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white">
                <p className="mb-2 font-semibold">Steps</p>
                <ol className="list-decimal space-y-1 pl-4 text-white/60">
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

        <footer className="relative z-10 px-6 pb-10 pt-4 text-center text-xs text-white/40">
          <p>© 2024 SendFx. Instagram DM automation for SMBs.</p>
        </footer>
      </div>
    </>
  );
};

export default Landing;
