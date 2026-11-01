import { afterEach, expect, test, vi } from 'vitest';

const translateMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/profile.service', () => ({ getCurrentUserId: vi.fn().mockResolvedValue('learner') }));
vi.mock('@/lib/services/translation.service', () => ({
  consumeTranslation: vi.fn().mockResolvedValue({ allowed: true, remaining: 49 }),
}));
vi.mock('@/lib/translator', () => ({
  hasTranslatorEnv: () => true,
  parseTranslationInput: (value: { text: string; direction: string }) => value,
  translateWithAzure: translateMock,
  TranslatorError: class TranslatorError extends Error {},
}));

import { POST } from '@/app/api/translate/route';

afterEach(() => translateMock.mockReset());

function request(text: string, direction: 'de-en' | 'en-de') {
  return new Request('http://localhost/api/translate', {
    method: 'POST',
    body: JSON.stringify({ text, direction }),
  });
}

test.each([
  ['de-en', 'Laufen', 'run', 'Laufen', 'run'],
  ['en-de', 'run', 'Laufen', 'run', 'Laufen'],
] as const)('returns a ready-to-save verb for %s', async (direction, text, translation, source, target) => {
  translateMock.mockResolvedValue({ translation, dictionary: { source, target, posTag: 'VERB' } });
  const response = await POST(request(text, direction));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    translation,
    remaining: 49,
    entry: { word: 'laufen', lemma: 'laufen', translation: 'to run', lemmaTranslation: 'to run' },
  });
});

test('keeps nouns on the word breakdown path', async () => {
  translateMock.mockResolvedValue({ translation: 'dog', dictionary: { source: 'Hund', target: 'dog', posTag: 'NOUN' } });
  const response = await POST(request('Hund', 'de-en'));
  expect(await response.json()).toEqual({ translation: 'dog', remaining: 49 });
});

test('does not prefix an already infinitive English verb twice', async () => {
  translateMock.mockResolvedValue({ translation: 'to run', dictionary: { source: 'laufen', target: 'to run', posTag: 'VERB' } });
  const response = await POST(request('laufen', 'de-en'));
  expect((await response.json()).entry.lemmaTranslation).toBe('to run');
});
