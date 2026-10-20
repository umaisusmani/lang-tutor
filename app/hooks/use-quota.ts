'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isQuotaStatus, type QuotaStatus } from '@/lib/quota';

export function useQuota(initial: QuotaStatus) {
  const [quota, setQuota] = useState(initial);
  const sequence = useRef(0);
  const accept = useCallback((next: QuotaStatus) => {
    sequence.current += 1;
    setQuota(next);
  }, []);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const response = await fetch('/api/quota', { cache: 'no-store' });
      const next: unknown = await response.json();
      if (!response.ok || !isQuotaStatus(next)) throw new Error('Allowance unavailable');
      if (request === sequence.current) setQuota(next);
    } catch {
      if (request === sequence.current) setQuota((previous) => ({ ...previous, reason: 'unavailable' }));
    }
  }, []);

  useEffect(() => {
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = window.setTimeout(() => void refresh(), Math.max(1000, Date.parse(quota.resetsAt) - Date.now() + 100));
    // Also recover from counter/network outages and changes in another tab.
    const poll = window.setInterval(onFocus, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.clearTimeout(timer);
      window.clearInterval(poll);
    };
  }, [quota.resetsAt, refresh]);

  return { quota, accept, refresh };
}
