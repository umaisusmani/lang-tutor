import assert from 'node:assert/strict';
import test from 'node:test';

import { checkWithSecondLook, suppressOrthographicOnlyCorrection, type Correction } from '@/lib/tutor';

const clean: Correction = {
  hasMistake: false,
  usedEnglish: false,
  mistakeType: null,
  correction: null,
  correctionTranslation: null,
  explanation: null,
  correctionGloss: null,
};

const flagged: Correction = {
  ...clean,
  hasMistake: true,
  mistakeType: 'verb_conjugation',
  correction: 'Er geht zur Arbeit.',
};

test('a usable correction does not need a second call', async () => {
  const calls: boolean[] = [];
  const result = await checkWithSecondLook(async (secondLook) => {
    calls.push(secondLook);
    return flagged;
  });
  assert.equal(result, flagged);
  assert.deepEqual(calls, [false]);
});

test('a second look can recover an initially missed correction', async () => {
  const calls: boolean[] = [];
  const result = await checkWithSecondLook(async (secondLook) => {
    calls.push(secondLook);
    return secondLook ? flagged : clean;
  });
  assert.equal(result, flagged);
  assert.deepEqual(calls, [false, true]);
});

test('two clean verdicts stay clean', async () => {
  const result = await checkWithSecondLook(async () => clean);
  assert.equal(result, clean);
});

test('a positive verdict without a corrected sentence is retried, then fails visibly', async () => {
  const broken = { ...flagged, correction: ' ' };
  await assert.rejects(
    () => checkWithSecondLook(async () => broken),
    /correction verdict without a corrected sentence/,
  );
});

test('a corrected sentence without a positive verdict is not shown as clean', async () => {
  await assert.rejects(
    () => checkWithSecondLook(async () => ({ ...clean, correction: 'Er geht zur Arbeit.' })),
    /corrected sentence without a correction verdict/,
  );
});

test('capitalization and missing umlauts alone do not create a mistake card', () => {
  const result = suppressOrthographicOnlyCorrection('Was ist das buch uber', {
    ...flagged,
    mistakeType: 'preposition',
    correction: 'Was ist das Buch über?',
  });
  assert.deepEqual(result, clean);
});

test('a keyboard substitution is not treated as an English stand-in', () => {
  const result = suppressOrthographicOnlyCorrection('Wir gehen uber die Straße.', {
    ...clean,
    usedEnglish: true,
    correction: 'Wir gehen über die Straße.',
  });
  assert.deepEqual(result, clean);
});

test('a real grammar change still produces a correction', () => {
  const result = { ...flagged, correction: 'Ich sehe den Mann.' };
  assert.equal(suppressOrthographicOnlyCorrection('ich sehe der mann', result), result);
});

test('an English word replaced with German still gets its language card', () => {
  const result = { ...clean, usedEnglish: true, correction: 'Ich habe einen Hund.' };
  assert.equal(suppressOrthographicOnlyCorrection('Ich habe einen dog.', result), result);
});
