import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { authAPI } from '../services/api';
import Seo from '../components/Seo';

const RequestPasswordReset: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const seo = <Seo title="Reset Password | SendFx" robots="noindex, nofollow" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setLoading(true);

    try {
      await authAPI.requestPasswordReset(email);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <>
        {seo}
        <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 mb-6 flex items-center justify-center">
                <CheckCircle className="w-16 h-16 text-green-600" />
              </div>

              <h1 className="text-2xl font-bold text-gray-900 mb-4">
                Check Your Email
              </h1>

              <p className="text-gray-600 mb-6">
                If an account exists with that email address, we've sent you a password reset link.
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  Please check your inbox and spam folder for the reset link.
                </p>
              </div>

              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 font-medium"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {seo}
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="mx-auto w-16 h-16 mb-6 bg-purple-100 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-purple-600" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Reset Your Password
            </h1>
            <p className="text-gray-600">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="your@email.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>

          <div className="text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Login
            </Link>
          </div>
        </form>
        </div>
      </div>
    </>
  );
};

export default RequestPasswordReset;
