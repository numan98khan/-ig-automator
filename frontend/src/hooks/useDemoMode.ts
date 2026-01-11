import { useCallback, useEffect, useState } from 'react';

const DEMO_MODE_KEY = 'demoModeEnabled';
const DEMO_MODE_EVENT = 'demo-mode-change';

const readDemoMode = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(DEMO_MODE_KEY) === 'true';
};

export const useDemoMode = (sourceValue?: boolean) => {
  const [isDemoMode, setIsDemoMode] = useState(readDemoMode);

  const setDemoMode = useCallback((enabled: boolean) => {
    if (typeof window !== 'undefined') {
      if (enabled) {
        window.localStorage.setItem(DEMO_MODE_KEY, 'true');
      } else {
        window.localStorage.removeItem(DEMO_MODE_KEY);
      }
      window.dispatchEvent(new CustomEvent(DEMO_MODE_EVENT, { detail: enabled }));
    }
    setIsDemoMode(enabled);
  }, []);

  const enableDemoMode = useCallback(() => {
    setDemoMode(true);
  }, [setDemoMode]);

  const disableDemoMode = useCallback(() => {
    setDemoMode(false);
  }, [setDemoMode]);

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
    const handleDemoModeEvent = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      if (typeof customEvent.detail === 'boolean') {
        setIsDemoMode(customEvent.detail);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(DEMO_MODE_EVENT, handleDemoModeEvent as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(DEMO_MODE_EVENT, handleDemoModeEvent as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof sourceValue === 'boolean' && sourceValue !== isDemoMode) {
      setDemoMode(sourceValue);
    }
  }, [sourceValue, isDemoMode, setDemoMode]);

  return {
    isDemoMode,
    enableDemoMode,
    disableDemoMode,
    toggleDemoMode,
    setDemoMode,
  };
};
