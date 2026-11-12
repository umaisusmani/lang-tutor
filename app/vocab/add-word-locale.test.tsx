import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { AddWord } from '@/app/vocab/add-word';
import { searchStarterWordsAction } from '@/app/vocab/actions';

vi.mock('@/lib/languages', () => ({ activeLanguage: { localeTag: 'tr' } }));
vi.mock('@/app/vocab/actions', () => ({ searchStarterWordsAction: vi.fn() }));

test('a Turkish lemma saved on the server shows as saved in search results', async () => {
  vi.mocked(searchStarterWordsAction).mockResolvedValue([
    { lemma: 'IŞIK', example: '', exampleTranslation: '' },
  ]);

  render(<AddWord savedLemmas={new Set(['ışık'])} onAdded={vi.fn()} />);
  await userEvent.setup().type(screen.getByRole('combobox', { name: 'Search for a word' }), 'ışık');

  const option = await screen.findByRole('option', { name: /IŞIK.*saved/ });
  expect(within(option).getByText('✓ saved')).toBeInTheDocument();
  expect(option).toHaveAttribute('aria-disabled', 'true');
});
