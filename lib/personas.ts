import type { Persona } from '@/lib/types/db';

/**
 * The persona fields the prompt and the UI actually use -- everything on the
 * `personas` row except bookkeeping. A narrower type so the eval runner and
 * the fallback below don't have to invent ids and timestamps.
 */
export type PersonaProfile = Pick<Persona, 'name' | 'age' | 'city' | 'bio' | 'avatar_url'>;

/**
 * Mirrors the seed row in supabase/migrations/0004_personas_and_explanations.sql.
 *
 * Used in two places the database can't be:
 * - the eval runner, which has no Supabase session, and still has to exercise
 *   the same prompt production uses;
 * - chat, when the personas lookup fails (or 0004 isn't applied yet) -- a
 *   missing persona should cost the chat its character, not the reply.
 *
 * The row is the source of truth once it exists; edit both together.
 */
export const FALLBACK_PERSONA: PersonaProfile = {
  name: 'Ramanath',
  age: 24,
  city: 'Düsseldorf',
  bio:
    'Kind, warm and talkative. Studies media design and works weekend shifts in ' +
    'a café in Flingern. Loves walking along the Rhine, trying new recipes, ' +
    'indie music and cycling around the city. Has a younger brother and a ' +
    'slightly chaotic flatmate. Curious about other people and happy to ' +
    'share little stories from her own week. Also very much into Jewellary crafting and have a small Etsy shop for it.',
  avatar_url: '/avatars/ramanath.svg',
};

/** Narrows a full row to what gets passed around (and serialized to the
 * client). */
export function toPersonaProfile(persona: Persona): PersonaProfile {
  const { name, age, city, bio, avatar_url } = persona;
  return { name, age, city, bio, avatar_url };
}
