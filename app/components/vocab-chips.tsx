'use client';

import { useState } from 'react';

import { saveVocabAction } from '@/app/vocab/actions';
import type { VocabCandidate } from '@/lib/services/vocab.service';

/**
 * One save-candidate chip. Saved state is tracked locally rather than
 * re-fetching candidates after a click: the server already told us whether
 * each word was saved at gloss-time, and a save can only ever move it from
 * unsaved -> saved during this component's lifetime (there's no unsave
 * button here -- that lives on the /vocab page), so a local override is
 * always correct.
 */
function VocabChip({ candidate }: { candidate: VocabCandidate }) {
  const [saved, setSaved] = useState(candidate.saved);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (saved || pending) return;
    setPending(true);
    setSaved(true); // optimistic -- a failed save just means the word waits for another chance to be saved, not worth rolling back over
    await saveVocabAction({
      term: candidate.term,
      lemma: candidate.lemma,
      translation: candidate.translation,
    });
    setPending(false);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={saved}
      className={
        saved
          ? 'border-hair text-ink-3 cursor-default rounded-full border-2 px-[13px] py-[5px] text-[13.5px] font-semibold'
          : 'border-line text-ink hover:bg-yellow hover:text-on-bright cursor-pointer rounded-full border-2 px-[13px] py-[5px] text-[13.5px] font-semibold transition-colors duration-150 active:translate-x-px active:translate-y-px'
      }
    >
      {saved ? `✓ ${candidate.lemma}` : `+ ${candidate.lemma}`}
    </button>
  );
}

export function VocabChips({ candidates }: { candidates: VocabCandidate[] }) {
  if (candidates.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">save</span>
      {candidates.map((c) => (
        <VocabChip key={c.lemma} candidate={c} />
      ))}
    </div>
  );
}
