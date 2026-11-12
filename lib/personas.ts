import type { Persona } from '@/lib/types/db';
import { fallbackPersona } from '@/lib/languages';

/**
 * The persona fields the prompt and the UI actually use -- everything on the
 * `personas` row except bookkeeping. A narrower type so the eval runner and
 * the fallback below don't have to invent ids and timestamps.
 */
export type PersonaProfile = Pick<Persona, 'name' | 'age' | 'city' | 'bio' | 'avatar_url'>;

export const FALLBACK_PERSONA: PersonaProfile = fallbackPersona;

/** Narrows a full row to what gets passed around (and serialized to the
 * client). */
export function toPersonaProfile(persona: Persona): PersonaProfile {
  const { name, age, city, bio, avatar_url } = persona;
  return { name, age, city, bio, avatar_url };
}
