import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import Seo from '../components/Seo';

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setMessage('Verification token is missing. Please check your email link.');
        return;
      }

      try {
        const response = await authAPI.verifyEmail(token);

        setStatus('success');
        setMessage(response.message || 'Email verified successfully!');

        if (response.token) {
          localStorage.setItem('token', response.token);
        }

        if (localStorage.getItem('token')) {
          // Refresh user data to update emailVerified status
          await refreshUser();
        }

        // Redirect to inbox after 3 seconds
        setTimeout(() => {
          navigate('/app/inbox', { replace: true });
        }, 3000);
      } catch (error: any) {
        console.error('❌ Verification failed:', error);
        console.error('Error details:', error.response?.data);
        setStatus('error');
        setMessage(error.response?.data?.error || 'Failed to verify email. The link may have expired.');
      }
    };

    verifyEmail();
  }, [searchParams, navigate, refreshUser]);

  return (
    <>
      <Seo title="Verify Email | SendFx" robots="noindex, nofollow" />
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-8 text-center">
            <h1 className="text-2xl font-semibold text-white">Verify Your Email</h1>
            <p className="mt-2 text-sm text-indigo-100">SendFx AI Inbox</p>
          </div>

          <div className="p-8 text-center">
            <div className="mx-auto w-16 h-16 mb-6 flex items-center justify-center">
              {status === 'loading' && (
                <Loader2 className="w-16 h-16 text-purple-600 animate-spin" />
              )}
              {status === 'success' && (
                <CheckCircle className="w-16 h-16 text-green-600" />
              )}
              {status === 'error' && (
                <XCircle className="w-16 h-16 text-red-600" />
              )}
            </div>

            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              {status === 'loading' && 'Verifying your email address...'}
              {status === 'success' && 'Email verified'}
              {status === 'error' && 'Verification failed'}
            </h2>

            <p className="text-gray-600 mb-6">{message}</p>

            {status === 'success' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-green-800">
                  Redirecting you to your inbox in a few seconds...
                </p>
              </div>
            )}

            {status === 'error' && (
              <div className="space-y-3">
                <button
                  onClick={() => navigate('/login')}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
                >
                  Go to Login
                </button>
                <button
                  onClick={() => navigate('/app/inbox')}
                  className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
                >
                  Go to Inbox
                </button>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-center gap-2 text-gray-500">
                <Mail className="w-4 h-4" />
                <span className="text-sm">sendfx.ai</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default VerifyEmail;
