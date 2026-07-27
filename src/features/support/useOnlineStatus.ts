import { useEffect, useState } from 'react';

export function useOnlineStatus(controlled?: boolean): boolean {
  const [browserOnline, setBrowserOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ));

  useEffect(() => {
    if (controlled !== undefined) return undefined;
    const update = () => setBrowserOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, [controlled]);

  return controlled ?? browserOnline;
}
