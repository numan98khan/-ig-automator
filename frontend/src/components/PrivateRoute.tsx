import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  requireWorkspace?: boolean;
}

const PrivateRoute: React.FC<Props> = ({ children, requireWorkspace = false }) => {
  const { user, currentWorkspace, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (requireWorkspace && !currentWorkspace) {
    return <Navigate to="/workspace/create" />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
