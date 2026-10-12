/**
 * One-off importer: turns the Goethe-Institut TSV wordlists into the static
 * JSON the app ships (lib/starter-vocab/{a1,a2,b1}.json).
 *
 *   git clone --depth 1 https://github.com/ilkermeliksitki/goethe-institute-wordlist <dir>
 *   npx tsx scripts/import-wordlist.ts <dir>
 *
 * The source rows are `headword <TAB> German example <TAB> English translation
 * OF THE EXAMPLE` -- there is no per-word translation. Entries are cleaned to
 * a bare lemma ("die Adresse,-en" -> "die Adresse", "abholen(2)" -> "abholen",
 * "leiten, leitet, ..." -> "leiten"), and a lemma appears once, at the lowest
 * level that lists it (the B1 list repeats A1/A2 words).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const LEVELS = ['a1', 'a2', 'b1'] as const;

export type StarterWord = { lemma: string; example: string; exampleTranslation: string };

export function cleanLemma(raw: string): string | null {
  let s = raw.trim();
  s = s.replace(/\(\d+\)\s*$/, '').trim(); // sense marker: abholen(2)
  s = s.split(',')[0].trim(); // plural / verb forms: die Adresse,-en
  s = s.split('/')[0].trim(); // alternatives: circa/ca.
  s = s.replace(/\s+/g, ' ');
  if (!s || s.endsWith('-') || /[()…→]|\.\.\./.test(s)) return null;
  return s;
}

function main(dir: string) {
  const seen = new Set<string>();
  const out = path.resolve(import.meta.dirname, '../lib/starter-vocab');
  mkdirSync(out, { recursive: true });

  for (const level of LEVELS) {
    const folder = path.join(dir, level);
    const words: StarterWord[] = [];
    // `a1/a1.tsv` is the whole level concatenated; the per-letter files are the source.
    const files = readdirSync(folder).filter((f) => f.endsWith('.tsv') && f !== `${level}.tsv`);
    let dropped = 0;

    for (const file of files.sort()) {
      for (const line of readFileSync(path.join(folder, file), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const [head, example, translation] = line.split('\t');
        const lemma = cleanLemma(head ?? '');
        if (!lemma || !example?.trim() || !translation?.trim()) {
          dropped++;
          continue;
        }
        const key = lemma.toLowerCase();
        if (seen.has(key)) continue; // later sense, or listed at a lower level already
        seen.add(key);
        words.push({ lemma, example: example.trim(), exampleTranslation: translation.trim() });
      }
    }

    writeFileSync(path.join(out, `${level}.json`), JSON.stringify(words, null, 0) + '\n');
    console.log(`${level}: ${words.length} words (${dropped} rows dropped)`);
  }
}

const dir = process.argv[2];
if (!dir) {
  console.error('usage: tsx scripts/import-wordlist.ts <path to goethe-institute-wordlist>');
  process.exit(1);
}
main(dir);
