import type { UIMessage } from 'ai';

import type { Correction } from '@/lib/tutor';

/**
 * Our chat message type, extending the AI SDK's UIMessage with a typed
 * "correction" data part. Shared between the route (which writes it) and
 * the page (which reads it) so both sides agree on the shape.
 */
export type LangTutorUIMessage = UIMessage<
  never, // no message metadata yet
  { correction: Correction } // data parts
>;
