import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { AddWord } from '@/app/vocab/add-word';
import { addLookedUpWordAction, addStarterWordAction, lookupWordsAction,
  previewStarterWordAction, searchStarterWordsAction } from '@/app/vocab/actions';

vi.mock('@/app/vocab/actions', () => ({
  searchStarterWordsAction: vi.fn(),
  previewStarterWordAction: vi.fn(),
  addStarterWordAction: vi.fn(),
  lookupWordsAction: vi.fn(),
  addLookedUpWordAction: vi.fn(),
}));

const bahnhof = { lemma: 'der Bahnhof', example: 'Der Zug kommt am Bahnhof an.', exampleTranslation: 'The train arrives at the station.' };
const bad = { lemma: 'das Bad', example: 'Das Bad ist groß.', exampleTranslation: 'The bathroom is large.' };
const aubergine = { lemma: 'die Aubergine', meaning: 'eggplant', example: 'Ich kaufe eine Aubergine.', exampleTranslation: 'I buy an eggplant.' };
const search = vi.mocked(searchStarterWordsAction);
const preview = vi.mocked(previewStarterWordAction);
const lookup = vi.mocked(lookupWordsAction);
const addStarter = vi.mocked(addStarterWordAction);
const addLookup = vi.mocked(addLookedUpWordAction);

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue([bahnhof]);
  preview.mockResolvedValue({ translation: 'train station' });
  lookup.mockResolvedValue({ words: [aubergine], remaining: 49 });
  addStarter.mockResolvedValue({ ok: true });
  addLookup.mockResolvedValue({ ok: true });
});

function setup(savedLemmas: ReadonlySet<string> = new Set()) {
  const onAdded = vi.fn();
  render(<AddWord savedLemmas={savedLemmas} onAdded={onAdded} />);
  const input = screen.getByRole('combobox', { name: 'Add a word' });
  return { input, onAdded };
}

async function typeAndFind(input: HTMLElement, value: string) {
  await userEvent.setup().type(input, value);
  return screen.findByRole('listbox');
}

test('starter suggestions keep combobox navigation and saved labels', async () => {
  const { input } = setup(new Set(['der bahnhof']));
  const list = await typeAndFind(input, 'bahn');
  expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(within(list).getByRole('option', { name: /der Bahnhof/ })).toHaveTextContent('✓ saved');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('-1'));
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(lookup).toHaveBeenCalledWith('bahn'));
});

test('a slow earlier search cannot replace later results', async () => {
  let resolveFirst!: (words: typeof bahnhof[]) => void;
  search.mockImplementation((query) => query === 'ba'
    ? new Promise((resolve) => { resolveFirst = resolve; })
    : Promise.resolve([bad]));
  const { input } = setup();
  await userEvent.setup().click(input);
  fireEvent.change(input, { target: { value: 'ba' } });
  await waitFor(() => expect(search).toHaveBeenCalledWith('ba'));
  fireEvent.change(input, { target: { value: 'bad' } });
  const list = await screen.findByRole('listbox');
  expect(within(list).getByRole('option', { name: 'das Bad' })).toBeInTheDocument();
  await act(async () => { resolveFirst([bahnhof]); });
  expect(within(list).getByRole('option', { name: 'das Bad' })).toBeInTheDocument();
  expect(within(list).queryByRole('option', { name: 'der Bahnhof' })).not.toBeInTheDocument();
});

test('search shows a loader from typing through the pending request', async () => {
  let resolveSearch!: (words: typeof bahnhof[]) => void;
  search.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve; }));
  const { input } = setup();
  await userEvent.setup().click(input);
  fireEvent.change(input, { target: { value: 'bahn' } });
  expect(input).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('status', { name: 'Searching suggestions' })).toBeInTheDocument();
  await waitFor(() => expect(search).toHaveBeenCalledWith('bahn'));
  expect(input).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('status', { name: 'Searching suggestions' })).toBeInTheDocument();
  await act(async () => { resolveSearch([bahnhof]); });
  expect(screen.getByRole('option', { name: 'der Bahnhof' })).toBeInTheDocument();
  expect(input).toHaveAttribute('aria-busy', 'false');
  expect(screen.queryByRole('status', { name: 'Searching suggestions' })).not.toBeInTheDocument();
});

test('zero results trigger lookup only after 700ms idle and show meanings', async () => {
  vi.useFakeTimers();
  search.mockResolvedValue([]);
  const { input } = setup();
  fireEvent.change(input, { target: { value: 'aubergine' } });
  await act(async () => { vi.advanceTimersByTime(150); });
  expect(lookup).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(549); });
  expect(lookup).not.toHaveBeenCalled();
  await act(async () => { vi.advanceTimersByTime(1); });
  expect(lookup).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('option', { name: /die Aubergine.*eggplant/ })).toBeInTheDocument();
  expect(screen.getByText('More words')).toBeInTheDocument();
});

test('See more results appends AI words and retyping the same query uses cache', async () => {
  const { input } = setup();
  let list = await typeAndFind(input, 'aubergine');
  await userEvent.setup().click(within(list).getByRole('option', { name: 'See more results' }));
  expect(await screen.findByRole('option', { name: /die Aubergine.*eggplant/ })).toBeInTheDocument();
  expect(screen.getByText('More words')).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.change(input, { target: { value: 'aubergine' } });
  list = await screen.findByRole('listbox');
  expect(within(list).getByRole('option', { name: /die Aubergine.*eggplant/ })).toBeInTheDocument();
  expect(lookup).toHaveBeenCalledTimes(1);
});

