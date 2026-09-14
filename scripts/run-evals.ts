/**
 * Eval runner: exercises lib/tutor.ts's detectCorrection() directly against
 * the curated cases in evals/cases.ts -- no HTTP, no route handler, so this
 * tests the exact same function the API route calls, not a copy of it.
 *
 * Run with `npm run eval`.
 */
import { EVAL_CASES } from '@/evals/cases';
import { detectCorrection } from '@/lib/tutor';

async function main() {
  let passed = 0;
  const failures: string[] = [];

  for (const testCase of EVAL_CASES) {
    let result;
    try {
      result = await detectCorrection(testCase.input, testCase.level);
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

  console.log('');
  console.log(`${passed}/${EVAL_CASES.length} passed`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main();
