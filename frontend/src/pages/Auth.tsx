import React, { useMemo, useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mail, Lock } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useAuth } from '../context/AuthContext';
import Seo from '../components/Seo';

const Auth: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isSignup = location.pathname === '/signup';
  const { login, signup, user, loading } = useAuth();
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
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <Seo title={isSignup ? 'Sign up | SendFx' : 'Log in | SendFx'} robots="noindex, nofollow" />
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card/70 p-8 shadow-2xl backdrop-blur">
        <div className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">SendFx app</p>
          <h1 className="text-2xl font-semibold">
            {isSignup ? 'Create your workspace' : 'Welcome back'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSignup ? 'Start automating your inbox today.' : 'Log in to manage your automations.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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
  );
};

export default Auth;
