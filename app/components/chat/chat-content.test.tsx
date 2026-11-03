import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      onSaveGrammarNote={vi.fn()}
      onExplain={vi.fn()}
    />,
  );

  expect(screen.getByText('Use habe with ich.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '+ save as note' })).not.toBeInTheDocument();
  expect(screen.getByText('Du').closest('div.flex-col')).toHaveClass('flex-col', 'sm:flex-row');
  expect(screen.getByText('habe').closest('div.flex-col')).toHaveClass('flex-col', 'sm:flex-row', 'pr-8');
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

test('edits a correction explanation before saving it as a note', async () => {
  const save = vi.fn().mockResolvedValue({ ok: true });
  const messages: LangTutorUIMessage[] = [
    { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Ich haben Hund.' }] },
    { id: 'reply', role: 'assistant', parts: [
      { type: 'text', text: 'Du hast einen Hund!' },
      { type: 'data-correction', data: {
        hasMistake: true, usedEnglish: false, mistakeType: 'verb_conjugation',
        correction: 'Ich habe Hund.', correctionTranslation: null,
        correctionGloss: null, explanation: 'Use habe with ich.',
      } },
    ] },
  ];
  render(<ChatThread messages={messages} status="ready" error={undefined} persona={FALLBACK_PERSONA}
    openPanels={{}} explanations={{}} explaining={{}} canSave isSaved={() => false}
    onTogglePanel={vi.fn()} onSaveWord={vi.fn()} onSaveGrammarNote={save} onExplain={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '+ save as note' }));
  const textarea = screen.getByRole('textbox', { name: 'Grammar note' });
  expect(textarea).toHaveValue('Use habe with ich.');
  fireEvent.change(textarea, { target: { value: 'Use habe for ich.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith('Use habe for ich.', 'Ich habe Hund.'));
  expect(screen.getByText('✓ saved as note')).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Grammar note' })).not.toBeInTheDocument();
});
