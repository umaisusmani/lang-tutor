/**
 * Eval runner: exercises the same functions the chat route calls --
 * lib/tutor.ts's detectCorrection() and lib/gloss.ts's glossText() -- against
 * the curated cases in evals/. No HTTP, no route handler, so this tests the
 * real functions, not a copy of them.
 *
 * Run with `npm run eval` (both suites), or `npm run eval -- correction` /
 * `npm run eval -- gloss` for one. Makes real Groq calls, so it needs
 * GROQ_API_KEY in .env.local and uses a little of the quota.
 */
import { EVAL_CASES } from '@/evals/cases';
import { GLOSS_EVAL_CASES } from '@/evals/gloss-cases';
import { glossText } from '@/lib/gloss';
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

    const ok = hasMistakeOk && typeOk;

    if (ok) {
      passed++;
      console.log(`✓ ${testCase.id}`);
    } else {
      const detail = !hasMistakeOk
        ? `expected hasMistake=${testCase.expectHasMistake}, got ${result.hasMistake}`
        : `expected mistakeType=${testCase.expectMistakeType}, got ${result.mistakeType}`;
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
      for (const [word, expected] of Object.entries(testCase.expectLemmas)) {
        const accepted = (Array.isArray(expected) ? expected : [expected]).map(normalizeLemma);
        const entry = run.value.find((g) => g.word === word);
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

const SUITES: Record<string, () => Promise<SuiteResult>> = {
  correction: runCorrectionSuite,
  gloss: runGlossSuite,
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
