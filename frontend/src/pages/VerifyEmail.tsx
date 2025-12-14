import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const VerifyEmail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');
      console.log('📧 VerifyEmail page: Starting verification', { hasToken: !!token });

      if (!token) {
        console.log('❌ No token found in URL');
        setStatus('error');
        setMessage('Verification token is missing. Please check your email link.');
        return;
      }

      try {
        console.log('🔄 Calling verifyEmail API...');
        const response = await authAPI.verifyEmail(token);
        console.log('✅ Verification API success:', response);

        setStatus('success');
        setMessage(response.message || 'Email verified successfully!');

        // Refresh user data to update emailVerified status
        console.log('🔄 Refreshing user data...');
        await refreshUser();
        console.log('✅ User data refreshed');

        // Redirect to inbox after 3 seconds
        setTimeout(() => {
          console.log('🔄 Redirecting to inbox...');
          navigate('/');
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center">
          {/* Icon */}
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

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {status === 'loading' && 'Verifying Your Email...'}
            {status === 'success' && 'Email Verified!'}
            {status === 'error' && 'Verification Failed'}
          </h1>

          {/* Message */}
          <p className="text-gray-600 mb-6">
            {message}
          </p>

          {/* Success - Auto redirect message */}
          {status === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-800">
                Redirecting you to your inbox in a few seconds...
              </p>
            </div>
          )}

          {/* Error - Action buttons */}
          {status === 'error' && (
            <div className="space-y-3">
              <button
                onClick={() => navigate('/login')}
                className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
              >
                Go to Login
              </button>
              <button
                onClick={() => navigate('/')}
                className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
              >
                Go to Inbox
              </button>
            </div>
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
  );
};

export default VerifyEmail;
