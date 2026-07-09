import { useEffect, useState } from 'react';

/** Browser online/offline state. Returns true when the browser is offline. */
export function useOnlineStatus(): boolean {
  const [isOffline, setIsOffline] = useState(() =>
    typeof navigator !== 'undefined' && !navigator.onLine
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOffline;
}
