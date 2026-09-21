import type { UIMessage } from 'ai';

import type { WordGloss } from '@/lib/gloss';
// DEPRECATED: import type { VocabCandidate } from '@/lib/services/vocab.service';
import type { Correction } from '@/lib/tutor';

/** Which background step a `notice` part is reporting on. Doubles as the
 * client's toast id, so a repeat of the same failure replaces its toast
 * instead of stacking a second one. */
export type NoticeSource = 'correction' | 'gloss' | 'history';

/**
 * Our chat message type, extending the AI SDK's UIMessage with typed data
 * parts. Shared between the route (which writes them) and the page (which
 * reads them) so both sides agree on the shape.
 *
 * "gloss" is the reply's own word-by-word translation, written once the reply
 * text is fully generated. It's separate from "correction" (which glosses the
 * *corrected* sentence, inline in its own object) because it translates
 * different text, fetched by a different call, that finishes at a different
 * time.
 *
 * "rateLimited" is written instead of everything else when an anonymous
 * visitor has hit their message cap (lib/services/session.service.ts) -- the
 * route never calls the LLM at all in that case, so this is the only part on
 * that message.
 */
export type LangTutorUIMessage = UIMessage<
  never, // no message metadata yet
  {
    correction: Correction;
    gloss: WordGloss;
    rateLimited: { cap: number };
    // Which conversation the turn was stored in. Written on every persisted
    // turn so a brand-new chat's second message appends to the conversation
    // the first one created, rather than forking a new one each turn.
    conversation: { id: string };
    // Which lemmas in this turn's glosses the learner has already saved,
    // lowercased -- so the gloss panel's save buttons render ✓ instead of +
    // without the client asking. Signed-in users only: anonymous visitors
    // have no vocab_entries to check against, and nowhere to save one anyway.
    //
    // Written by two independent chains (the reply gloss and the correction)
    // under different part ids, so neither clobbers the other; the client
    // merges every one it sees into a single Set. It's a plain array because
    // a Set doesn't survive serialization.
    savedLemmas: string[];

    // A background step failed after the reply had already been sent -- the
    // correction check, the word gloss, or saving the turn to history. The
    // reply is unaffected, which is why this is a notice and not an error, but
    // without it the learner can't tell "no mistake found" from "the check
    // didn't run", or "saved" from "quietly lost".
    //
    // Always written with `transient: true`: it's an event, not content. It
    // reaches useChat's onData once and is never added to message.parts, so it
    // can't re-fire on a re-render or reappear when the thread is reloaded.
    notice: { source: NoticeSource; message: string };

    // DEPRECATED -- replaced by savedLemmas above, since saving moved from
    // chips under the reply into the gloss panel (app/chat.tsx). Kept
    // commented rather than deleted so the chips can be revived; see
    // app/components/vocab-chips.tsx.
    //
    // Save-candidate words from this reply, already filtered (stopwords
    // dropped, deduped) and marked saved/new against the user's own
    // vocab_entries. Signed-in users only -- anonymous visitors have no
    // vocab table row to check against, and nowhere to save one anyway.
    // vocabCandidates: VocabCandidate[];
  }
>;
