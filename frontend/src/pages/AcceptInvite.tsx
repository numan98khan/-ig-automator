import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { workspaceInviteAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Seo from '../components/Seo';

const AcceptInvite: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<'loading' | 'form' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [inviteDetails, setInviteDetails] = useState<{ email: string; workspaceName: string; role: string } | null>(null);

  // Form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchInviteDetails = async () => {
      const token = searchParams.get('token');
      console.log('📧 AcceptInvite page: Fetching invite details', { hasToken: !!token });

      if (!token) {
        console.log('❌ No token found in URL');
        setStatus('error');
        setMessage('Invitation token is missing. Please check your email link.');
        return;
      }

      try {
        console.log('🔄 Fetching invite details...');
        const details = await workspaceInviteAPI.getInviteDetails(token);
        console.log('✅ Invite details fetched:', details);

        setInviteDetails(details);
        setStatus('form');
      } catch (error: any) {
        console.error('❌ Failed to fetch invite details:', error);
        setStatus('error');
        setMessage(error.response?.data?.error || 'Invalid or expired invitation link.');
      }
    };

    fetchInviteDetails();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      setMessage('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }

    const token = searchParams.get('token');
    if (!token) return;

    try {
      setSubmitting(true);
      setMessage('');

      console.log('🔄 Accepting invite...');
      const response = await workspaceInviteAPI.acceptInvite(token, password, firstName, lastName);
      console.log('✅ Invite accepted:', response);

      // Save token
      localStorage.setItem('token', response.token);

      setStatus('success');
      setMessage('Invitation accepted! You are now part of the team.');

      // Refresh user data to load workspaces
      console.log('🔄 Refreshing user data...');
      await refreshUser();
      console.log('✅ User data refreshed');

      // Redirect to inbox after 2 seconds
      setTimeout(() => {
        console.log('🔄 Redirecting to inbox...');
        navigate('/app/inbox', { replace: true });
      }, 2000);
    } catch (error: any) {
      console.error('❌ Failed to accept invite:', error);
      setMessage(error.response?.data?.error || 'Failed to accept invitation. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <Seo title="Accept Invite | SendFx" robots="noindex, nofollow" />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 mb-6 flex items-center justify-center">
            {status === 'loading' && (
              <Loader2 className="w-16 h-16 text-purple-600 animate-spin" />
            )}
            {status === 'form' && (
              <Mail className="w-16 h-16 text-purple-600" />
            )}
            {status === 'success' && (
              <CheckCircle className="w-16 h-16 text-green-600" />
            )}
            {status === 'error' && (
              <XCircle className="w-16 h-16 text-red-600" />
            )}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {status === 'loading' && 'Loading Invitation...'}
            {status === 'form' && 'Accept Your Invitation'}
            {status === 'success' && 'Welcome to the Team!'}
            {status === 'error' && 'Invalid Invitation'}
          </h1>

          {/* Invite Details */}
          {inviteDetails && status === 'form' && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-gray-600 mb-1">
                You've been invited to join
              </p>
              <p className="text-lg font-semibold text-purple-900 mb-2">
                {inviteDetails.workspaceName}
              </p>
              <p className="text-sm text-gray-600">
                as a <span className="font-medium text-purple-700">{inviteDetails.role}</span>
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Email: <span className="font-medium">{inviteDetails.email}</span>
              </p>
            </div>
          )}

          {/* Error Message */}
          {message && status !== 'success' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-red-800">{message}</p>
            </div>
          )}

          {/* Form */}
          {status === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  First Name (Optional)
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="John"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name (Optional)
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="At least 6 characters"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password *
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Re-enter your password"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Accepting Invitation...' : 'Accept Invitation & Join'}
              </button>
            </form>
          )}

          {/* Success Message */}
          {status === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-800">
                {message}
              </p>
              <p className="text-sm text-green-700 mt-2">
                Redirecting you to your inbox...
              </p>
            </div>
          )}

          {/* Error Actions */}
          {status === 'error' && (
            <button
              onClick={() => navigate('/login')}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
            >
              Go to Login
            </button>
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <Mail className="w-4 h-4" />
              <span className="text-sm">Instagram AI Inbox</span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  );
};

export default AcceptInvite;
