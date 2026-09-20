import type { UIMessage } from 'ai';

import type { WordGloss } from '@/lib/gloss';
import type { Correction } from '@/lib/tutor';

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
  }
>;
