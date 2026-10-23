import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { isDictionaryWord, parseTranslationInput, translateWithAzure, TranslatorError } from './translator';

const oldKey = process.env.AZURE_TRANSLATOR_KEY;
const oldRegion = process.env.AZURE_TRANSLATOR_REGION;

before(() => {
  process.env.AZURE_TRANSLATOR_KEY = 'test-key';
  process.env.AZURE_TRANSLATOR_REGION = 'eastus';
});
after(() => {
  if (oldKey === undefined) delete process.env.AZURE_TRANSLATOR_KEY;
  else process.env.AZURE_TRANSLATOR_KEY = oldKey;
  if (oldRegion === undefined) delete process.env.AZURE_TRANSLATOR_REGION;
  else process.env.AZURE_TRANSLATOR_REGION = oldRegion;
});

test('classifies isolated words conservatively', () => {
  assert.equal(isDictionaryWord('Häuser'), true);
  assert.equal(isDictionaryWord('good morning'), false);
  assert.equal(isDictionaryWord('hello!'), false);
  assert.equal(isDictionaryWord('a'.repeat(51)), false);
});

test('rejects input that could exceed the daily character budget', () => {
  assert.deepEqual(parseTranslationInput({ text: '  Haus  ', direction: 'de-en' }), {
    text: 'Haus', direction: 'de-en',
  });
  assert.equal(parseTranslationInput({ text: 'a'.repeat(201), direction: 'de-en' }), null);
  assert.equal(parseTranslationInput({ text: 'Haus', direction: 'auto' }), null);
  assert.equal(parseTranslationInput({ text: ' ', direction: 'de-en' }), null);
});

test('uses dictionary for German to English and English to German words', async () => {
  const urls: string[] = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    urls.push(String(url));
    assert.equal((init?.headers as Record<string, string>)['Ocp-Apim-Subscription-Region'], 'eastus');
    return Response.json([{ translations: [{ displayTarget: String(url).includes('from=en') ? 'Haus' : 'house' }] }]);
  }) as typeof fetch;
  assert.equal(await translateWithAzure('Haus', 'de-en', fetcher), 'house');
  assert.equal(await translateWithAzure('house', 'en-de', fetcher), 'Haus');
  assert.match(urls[0], /dictionary\/lookup\?api-version=3\.0&from=de&to=en$/);
  assert.match(urls[1], /dictionary\/lookup\?api-version=3\.0&from=en&to=de$/);
});

test('sends a sentence straight to text translation', async () => {
  let calls = 0;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    calls++;
    assert.match(String(url), /\/translate\?api-version=3\.0&from=de&to=en$/);
    assert.deepEqual(JSON.parse(String(init?.body)), [{ Text: 'Guten Morgen' }]);
    return Response.json([{ translations: [{ text: 'Good morning' }] }]);
  }) as typeof fetch;
  assert.equal(await translateWithAzure('Guten Morgen', 'de-en', fetcher), 'Good morning');
  assert.equal(calls, 1);
});

test('falls back once when dictionary has no result', async () => {
  const paths: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    paths.push(String(url));
    return Response.json(paths.length === 1
      ? [{ translations: [] }]
      : [{ translations: [{ text: 'went' }] }]);
  }) as typeof fetch;
  assert.equal(await translateWithAzure('ging', 'de-en', fetcher), 'went');
  assert.equal(paths.length, 2);
  assert.match(paths[0], /dictionary\/lookup/);
  assert.match(paths[1], /\/translate\?/);
});

test('recognizes Azure free allowance exhaustion', async () => {
  const fetcher = (async () => Response.json({ error: { code: 403001 } }, { status: 403 })) as typeof fetch;
  await assert.rejects(translateWithAzure('Haus', 'de-en', fetcher),
    (error: unknown) => error instanceof TranslatorError && error.kind === 'limit');
});
