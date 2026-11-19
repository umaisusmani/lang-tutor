import assert from 'node:assert/strict';
import test from 'node:test';

import { DE_TOPIC_SEEDS } from '@/lib/languages/de-topics';
import type { TopicSeed } from '@/lib/languages/types';
import {
  buildConversationSystemPrompt,
  buildCorrectionSecondLookPrompt,
  buildCorrectionSystemPrompt,
  buildTopicGuidance,
} from '@/lib/prompts';
import { pickTopics, shouldOfferTopics } from '@/lib/topics';

const pool: TopicSeed[] = [
  { kind: 'story', text: 'story one', basic: true },
  { kind: 'story', text: 'story two' },
  { kind: 'opinion', text: 'opinion one', basic: true },
  { kind: 'plan', text: 'plan one' },
  { kind: 'ask', text: 'ask one', basic: true },
  { kind: 'ask', text: 'ask two' },
];

const base = { key: 'chat-1', turn: 0, level: 'A2' as const, learnerMessage: 'ja' };

test('ideas are offered when the learner answers briefly, and every third reply otherwise', () => {
  assert.equal(shouldOfferTopics(0, 'Ja'), true);
  assert.equal(shouldOfferTopics(1, 'Mir geht es gut'), false);
  assert.equal(shouldOfferTopics(2, 'Ich habe heute lange gearbeitet'), false);
  assert.equal(shouldOfferTopics(3, 'Ich habe heute lange gearbeitet'), true);
  assert.equal(shouldOfferTopics(0, 'Ich habe heute lange gearbeitet'), false);
});

test('no ideas on a normal turn', () => {
  assert.deepEqual(pickTopics({ ...base, turn: 1, learnerMessage: 'Ich habe heute lange gearbeitet' }, pool), []);
});

test('the same chat always gets the same ideas, and different chats get different orders', () => {
  assert.deepEqual(pickTopics(base, pool), pickTopics(base, pool));
  const orders = new Set(
    ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => pickTopics({ ...base, key }, DE_TOPIC_SEEDS).join('|')),
  );
  assert.ok(orders.size > 1);
});

test('ideas do not repeat while a chat works through the pool', () => {
  const seen = [0, 1, 2].flatMap((turn) => pickTopics({ ...base, turn }, pool));
  assert.equal(seen.length, 6);
  assert.equal(new Set(seen).size, 6);
});

test('A1 learners only get basic ideas', () => {
  const basic = new Set(pool.filter((seed) => seed.basic).map((seed) => seed.text));
  for (let turn = 0; turn < 6; turn++) {
    for (const text of pickTopics({ ...base, level: 'A1', turn }, pool)) assert.ok(basic.has(text), text);
  }
});

test('after two replies that ended in questions, no "ask the learner" ideas are offered', () => {
  const asks = new Set(pool.filter((seed) => seed.kind === 'ask').map((seed) => seed.text));
  for (let turn = 0; turn < 6; turn++) {
    const picked = pickTopics({ ...base, turn, previousReply: 'Und du?', replyBeforePrevious: 'Wirklich?' }, pool);
    assert.ok(picked.length > 0);
    for (const text of picked) assert.ok(!asks.has(text), text);
  }
});

test('an empty pool offers nothing', () => {
  assert.deepEqual(pickTopics(base, []), []);
});

test('the German pool is usable', () => {
  const texts = DE_TOPIC_SEEDS.map((seed) => seed.text);
  assert.equal(new Set(texts).size, texts.length, 'duplicate topic');
  assert.ok(texts.every((text) => text.trim().length > 20));
  assert.ok(!texts.some((text) => /rhine/i.test(text)));
  assert.ok(DE_TOPIC_SEEDS.length >= 120);
  assert.ok(DE_TOPIC_SEEDS.filter((seed) => seed.basic).length >= 40);
  for (const kind of ['story', 'opinion', 'plan', 'person', 'ask']) {
    assert.ok(DE_TOPIC_SEEDS.some((seed) => seed.kind === kind), kind);
  }
});

test('topic guidance lists the ideas, and is empty without any', () => {
  assert.equal(buildTopicGuidance([]), '');
  const guidance = buildTopicGuidance(['idea one', 'idea two']);
  assert.match(guidance, /- idea one\n- idea two$/);
  assert.match(guidance, /React to what the learner said first/);
});

test('per-turn notes sit before the level section, which stays last', () => {
  const prompt = buildConversationSystemPrompt('A2', undefined, 'a note for this turn');
  const note = prompt.indexOf('This turn:\na note for this turn');
  const level = prompt.indexOf("Learner's level");
  assert.ok(note > 0 && level > note);
  assert.ok(prompt.trimEnd().endsWith('Everyday vocabulary. Speak to the learner as "du".'));
  assert.ok(!buildConversationSystemPrompt('A2').includes('This turn:'));
});

test('A2 allows war/hatte, which the persona needs to talk about her day', () => {
  assert.match(buildConversationSystemPrompt('A2'), /"war", "hatte"/);
});

test('the correction prompts no longer ask for a gloss or carry the lemma rules', () => {
  for (const prompt of [buildCorrectionSystemPrompt('A2'), buildCorrectionSecondLookPrompt('A2')]) {
    assert.ok(!prompt.includes('correctionGloss'));
    assert.ok(!prompt.includes('lemmaTranslation'));
  }
});
