/**
 * Eval runner: exercises the same functions the chat route calls --
 * lib/tutor.ts's detectCorrection() and lib/gloss.ts's glossText() -- against
 * the curated cases in evals/. No HTTP, no route handler, so this tests the
 * real functions, not a copy of them.
 *
 * Run with `npm run eval` (every suite), or name one or more:
 * `npm run eval -- correction`, `-- gloss`, `-- reply`. Makes real Groq calls, so it needs
 * GROQ_API_KEY in .env.local and uses a little of the quota.
 */
import { generateText } from 'ai';

import { EVAL_CASES } from '@/evals/cases';
import { GLOSS_EVAL_CASES } from '@/evals/gloss-cases';
import {
  HELPER_PHRASES,
  MAX_QUESTION_SHARE,
  QUESTION_SHARE_CONVERSATION,
  REPLY_EVAL_CASES,
  REPLY_LIMITS,
} from '@/evals/reply-level-cases';
import { glossText } from '@/lib/gloss';
import { FALLBACK_PERSONA } from '@/lib/personas';
import { replySettings } from '@/lib/reply';
import { detectCorrection } from '@/lib/tutor';

/**
 * How many times each gloss case runs. A case passes only if every run
 * passes: the failure these cases exist for is inconsistency as much as
 * wrongness -- a word whose lemma changes between runs gets two vocab rows.
 */
const GLOSS_RUNS = 3;

/**
 * Groq's free tier allows 8,000 tokens per minute and a gloss call is ~900,
 * so a burst of parallel calls trips the limit, and the AI SDK's own retries
 * back off for far less than the minute window. Without this, a rate limit
 * shows up as a failed case, which says nothing about the prompt. On a 429
 * this waits as long as Groq's message asks (plus a margin) and tries again.
 */
async function withRateLimitRetry<T>(call: () => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await call();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (i >= attempts || !/rate limit/i.test(message)) throw err;
      const seconds = Number(message.match(/try again in ([\d.]+)s/)?.[1] ?? 10);
      await new Promise((resolve) => setTimeout(resolve, (seconds + 2) * 1000));
    }
  }
}

interface SuiteResult {
  passed: number;
  total: number;
  failures: string[];
}

async function runCorrectionSuite(): Promise<SuiteResult> {
  let passed = 0;
  const failures: string[] = [];

  for (const testCase of EVAL_CASES) {
    let result;
    try {
      result = await withRateLimitRetry(() => detectCorrection(testCase.input, testCase.level));
    } catch (err) {
      failures.push(`${testCase.id}: threw an error -- ${err instanceof Error ? err.message : err}`);
      console.log(`✗ ${testCase.id} (ERROR)`);
      continue;
    }

    const hasMistakeOk = result.hasMistake === testCase.expectHasMistake;
    const typeOk =
      !testCase.expectHasMistake || !testCase.expectMistakeType
        ? true
        : result.mistakeType === testCase.expectMistakeType;
    const englishOk =
      testCase.expectUsedEnglish === undefined ||
      result.usedEnglish === testCase.expectUsedEnglish;

    const ok = hasMistakeOk && typeOk && englishOk;

    if (ok) {
      passed++;
      console.log(`✓ ${testCase.id}`);
    } else {
      const detail = !hasMistakeOk
        ? `expected hasMistake=${testCase.expectHasMistake}, got ${result.hasMistake}`
        : !typeOk
          ? `expected mistakeType=${testCase.expectMistakeType}, got ${result.mistakeType}`
          : `expected usedEnglish=${testCase.expectUsedEnglish}, got ${result.usedEnglish}`;
      failures.push(`${testCase.id}: ${detail} -- "${testCase.note}"`);
      console.log(`✗ ${testCase.id} (${detail})`);
    }
  }

  return { passed, total: EVAL_CASES.length, failures };
}

