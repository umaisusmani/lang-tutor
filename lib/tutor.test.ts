import assert from 'node:assert/strict';
import test from 'node:test';

import { checkWithSecondLook, type Correction } from '@/lib/tutor';

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
