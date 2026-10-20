import assert from 'node:assert/strict';
import test from 'node:test';
import { nextUtcReset, isQuotaStatus, quotaFromResponse } from './quota';

test('reset always follows UTC midnight, including month and year rollover', () => {
  assert.equal(nextUtcReset(new Date('2026-10-20T23:59:59Z')), '2026-10-21T00:00:00.000Z');
  assert.equal(nextUtcReset(new Date('2026-12-31T23:59:59Z')), '2027-01-01T00:00:00.000Z');
  assert.equal(nextUtcReset(new Date('2026-10-21T00:00:00Z')), '2026-10-22T00:00:00.000Z');
});

test('a shared cap can block while the personal allowance is positive', () => {
  const quota = { remaining: 21, cap: 35, reason: 'global', resetsAt: '2026-10-21T00:00:00Z' };
  assert.equal(isQuotaStatus(quota), true);
  assert.deepEqual(quotaFromResponse(new Response('', { headers: { 'X-Quota-Status': JSON.stringify(quota) } })), quota);
});

test('malformed quota headers are ignored instead of corrupting state', () => {
  assert.equal(quotaFromResponse(new Response('', { headers: { 'X-Quota-Status': '{oops' } })), null);
  assert.equal(isQuotaStatus({ remaining: -1, cap: 35, reason: null, resetsAt: 'bad' }), false);
  assert.equal(isQuotaStatus({ remaining: 40, cap: 35, reason: null, resetsAt: '2026-10-21T00:00:00Z' }), false);
});
