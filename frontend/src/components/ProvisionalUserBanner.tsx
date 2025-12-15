import React, { useState } from 'react';
import { X, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ProvisionalUserBanner: React.FC = () => {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Only show if user is provisional or email not verified
  if (!user || (!user.isProvisional && user.emailVerified) || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    // Store dismissal in localStorage (expires after session)
    sessionStorage.setItem('provisionalBannerDismissed', 'true');
  };

  // Check if already dismissed in this session
  if (sessionStorage.getItem('provisionalBannerDismissed')) {
    return null;
  }

  return (
    <div className="bg-primary/5 border-b border-primary/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="flex-shrink-0 mt-0.5">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {user.isProvisional && !user.email ? (
                  <>You're currently logged in via Instagram only</>
                ) : !user.emailVerified ? (
                  <>Please verify your email address</>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                To keep your data safe, manage multiple Instagram accounts, and invite team members, please add your email and password.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="/settings"
              className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition shadow-sm"
            >
              Secure My Account
            </a>
            <button
              onClick={handleDismiss}
              className="p-1 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProvisionalUserBanner;
