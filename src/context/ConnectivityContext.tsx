import React, { createContext, useContext, useEffect, useState } from 'react';

export interface ConnectivityContextType {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  effectiveOnlineStatus: boolean;
  setSimulatedOffline: (value: boolean | ((prev: boolean) => boolean)) => void;
  toggleSimulatedOffline: () => void;
}

const ConnectivityContext = createContext<ConnectivityContextType>({
  isOnline: true,
  isSimulatedOffline: false,
  effectiveOnlineStatus: true,
  setSimulatedOffline: () => {},
  toggleSimulatedOffline: () => {},
});

export const useConnectivity = () => useContext(ConnectivityContext);

export const ConnectivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleSimulatedOffline = () => {
    setIsSimulatedOffline((prev) => !prev);
  };

  // Authoritative effective connectivity state:
  // Must be true ONLY when physical navigator is online AND not simulated offline
  const effectiveOnlineStatus = isOnline && !isSimulatedOffline;

  return (
    <ConnectivityContext.Provider
      value={{
        isOnline,
        isSimulatedOffline,
        effectiveOnlineStatus,
        setSimulatedOffline: setIsSimulatedOffline,
        toggleSimulatedOffline,
      }}
    >
      {children}
    </ConnectivityContext.Provider>
  );
};
