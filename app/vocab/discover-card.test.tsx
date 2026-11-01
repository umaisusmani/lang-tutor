import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { DiscoverCard } from '@/app/vocab/discover-card';
import { addStarterWordAction } from '@/app/vocab/actions';

vi.mock('@/app/vocab/actions', () => ({ addStarterWordAction: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('shows a success check before advancing to the next word', async () => {
  vi.mocked(addStarterWordAction).mockResolvedValue({ ok: true });
  const onAdded = vi.fn();
  render(<DiscoverCard word={{ lemma: 'der Bahnhof', example: 'Der Zug kommt an.', exampleTranslation: 'The train arrives.' }}
    meaning="station" loading={false} loadError={false} onRetry={vi.fn()} onSkip={vi.fn()} onAdded={onAdded} />);

  fireEvent.click(screen.getByRole('button', { name: 'Add to my words' }));
  const adding = await screen.findByRole('button', { name: 'Adding…' });
  expect(adding).toBeDisabled();
  expect(adding).toHaveTextContent('✓');
  expect(onAdded).not.toHaveBeenCalled();
  await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
});