test('starter add appears after preview, then saves the edited meaning and resets focus', async () => {
  let resolvePreview!: (value: { translation: string }) => void;
  preview.mockReturnValue(new Promise((resolve) => { resolvePreview = resolve; }));
  const { input, onAdded } = setup();
  const list = await typeAndFind(input, 'bahn');
  await userEvent.setup().click(within(list).getByRole('option', { name: 'der Bahnhof' }));
  expect(screen.queryByRole('button', { name: 'Add der Bahnhof' })).not.toBeInTheDocument();
  expect(screen.getByText('looking up the meaning…')).toBeInTheDocument();
  await act(async () => { resolvePreview({ translation: 'station' }); });
  const meaning = screen.getByRole('textbox', { name: 'Meaning' });
  expect(meaning).toHaveValue('station');
  expect(screen.getByRole('button', { name: 'Add der Bahnhof' })).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Add der Bahnhof' }));
  await waitFor(() => expect(addStarter).toHaveBeenCalledWith('der Bahnhof', 'station'));
  expect(onAdded).toHaveBeenCalledTimes(1);
  expect(screen.getByText('✓ der Bahnhof added')).toBeInTheDocument();
  expect(screen.getByRole('combobox')).toHaveFocus();
  expect(screen.getByRole('combobox')).toHaveValue('');
});

test('a missing preview lets the learner enter a meaning', async () => {
  preview.mockResolvedValue(null);
  const { input, onAdded } = setup();
  const list = await typeAndFind(input, 'bahn');
  await userEvent.setup().click(within(list).getByRole('option', { name: 'der Bahnhof' }));
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load a meaning. Type your own, or pick another word.");
  const meaning = screen.getByRole('textbox', { name: 'Meaning' });
  expect(meaning).toHaveValue('');
  expect(meaning).toBeEnabled();
  await userEvent.setup().click(meaning);
  expect(meaning).toHaveFocus();
  await userEvent.setup().type(meaning, 'station');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Add der Bahnhof' }));
  await waitFor(() => expect(addStarter).toHaveBeenCalledWith('der Bahnhof', 'station'));
  expect(onAdded).toHaveBeenCalledTimes(1);
});

test('AI word saves with its meaning without preview and Cancel resets', async () => {
  const { input } = setup();
  const list = await typeAndFind(input, 'aubergine');
  await userEvent.setup().click(within(list).getByRole('option', { name: 'See more results' }));
  await userEvent.setup().click(await screen.findByRole('option', { name: /die Aubergine.*eggplant/ }));
  expect(preview).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Meaning' })).toHaveValue('eggplant');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('combobox')).toHaveValue('');
  expect(screen.getByRole('combobox')).toHaveFocus();

  await typeAndFind(screen.getByRole('combobox'), 'aubergine');
  await userEvent.setup().click(screen.getByRole('option', { name: /die Aubergine.*eggplant/ }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Add die Aubergine' }));
  await waitFor(() => expect(addLookup).toHaveBeenCalledWith(aubergine));
});

test('an already saved AI result is labelled and cannot be selected', async () => {
  const { input } = setup(new Set(['die aubergine']));
  const list = await typeAndFind(input, 'aubergine');
  await userEvent.setup().click(within(list).getByRole('option', { name: 'See more results' }));
  const option = await screen.findByRole('option', { name: /die Aubergine.*eggplant.*saved/ });
  expect(option).toHaveAttribute('aria-disabled', 'true');
  await userEvent.setup().click(option);
  expect(screen.getByRole('combobox')).toBeInTheDocument();
});

test('Escape cancels a selected word and returns focus to search', async () => {
  const { input } = setup();
  const list = await typeAndFind(input, 'bahn');
  await userEvent.setup().click(within(list).getByRole('option', { name: 'der Bahnhof' }));
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Meaning' }), { key: 'Escape' });
  expect(screen.getByRole('combobox')).toHaveValue('');
  expect(screen.getByRole('combobox')).toHaveFocus();
});

test('Escape closes suggestions, then clears the input', async () => {
  const { input } = setup();
  await typeAndFind(input, 'bahn');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(input).toHaveValue('bahn');
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveValue('');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('Enter in the meaning adds, while Enter on Cancel cancels', async () => {
  const { input } = setup();
  let list = await typeAndFind(input, 'bahn');
  await userEvent.setup().click(within(list).getByRole('option', { name: 'der Bahnhof' }));
  const meaning = await screen.findByRole('textbox', { name: 'Meaning' });
  await userEvent.setup().click(meaning);
  fireEvent.keyDown(meaning, { key: 'Enter' });
  await waitFor(() => expect(addStarter).toHaveBeenCalledTimes(1));

  list = await typeAndFind(screen.getByRole('combobox'), 'bahn');
  await userEvent.setup().click(within(list).getByRole('option', { name: 'See more results' }));
  await userEvent.setup().click(await screen.findByRole('option', { name: /die Aubergine.*eggplant/ }));
  screen.getByRole('button', { name: 'Cancel' }).focus();
  await userEvent.setup().keyboard('{Enter}');
  expect(addLookup).not.toHaveBeenCalled();
  expect(screen.getByRole('combobox')).toHaveValue('');
});

test('lookup allowance errors appear in the dropdown', async () => {
  lookup.mockResolvedValue({ words: [], error: 'Translations are full for today. Try again tomorrow.' });
  const { input } = setup();
  const list = await typeAndFind(input, 'aubergine');
  await userEvent.setup().click(within(list).getByRole('option', { name: 'See more results' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Translations are full');
  expect(lookup).toHaveBeenCalledTimes(1);
});
