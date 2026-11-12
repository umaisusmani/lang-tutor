import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_APP_LANGUAGE = 'tr';

// Import after setting the deploy-time selector; each Node test file has its own process.
const modules = Promise.all([
  import('@/lib/language-case'),
  import('@/lib/text'),
  import('@/lib/cloze'),
  import('@/lib/mask-target'),
  import('@/lib/translator'),
  import('@/lib/languages'),
  import('@/lib/prompts'),
  import('@/lib/ask'),
  import('@/lib/mistake-types'),
  import('@/lib/starter-vocab'),
]);

test('Turkish casing, punctuation, and keyboard folding', async () => {
  const [languageCase, text, cloze] = await modules;
  assert.equal(languageCase.lowercaseTargetText('IŞIK'), 'ışık');
  assert.equal(languageCase.lowercaseTargetText('İSTANBUL'), 'istanbul');
  assert.equal(text.stripPunctuation('kuş,'), 'kuş');
  assert.equal(text.stripPunctuation('„dağ!”'), 'dağ');
  assert.deepEqual(cloze.checkAnswer('cok', 'çok'), { correct: true });
  assert.deepEqual(cloze.checkAnswer('KİTAP', 'kitap'), { correct: true });
});

test('Turkish cloze and suffix masking', async () => {
  const [, , cloze, mask] = await modules;
  const card = cloze.buildVocabCloze({
    term: 'evlerimizden', lemma: 'ev', translation: 'from our houses',
    example_sentence: 'Biz evlerimizden çıktık.',
  });
  assert.equal(card?.kind, 'cloze');
  if (card?.kind !== 'cloze') return;
  assert.equal(card.answer, 'evlerimizden');
  assert.equal(card.segments.map((part) => part.blank ? '___' : part.text).join(''), 'Biz ___ çıktık.');
  assert.ok(card.segments.every((part) => !part.emphasis));
  assert.equal(mask.maskTarget('Kitaplar masada.', 'kitap'), '____ masada.');
});

test('translator directions and active mistake taxonomy', async () => {
  const [, , , , translator, language, , , mistakes] = await modules;
  assert.deepEqual(language.translatorDirections, {
    targetToEnglish: 'tr-en', englishToTarget: 'en-tr', azureLanguageCode: 'tr',
  });
  assert.equal(translator.isTranslationDirection('tr-en'), true);
  assert.equal(translator.isTranslationDirection('en-tr'), true);
  assert.equal(translator.isTranslationDirection('de-en'), false);
  assert.equal(mistakes.isMistakeType('vowel_harmony'), true);
  assert.equal(mistakes.isMistakeType('gender_article'), false);
});

test('Turkish prompts contain no German instructions at every CEFR level', async () => {
  const [, , , , , , prompts, ask] = await modules;
  const conversation = prompts.buildConversationSystemPrompt('A2');
  assert.match(conversation, /Reply in Turkish/);
  assert.match(conversation, /Ramya/);
  const allPrompts = [prompts.buildGlossSystemPrompt(), prompts.buildWordLookupSystemPrompt()];
  for (const level of prompts.CEFR_LEVELS) {
    allPrompts.push(
      prompts.buildConversationSystemPrompt(level),
      prompts.buildCorrectionSystemPrompt(level),
      prompts.buildCorrectionSecondLookPrompt(level),
      prompts.buildGrammarExplanationPrompt(level, 'reply'),
      prompts.buildGrammarExplanationPrompt(level, 'correction'),
      ask.askSettings({ question: '', level, chatContext: '', panelContext: '' }).system,
    );
  }
  for (const prompt of allPrompts) {
    assert.doesNotMatch(prompt, /German|umlaut|ß/i);
    // The Turkish lemma rule explicitly says Turkish has no articles.
    assert.doesNotMatch(prompt.replaceAll('Turkish has no articles: never add one.', ''), /\barticles?\b/i);
  }
});

test('Turkish starter vocabulary is empty', async () => {
  const [, , , , , , , , , starters] = await modules;
  assert.equal(starters.hasStarterWords, false);
  assert.deepEqual(starters.searchStarterWords('ev'), []);
  assert.deepEqual(starters.pickStarterWords('A1', new Set(), 10), []);
});
