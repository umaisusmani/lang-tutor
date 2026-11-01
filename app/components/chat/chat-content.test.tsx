import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { ChatThread } from '@/app/components/chat/chat-content';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import { FALLBACK_PERSONA } from '@/lib/personas';

afterEach(cleanup);

test('collapses a correction to its changed-word summary and expands it again', () => {
  const messages: LangTutorUIMessage[] = [
    { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Ich haben dog.' }] },
    {
      id: 'reply', role: 'assistant', parts: [
        { type: 'text', text: 'Du hast einen Hund!' },
        { type: 'data-correction', data: {
          hasMistake: true,
          usedEnglish: true,
          mistakeType: 'verb_conjugation',
          correction: 'Ich habe Hund.',
          correctionTranslation: 'I have a dog.',
          correctionGloss: null,
          explanation: 'Use habe with ich.',
        } },
      ],
    },
  ];
  render(
    <ChatThread
      messages={messages}
      status="ready"
      error={undefined}
      persona={FALLBACK_PERSONA}
      openPanels={{}}
      explanations={{}}
      explaining={{}}
      canSave={false}
      isSaved={() => false}
      onTogglePanel={vi.fn()}
      onSaveWord={vi.fn()}
      onExplain={vi.fn()}
    />,
  );

  expect(screen.getByText('Use habe with ich.')).toBeInTheDocument();
  const hide = screen.getByRole('button', { name: 'Hide correction' });
  expect(hide).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(hide);
  expect(screen.getByText('2 words fixed')).toBeInTheDocument();
  expect(screen.getByText('Use habe with ich.').closest('[inert]')).toBeInTheDocument();
  const show = screen.getByRole('button', { name: 'Show correction' });
  expect(show).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(show);
  expect(screen.getByText('Use habe with ich.').closest('[inert]')).toBeNull();
  expect(screen.queryByText('2 words fixed')).not.toBeInTheDocument();
});
