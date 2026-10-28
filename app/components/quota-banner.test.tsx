import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { QuotaBanner } from '@/app/components/quota-banner';
import type { QuotaStatus } from '@/lib/quota';

const baseQuota: QuotaStatus = {
  remaining: 5,
  cap: 35,
  reason: null,
  resetsAt: '2026-10-28T00:00:00.000Z',
};

test.each([5, 1])('shows no banner with %i messages remaining', (remaining) => {
  const { container } = render(
    <QuotaBanner quota={{ ...baseQuota, remaining }} signedIn onRetry={vi.fn()} />,
  );

  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByText(/messages left|Last message/i)).not.toBeInTheDocument();
});

test('shows the compact daily-limit banner for a signed-in learner', () => {
  render(
    <QuotaBanner
      quota={{ ...baseQuota, remaining: 0, reason: 'user' }}
      signedIn
      compact
      onRetry={vi.fn()}
    />,
  );

  expect(screen.getByRole('status')).toHaveTextContent('You’ve reached your daily limit');
});

test('shows the daily-limit card for a signed-in learner', () => {
  render(
    <QuotaBanner
      quota={{ ...baseQuota, remaining: 0, reason: 'user' }}
      signedIn
      onRetry={vi.fn()}
    />,
  );

  expect(screen.getByRole('heading', { name: "That's it for today." })).toBeInTheDocument();
});

test('lets the learner retry when allowance is unavailable', () => {
  const onRetry = vi.fn();
  render(
    <QuotaBanner
      quota={{ ...baseQuota, remaining: 0, reason: 'unavailable' }}
      signedIn
      onRetry={onRetry}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Check again' }));
  expect(onRetry).toHaveBeenCalledOnce();
});
