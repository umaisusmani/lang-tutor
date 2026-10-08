import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildVocabCloze, checkAnswer, type ClozeSegment } from '@/lib/cloze';

const entry = (
  term: string,
  lemma: string,
  example_sentence: string | null,
  translation: string | null = 'meaning',
) => ({ term, lemma, translation, example_sentence });

/** Renders segments the way a card front reads: ___ for the blank, *x* for emphasis. */
const front = (segments: ClozeSegment[]) =>
  segments.map((s) => (s.blank ? '___' : s.emphasis ? `*${s.text}*` : s.text)).join('');

describe('buildVocabCloze', () => {
  test('blanks the saved form, keeps the inflection as the answer', () => {
    const card = buildVocabCloze(entry('gemacht', 'machen', 'Ich habe das gestern gemacht.'));
    assert.equal(card?.kind, 'cloze');
    if (card?.kind !== 'cloze') return;
    assert.equal(front(card.segments), 'Ich habe das gestern ___.');
    assert.equal(card.answer, 'gemacht');
    assert.equal(card.lemma, 'machen');
  });

  test('separable verb: the particle stays visible and emphasized', () => {
    const card = buildVocabCloze(entry('rufe', 'anrufen', 'Ich rufe dich morgen an.'));
    if (card?.kind !== 'cloze') return assert.fail('expected a cloze');
    assert.equal(front(card.segments), 'Ich ___ dich morgen *an*.');
  });

  test('a plain verb marks no particle', () => {
    const card = buildVocabCloze(entry('macht', 'machen', 'Er macht es mal.'));
    if (card?.kind !== 'cloze') return assert.fail('expected a cloze');
    assert.ok(!card.segments.some((s) => s.emphasis));
  });

  test('matches whole words only, case-insensitively', () => {
    // "an" must not match inside "Mann".
    const card = buildVocabCloze(entry('an', 'an', 'Der Mann denkt an dich.'));
    if (card?.kind !== 'cloze') return assert.fail('expected a cloze');
    assert.equal(front(card.segments), 'Der Mann denkt ___ dich.');
  });

  test('handles umlauts at word boundaries', () => {
    const card = buildVocabCloze(entry('müde', 'müde', 'Ich bin so müde heute.'));
    if (card?.kind !== 'cloze') return assert.fail('expected a cloze');
    assert.equal(front(card.segments), 'Ich bin so ___ heute.');
  });

  test('hides a lemma hint that would give the answer away', () => {
    const card = buildVocabCloze(entry('Kind', 'das Kind', 'Das Kind spielt.'));
    if (card?.kind !== 'cloze') return assert.fail('expected a cloze');
    assert.equal(card.lemma, null);
  });

  test('no example sentence: falls back to English -> dictionary form', () => {
    assert.deepEqual(buildVocabCloze(entry('Kinder', 'das Kind', null, 'the child')), {
      kind: 'recall',
      translation: 'the child',
      answer: 'das Kind',
    });
  });

  test('word not found in the sentence: same fallback', () => {
    const card = buildVocabCloze(entry('Hund', 'der Hund', 'Ich habe eine Katze.', 'the dog'));
    assert.equal(card?.kind, 'recall');
  });

  test('nothing to ask at all: null', () => {
    assert.equal(buildVocabCloze(entry('Hund', 'der Hund', null, null)), null);
  });
});

describe('checkAnswer', () => {
  test('exact match', () => assert.deepEqual(checkAnswer('rufe', 'rufe'), { correct: true }));
  test('wrong word', () => assert.deepEqual(checkAnswer('rufst', 'rufe'), { correct: false }));
  test('empty answer is wrong', () => assert.deepEqual(checkAnswer('  ', 'rufe'), { correct: false }));

  test('ignores surrounding punctuation and spaces', () => {
    assert.deepEqual(checkAnswer('  rufe. ', 'rufe'), { correct: true });
  });

  test('accepts ae/oe/ue/ss for ä/ö/ü/ß', () => {
    assert.equal(checkAnswer('muede', 'müde').correct, true);
    assert.equal(checkAnswer('Strasse', 'Straße').correct, true);
    assert.equal(checkAnswer('schoen', 'schön').correct, true);
    assert.equal(checkAnswer('Maedchen', 'Mädchen').correct, true);
  });

  test('accepts a decomposed umlaut (u + combining diaeresis)', () => {
    assert.equal(checkAnswer('müde', 'müde').correct, true);
  });

  test('noun capitalization: correct, with a note', () => {
    assert.deepEqual(checkAnswer('kind', 'Kind'), { correct: true, capitalization: true });
  });

  test('multi-word answers compare with collapsed spaces', () => {
    assert.equal(checkAnswer('das   Kind', 'das Kind').correct, true);
  });
});
