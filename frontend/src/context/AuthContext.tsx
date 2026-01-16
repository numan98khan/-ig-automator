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
      console.log('🔄 AuthContext: Fetching user data...');
      const data = await authAPI.getMe();
      console.log('✅ AuthContext: User data received:', {
        email: data.user.email,
        emailVerified: data.user.emailVerified,
        isProvisional: data.user.isProvisional
      });

      setUser(data.user);
      setWorkspaces(data.workspaces);

      // Set current workspace - priority order:
      // 1. Saved workspace ID from localStorage
      // 2. User's default workspace ID
      // 3. First workspace in list
      const savedWorkspaceId = localStorage.getItem('currentWorkspaceId');
      let targetWorkspace: Workspace | undefined;

      if (savedWorkspaceId) {
        targetWorkspace = data.workspaces.find((w: Workspace) => w._id === savedWorkspaceId);
      }

      if (!targetWorkspace && data.user.defaultWorkspaceId) {
        targetWorkspace = data.workspaces.find((w: Workspace) => w._id === data.user.defaultWorkspaceId);
      }

      if (!targetWorkspace && data.workspaces.length > 0) {
        targetWorkspace = data.workspaces[0];
      }

      if (targetWorkspace) {
        setCurrentWorkspaceState(targetWorkspace);
        localStorage.setItem('currentWorkspaceId', targetWorkspace._id);
      }

      console.log('✅ AuthContext: User state updated');
    } catch (error) {
      console.error('❌ AuthContext: Error fetching user:', error);
      logout();
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      // Check for token in URL params (from Instagram OAuth callback)
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');

      console.log('🔍 AuthContext initAuth:', {
        urlToken: urlToken ? 'PRESENT' : 'MISSING',
        storedToken: token ? 'PRESENT' : 'MISSING',
        currentUrl: window.location.href
      });

      if (urlToken) {
        console.log('✅ Token found in URL, storing and fetching user data...');
        // Store token from OAuth callback
        localStorage.setItem('token', urlToken);
        setToken(urlToken);

        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);

        // Fetch user data
        try {
          await refreshUser();
          console.log('✅ User data fetched successfully');
        } catch (error) {
          console.error('❌ Failed to fetch user data after OAuth:', error);
        }
        setLoading(false);
        return;
      }

      // Otherwise use stored token
      if (token) {
        console.log('📦 Using stored token from localStorage');
        await refreshUser();
      } else {
        console.log('⚠️ No token found in URL or localStorage');
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const data = await authAPI.login(email, password);
      localStorage.setItem('token', data.token);
      setToken(data.token);
      await refreshUser();
    } finally {
      setLoading(false);
    }
  };

  const signup = async (email: string, password: string) => {
    setLoading(true);
    try {
      const data = await authAPI.signup(email, password);
      localStorage.setItem('token', data.token);
      setToken(data.token);
      await refreshUser();
    } finally {
      setLoading(false);
    }
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
