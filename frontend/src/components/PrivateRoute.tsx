import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { instagramAPI } from '../services/api';
import { Loader2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  requireWorkspace?: boolean;
  requireInstagram?: boolean;
  requireAdmin?: boolean;
}

const PrivateRoute: React.FC<Props> = ({
  children,
  requireWorkspace = false,
  requireInstagram = false,
  requireAdmin = false
}) => {
  const { user, currentWorkspace, loading } = useAuth();
  const [checkingInstagram, setCheckingInstagram] = useState(requireInstagram);
  const [hasInstagram, setHasInstagram] = useState(false);

  useEffect(() => {
    const checkInstagram = async () => {
      if (!requireInstagram || !currentWorkspace) {
        setCheckingInstagram(false);
        return;
      }

      try {
        const accounts = await instagramAPI.getByWorkspace(currentWorkspace._id);
        setHasInstagram(accounts.length > 0);
      } catch (error) {
        console.error('Error checking Instagram:', error);
        setHasInstagram(false);
      } finally {
        setCheckingInstagram(false);
      }
    };

    checkInstagram();
  }, [requireInstagram, currentWorkspace]);

  const location = useLocation();

  if (loading || checkingInstagram) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/landing" state={{ from: location }} replace />;
  }

  if (requireAdmin && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  if (requireWorkspace && !currentWorkspace) {
    // User should have workspace created automatically via Instagram OAuth
    return <Navigate to="/landing" state={{ from: location }} replace />;
  }

  if (requireInstagram && !hasInstagram) {
    // User should have Instagram connected via OAuth login
    return <Navigate to="/landing" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
