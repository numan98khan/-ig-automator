import React, { useMemo, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock, Moon, Sun } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import Seo from '../components/Seo';

const Auth: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignup = location.pathname === '/signup';
  const { login, signup, user, loading } = useAuth();
  const { theme, setTheme, uiTheme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTarget = useMemo(() => {
    const state = location.state as { from?: { pathname?: string; search?: string } } | null;
    if (state?.from?.pathname) {
      return `${state.from.pathname}${state.from.search ?? ''}`;
    }
    return '/home';
  }, [location.state]);

  useEffect(() => {
    if (!loading && user) {
      navigate('/home', { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    const messageParam = params.get('message');
    if (errorParam) {
      setError(messageParam ? decodeURIComponent(messageParam) : `Authentication failed: ${errorParam}`);
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      if (isSignup) {
        await signup(email, password);
      } else {
        await login(email, password);
      }
      navigate(redirectTarget, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Unable to authenticate. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo title={isSignup ? 'Sign up | SendFx' : 'Log in | SendFx'} robots="noindex, nofollow" />
      <div className="min-h-screen grid grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] relative">
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="absolute right-6 top-6 z-20 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-2 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur transition hover:text-foreground"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <div className="auth-brand-panel hidden md:flex">
          <div className="auth-brand-content">
            {uiTheme === 'studio' ? (
              <>
                <img src="/sendfx-studio.png" alt="SendFx" className="auth-brand-logo block dark:hidden" />
                <img src="/sendfx-studio-dark.png" alt="SendFx" className="auth-brand-logo hidden dark:block" />
              </>
            ) : (
              <>
                <img src="/sendfx.png" alt="SendFx" className="auth-brand-logo block dark:hidden" />
                <img src="/sendfx-dark.png" alt="SendFx" className="auth-brand-logo hidden dark:block" />
              </>
            )}
            <span className="auth-brand-badge">Automation studio</span>
            <h2 className="auth-brand-title">Automate DMs. Close faster.</h2>
            <p className="auth-brand-subtitle">
              A focused workspace for Instagram teams that want faster replies, smarter routing,
              and more qualified leads.
            </p>
            <ul className="auth-brand-bullets">
              <li>Faster replies with templates</li>
              <li>Smart routing + tagging</li>
              <li>Leads captured after-hours</li>
            </ul>
          </div>
        </div>
        <div className="auth-form-panel relative flex items-center justify-center px-6 py-16">
          <div className="auth-card w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur">
            <div className="space-y-3 text-center">
              <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                SendFx app
              </span>
              <h1 className="text-2xl font-semibold md:text-3xl">
                {isSignup ? 'Create your workspace' : 'Welcome back'}
              </h1>
              <p className="text-sm text-muted-foreground/80">
                {isSignup ? 'Start automating your inbox today.' : 'Log in to manage your automations.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-10 space-y-5">
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                icon={<Mail className="h-4 w-4" />}
                required
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                icon={<Lock className="h-4 w-4" />}
                required
              />

              <Button type="submit" className="w-full" isLoading={submitting}>
                {isSignup ? 'Create account' : 'Log in'}
              </Button>

              {!isSignup && (
                <div className="text-right">
                  <Link to="/request-password-reset" className="text-xs text-muted-foreground hover:text-foreground">
                    Forgot your password?
                  </Link>
                </div>
              )}
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {isSignup ? 'Already have an account?' : 'New to SendFx?'}{' '}
              <Link
                to={isSignup ? '/login' : '/signup'}
                className="font-semibold text-foreground hover:text-primary"
              >
                {isSignup ? 'Log in' : 'Create an account'}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