/** Lemmas are compared ignoring case and extra spaces -- see GlossEvalCase. */
function normalizeLemma(lemma: string): string {
  return lemma.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function runGlossSuite(): Promise<SuiteResult> {
  let passed = 0;
  const failures: string[] = [];

  for (const testCase of GLOSS_EVAL_CASES) {
    // One call at a time -- see withRateLimitRetry(). Slower than parallel,
    // but it's the free tier's per-minute budget that sets the pace anyway.
    const runs: PromiseSettledResult<Awaited<ReturnType<typeof glossText>>>[] = [];
    for (let run = 0; run < GLOSS_RUNS; run++) {
      try {
        runs.push({
          status: 'fulfilled',
          value: await withRateLimitRetry(() => glossText(testCase.input)),
        });
      } catch (reason) {
        runs.push({ status: 'rejected', reason });
      }
    }

    // Every wrong lemma across all runs, deduplicated, so a word that was
    // wrong the same way three times is reported once.
    const problems = new Set<string>();
    for (const run of runs) {
      if (run.status === 'rejected') {
        problems.add(`threw: ${run.reason instanceof Error ? run.reason.message : run.reason}`);
        continue;
      }
      if (!run.value.translation.trim()) problems.add('empty sentence translation');
      for (const [word, expected] of Object.entries(testCase.expectLemmas)) {
        const accepted = (Array.isArray(expected) ? expected : [expected]).map(normalizeLemma);
        const entry = run.value.words.find((g) => g.word === word);
        if (!entry) {
          problems.add(`"${word}" missing from gloss`);
        } else if (!accepted.includes(normalizeLemma(entry.lemma))) {
          problems.add(`"${word}" -> "${entry.lemma}" (expected "${accepted.join('" or "')}")`);
        }
      }
    }

    if (problems.size === 0) {
      passed++;
      console.log(`✓ ${testCase.id}`);
    } else {
      const detail = [...problems].join('; ');
      failures.push(`${testCase.id}: ${detail} -- "${testCase.note}"`);
      console.log(`✗ ${testCase.id} (${detail})`);
    }
  }

  return { passed, total: GLOSS_EVAL_CASES.length, failures };
}

/** Sentences in a reply, split after . ! ? -- crude, but replies are short
 * and plainly punctuated, and a miscount errs toward "longer", i.e. strict. */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Checks the conversation prompt against the limits it sets: per reply, the
 * A1/A2 length and conjunction limits and the no-helper-phrasing rule; over
 * one scripted conversation, that replies don't all end in a question. The model id and
 * settings come from lib/reply.ts, the same ones chat streams with.
 */
async function runReplySuite(): Promise<SuiteResult> {
  let passed = 0;
  const failures: string[] = [];

  for (const testCase of REPLY_EVAL_CASES) {
    // Earlier learner turns are paired with a neutral placeholder reply so
    // the model sees a real multi-turn history, not three user messages.
    const messages = testCase.turns.flatMap((turn, i) =>
      i < testCase.turns.length - 1
        ? [
            { role: 'user' as const, content: turn },
            { role: 'assistant' as const, content: 'Schön!' },
          ]
        : [{ role: 'user' as const, content: turn }],
    );

    let reply: string;
    try {
      ({ text: reply } = await withRateLimitRetry(() =>
        generateText({ ...replySettings(testCase.level, FALLBACK_PERSONA), messages }),
      ));
    } catch (err) {
      failures.push(`${testCase.id}: threw an error -- ${err instanceof Error ? err.message : err}`);
      console.log(`✗ ${testCase.id} (ERROR)`);
      continue;
    }

    const problems: string[] = [];
    const limits = REPLY_LIMITS[testCase.level];
    if (limits) {
      const sentences = sentencesOf(reply);
      if (sentences.length > limits.maxSentences) {
        problems.push(`${sentences.length} sentences (max ${limits.maxSentences})`);
      }
      for (const sentence of sentences) {
        const words = sentence.split(/\s+/).length;
        if (words > limits.maxWordsPerSentence) {
          problems.push(`${words}-word sentence (max ${limits.maxWordsPerSentence}): "${sentence}"`);
        }
      }
      for (const banned of limits.bannedWords) {
        if (new RegExp(`\\b${banned}\\b`, 'i').test(reply)) problems.push(`uses "${banned}"`);
      }
    }
    if (HELPER_PHRASES.some((re) => re.test(reply))) problems.push('helper phrasing');
    for (const expected of testCase.expectContains ?? []) {
      if (!reply.toLowerCase().includes(expected.toLowerCase())) {
        problems.push(`doesn't contain "${expected}"`);
      }
    }

    if (problems.length === 0) {
      passed++;
      console.log(`✓ ${testCase.id}  ${reply.replace(/\s+/g, ' ')}`);
    } else {
      const detail = problems.join('; ');
      failures.push(`${testCase.id}: ${detail} -- reply: "${reply.replace(/\s+/g, ' ')}"`);
      console.log(`✗ ${testCase.id} (${detail})`);
    }
  }

  // The question rate, over a real conversation: each reply is generated
  // from the actual history, exactly as chat does, so buildTurnGuidance()
  // sees her previous reply.
  const { level, turns } = QUESTION_SHARE_CONVERSATION;
  const history: { role: 'user' | 'assistant'; content: string }[] = [];
  let questions = 0;
  try {
    for (const turn of turns) {
      history.push({ role: 'user', content: turn });
      const previous = history.findLast((m) => m.role === 'assistant')?.content;
      const { text } = await withRateLimitRetry(() =>
        generateText({ ...replySettings(level, FALLBACK_PERSONA, previous), messages: history }),
      );
      history.push({ role: 'assistant', content: text });
      if (text.trim().endsWith('?')) questions++;
      console.log(`    > ${turn}\n    < ${text.replace(/\s+/g, ' ')}`);
    }
    const share = questions / turns.length;
    const shareOk = share <= MAX_QUESTION_SHARE;
    console.log(
      `${shareOk ? '✓' : '✗'} question-share: ${questions}/${turns.length} replies end in a question` +
        ` (max ${Math.round(MAX_QUESTION_SHARE * 100)}%)`,
    );
    if (shareOk) passed++;
    else failures.push(`question-share: ${questions}/${turns.length} end in a question -- reads like an interview`);
  } catch (err) {
    failures.push(`question-share: threw an error -- ${err instanceof Error ? err.message : err}`);
    console.log('✗ question-share (ERROR)');
  }

  return { passed, total: REPLY_EVAL_CASES.length + 1, failures };
}

const SUITES: Record<string, () => Promise<SuiteResult>> = {
  correction: runCorrectionSuite,
  gloss: runGlossSuite,
  reply: runReplySuite,
};

async function main() {
  const requested = process.argv.slice(2);
  const unknown = requested.filter((name) => !(name in SUITES));
  if (unknown.length > 0) {
    console.error(`Unknown suite: ${unknown.join(', ')}. Available: ${Object.keys(SUITES).join(', ')}`);
    process.exit(1);
  }
  const names = requested.length > 0 ? requested : Object.keys(SUITES);

  let anyFailed = false;
  for (const name of names) {
    console.log(`\n=== ${name} ===`);
    const { passed, total, failures } = await SUITES[name]();
    console.log(`\n${passed}/${total} passed`);

    if (failures.length > 0) {
      anyFailed = true;
      console.log('\nFailures:');
      for (const f of failures) console.log(`  - ${f}`);
    }
  }

  if (anyFailed) process.exit(1);
}

main();
