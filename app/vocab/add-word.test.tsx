import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { AddWord } from '@/app/vocab/add-word';
import { addStarterWordAction, previewStarterWordAction, searchStarterWordsAction } from '@/app/vocab/actions';

vi.mock('@/app/vocab/actions', () => ({
  searchStarterWordsAction: vi.fn(),
  previewStarterWordAction: vi.fn(),
  addStarterWordAction: vi.fn(),
}));

const bahnhof = { lemma: 'der Bahnhof', example: 'Der Zug kommt am Bahnhof an.', exampleTranslation: 'The train arrives at the station.' };
const bad = { lemma: 'das Bad', example: 'Das Bad ist groß.', exampleTranslation: 'The bathroom is large.' };
const search = vi.mocked(searchStarterWordsAction);
const preview = vi.mocked(previewStarterWordAction);
const add = vi.mocked(addStarterWordAction);

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue([bahnhof, bad]);
  preview.mockResolvedValue({ translation: 'train station' });
  add.mockResolvedValue({ ok: true });
});

function setup(savedLemmas: ReadonlySet<string> = new Set()) {
  const onAdded = vi.fn();
  const user = userEvent.setup();
  render(<AddWord savedLemmas={savedLemmas} onAdded={onAdded} />);
  return { user, onAdded, input: screen.getByRole('combobox', { name: 'Add a word' }) };
}

async function typeAndWait(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, value = 'bahn') {
  await user.type(input, value);
  return screen.findByRole('listbox');
}

test('typing shows combobox suggestions', async () => {
  const { user, input } = setup();
  const list = await typeAndWait(user, input);
  expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(within(list).getAllByRole('option')).toHaveLength(2);
});

test('ArrowDown and Enter select a word and load its meaning', async () => {
  const { user, input } = setup();
  await typeAndWait(user, input);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(input).toHaveValue('der Bahnhof');
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Meaning' })).toHaveValue('train station'));
  expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
});

test('clicking a suggestion selects it without moving focus from the search field', async () => {
  const { user, input } = setup();
  const list = await typeAndWait(user, input);
  await user.click(within(list).getByRole('option', { name: 'der Bahnhof' }));
  expect(input).toHaveFocus();
  expect(input).toHaveValue('der Bahnhof');
});

test('adding an edited meaning refreshes once and clears the input', async () => {
  const { user, input, onAdded } = setup();
  await typeAndWait(user, input);
  await user.keyboard('{ArrowDown}{Enter}');
  const meaning = await screen.findByRole('textbox', { name: 'Meaning' });
  await waitFor(() => expect(meaning).toBeEnabled());
  await user.clear(meaning);
  await user.type(meaning, 'station');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
  expect(add).toHaveBeenCalledWith('der Bahnhof', 'station');
  expect(screen.getByText('✓ der Bahnhof added')).toBeInTheDocument();
  expect(input).toHaveValue('');
  await typeAndWait(user, input);
  expect(screen.getByRole('option', { name: /der Bahnhof/ })).toHaveTextContent('✓ saved');
});

test('a saved suggestion cannot be selected', async () => {
  const { user, input } = setup(new Set(['der bahnhof']));
  const list = await typeAndWait(user, input);
  const option = within(list).getByRole('option', { name: /der Bahnhof/ });
  expect(option).toHaveAttribute('aria-disabled', 'true');
  expect(option).toHaveTextContent('✓ saved');
  await user.click(option);
  expect(preview).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox', { name: 'Meaning' })).not.toBeInTheDocument();
});

test('Escape closes suggestions, then clears the input', async () => {
  const { user, input } = setup();
  await typeAndWait(user, input);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(input).toHaveValue('bahn');
  await user.keyboard('{Escape}');
  expect(input).toHaveValue('');
});

test('a missing preview lets the learner enter a meaning', async () => {
  preview.mockResolvedValue(null);
  const { user, input } = setup();
  await typeAndWait(user, input);
  await user.keyboard('{ArrowDown}{Enter}');
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load a meaning");
  const meaning = screen.getByRole('textbox', { name: 'Meaning' });
  expect(meaning).toBeEnabled();
  await user.type(meaning, 'station');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() => expect(add).toHaveBeenCalledWith('der Bahnhof', 'station'));
});

test('no matches shows the starter-list hint', async () => {
  search.mockResolvedValue([]);
  const { user, input } = setup();
  await user.type(input, 'unlisted');
  expect(await screen.findByText(/Not in the starter list/)).toBeInTheDocument();
  expect(screen.getByText('No matches')).toBeInTheDocument();
});

test('a slow earlier search cannot replace later results', async () => {
  let resolveFirst!: (words: typeof bahnhof[]) => void;
  search.mockImplementation((query) => query === 'ba'
    ? new Promise((resolve) => { resolveFirst = resolve; })
    : Promise.resolve([bad]));
  const { user, input } = setup();
  await user.type(input, 'ba');
  await waitFor(() => expect(search).toHaveBeenCalledWith('ba'));
  await user.type(input, 'd');
  const list = await screen.findByRole('listbox');
  expect(within(list).getByRole('option', { name: 'das Bad' })).toBeInTheDocument();
  await act(async () => { resolveFirst([bahnhof]); });
  expect(within(list).queryByRole('option', { name: 'der Bahnhof' })).not.toBeInTheDocument();
});
