export type QuotaReason = 'user' | 'global' | 'unavailable';
export type QuotaStatus = {
  remaining: number;
  cap: number;
  reason: QuotaReason | null;
  resetsAt: string;
};

export function nextUtcReset(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

export function isQuotaStatus(value: unknown): value is QuotaStatus {
  if (!value || typeof value !== 'object') return false;
  const q = value as QuotaStatus;
  return Number.isInteger(q.remaining) && q.remaining >= 0
    && Number.isInteger(q.cap) && q.cap > 0 && q.remaining <= q.cap
    && [null, 'user', 'global', 'unavailable'].includes(q.reason)
    && typeof q.resetsAt === 'string' && Number.isFinite(Date.parse(q.resetsAt));
}

export function quotaFromResponse(response: Response): QuotaStatus | null {
  try {
    const value: unknown = JSON.parse(response.headers.get('X-Quota-Status') ?? 'null');
    return isQuotaStatus(value) ? value : null;
  } catch { return null; }
}
