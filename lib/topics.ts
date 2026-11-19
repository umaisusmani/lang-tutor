import { activeLanguage } from '@/lib/languages';
import type { TopicSeed } from '@/lib/languages/types';
import type { CefrLevel } from '@/lib/prompts';

/**
 * Picks the optional conversation ideas the persona may bring up this turn.
 * Pure and deterministic -- no I/O, no database -- so the same chat always gets
 * the same sequence and it can be unit-tested directly.
 *
 * Her bio is the only concrete material in the prompt, so left alone she
 * keeps reaching for its most memorable nouns. A rotating pool gives her
 * fresh material; whether to use any of it stays the model's call (see
 * buildTopicGuidance in lib/prompts.ts).
 */

export const IDEAS_PER_TURN = 2;
const SHORT_MESSAGE_WORDS = 3;
const OFFER_EVERY_N_REPLIES = 3;

export interface TopicRequest {
  /** Stable for the whole chat: the conversation id, or the first message's id. */
  key: string;
  /** How many replies she has already given in this chat. */
  turn: number;
  level: CefrLevel;
  /** What the learner just wrote. */
  learnerMessage: string;
  /** Her last two replies, newest first. */
  previousReply?: string;
  replyBeforePrevious?: string;
}

/** Offered when the learner's answer is very short (the topic has run dry) and
 * otherwise every third reply, so most turns stay about what they said. */
export function shouldOfferTopics(turn: number, learnerMessage: string): boolean {
  const words = learnerMessage.trim().split(/\s+/).filter(Boolean).length;
  return words <= SHORT_MESSAGE_WORDS || (turn > 0 && turn % OFFER_EVERY_N_REPLIES === 0);
}

// FNV-1a: a small, stable string hash. Math.random() is deliberately avoided
// so a chat's sequence of ideas does not change between requests.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: a seeded generator, so the shuffle below is repeatable.
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  const random = seededRandom(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const endsWithQuestion = (reply: string | undefined) => !!reply?.trim().endsWith('?');

/**
 * The ideas to offer this turn, or an empty list. Each chat walks through its
 * own shuffled order of the pool, two at a time, so ideas do not repeat within
 * a chat. A1 learners only get the `basic` entries, and after two replies that
 * both ended in questions, "ask the learner" ideas are left out.
 */
export function pickTopics(
  request: TopicRequest,
  pool: readonly TopicSeed[] = activeLanguage.topicSeeds ?? [],
): string[] {
  if (!shouldOfferTopics(request.turn, request.learnerMessage)) return [];

  const eligible = request.level === 'A1' ? pool.filter((seed) => seed.basic) : pool;
  if (!eligible.length) return [];

  const order = shuffled(eligible, hash(request.key));
  const noQuestions = endsWithQuestion(request.previousReply) && endsWithQuestion(request.replyBeforePrevious);
  const statements = noQuestions ? order.filter((seed) => seed.kind !== 'ask') : order;
  const available = statements.length ? statements : order;

  const count = Math.min(IDEAS_PER_TURN, available.length);
  const start = (request.turn * IDEAS_PER_TURN) % available.length;
  return Array.from({ length: count }, (_, i) => available[(start + i) % available.length].text);
}
