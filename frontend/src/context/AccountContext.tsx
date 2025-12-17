import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { InstagramAccount, instagramAPI } from '../services/api';
import { useAuth } from './AuthContext';

interface AccountContextValue {
  accounts: InstagramAccount[];
  activeAccount: InstagramAccount | null;
  setActiveAccount: (account: InstagramAccount | null) => void;
  refreshAccounts: () => Promise<void>;
  isLoading: boolean;
}

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export const AccountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentWorkspace } = useAuth();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshAccounts = useCallback(async () => {
    if (!currentWorkspace) {
      setAccounts([]);
      setActiveAccountId(null);
      return;
    }

    setIsLoading(true);
    try {
      const data = await instagramAPI.getByWorkspace(currentWorkspace._id);
      const safeAccounts = data || [];
      setAccounts(safeAccounts);

      const preferred = safeAccounts.find((acc) => acc.status === 'connected') || safeAccounts[0];
      setActiveAccountId((prev) => {
        if (prev && safeAccounts.some((acc) => acc._id === prev)) {
          return prev;
        }
        return preferred?._id || null;
      });
    } catch (error) {
      console.error('Failed to load Instagram accounts', error);
      setAccounts([]);
      setActiveAccountId(null);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace]);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  const activeAccount = useMemo(
    () => accounts.find((acc) => acc._id === activeAccountId) || null,
    [accounts, activeAccountId],
  );

  const handleSetActive = (account: InstagramAccount | null) => {
    setActiveAccountId(account?._id || null);
  };

  return (
    <AccountContext.Provider
      value={{
        accounts,
        activeAccount,
        setActiveAccount: handleSetActive,
        refreshAccounts,
        isLoading,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
};

export const useAccountContext = () => {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccountContext must be used within an AccountProvider');
  }
  return context;
};
