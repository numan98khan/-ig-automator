import { useCallback, useEffect, useState } from 'react';

const DEMO_MODE_KEY = 'demoModeEnabled';

const readDemoMode = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(DEMO_MODE_KEY) === 'true';
};

export const useDemoMode = () => {
  const [isDemoMode, setIsDemoMode] = useState(readDemoMode);

  const enableDemoMode = useCallback(() => {
    window.localStorage.setItem(DEMO_MODE_KEY, 'true');
    setIsDemoMode(true);
  }, []);

  const disableDemoMode = useCallback(() => {
    window.localStorage.removeItem(DEMO_MODE_KEY);
    setIsDemoMode(false);
  }, []);

  const toggleDemoMode = useCallback(() => {
    if (isDemoMode) {
      disableDemoMode();
    } else {
      enableDemoMode();
    }
  }, [disableDemoMode, enableDemoMode, isDemoMode]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DEMO_MODE_KEY) {
        setIsDemoMode(event.newValue === 'true');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return {
    isDemoMode,
    enableDemoMode,
    disableDemoMode,
    toggleDemoMode,
  };
};
