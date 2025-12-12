import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI, User, Workspace } from '../services/api';

interface AuthContextType {
  user: User | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setCurrentWorkspace: (workspace: Workspace) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const data = await authAPI.getMe();
      setUser(data.user);
      setWorkspaces(data.workspaces);

      // Set current workspace
      const savedWorkspaceId = localStorage.getItem('currentWorkspaceId');
      if (savedWorkspaceId) {
        const workspace = data.workspaces.find((w: Workspace) => w._id === savedWorkspaceId);
        if (workspace) {
          setCurrentWorkspaceState(workspace);
        } else if (data.workspaces.length > 0) {
          setCurrentWorkspaceState(data.workspaces[0]);
          localStorage.setItem('currentWorkspaceId', data.workspaces[0]._id);
        }
      } else if (data.workspaces.length > 0) {
        setCurrentWorkspaceState(data.workspaces[0]);
        localStorage.setItem('currentWorkspaceId', data.workspaces[0]._id);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      logout();
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      // Check for token in URL params (from Instagram OAuth callback)
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');

      if (urlToken) {
        // Store token from OAuth callback
        localStorage.setItem('token', urlToken);
        setToken(urlToken);

        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);

        // Fetch user data
        await refreshUser();
        setLoading(false);
        return;
      }

      // Otherwise use stored token
      if (token) {
        await refreshUser();
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authAPI.login(email, password);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const signup = async (email: string, password: string) => {
    const data = await authAPI.signup(email, password);
    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('currentWorkspaceId');
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setCurrentWorkspaceState(null);
  };

  const setCurrentWorkspace = (workspace: Workspace) => {
    setCurrentWorkspaceState(workspace);
    localStorage.setItem('currentWorkspaceId', workspace._id);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        workspaces,
        currentWorkspace,
        token,
        loading,
        login,
        signup,
        logout,
        setCurrentWorkspace,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
