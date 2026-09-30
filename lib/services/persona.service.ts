import { FALLBACK_PERSONA, toPersonaProfile, type PersonaProfile } from '@/lib/personas';
import { createClient } from '@/lib/supabase/server';
import type { Persona } from '@/lib/types/db';

/**
 * Reads against `personas`. Read-only by design: the table has a SELECT
 * policy for everyone and no write policies (see 0004), so personas are
 * managed in migrations, not by the app.
 */

export async function getDefaultPersona(): Promise<Persona | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('personas')
    .select('*')
    .eq('is_default', true)
    .maybeSingle();

  if (error) console.error('[persona.service] getDefaultPersona failed:', error.message);
  return (data as Persona) ?? null;
}

export async function getPersona(id: string): Promise<Persona | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('personas').select('*').eq('id', id).maybeSingle();
  return (data as Persona) ?? null;
}

/**
 * The persona a conversation is held with: its own, or the default for a new
 * chat (or one whose persona was since removed). Never throws and never
 * returns nothing -- FALLBACK_PERSONA covers a failed lookup, so the chat
 * keeps working without its row.
 *
 * `id` is null only when it came from the fallback, which a new conversation
 * then stores as a null persona_id -- read back as the default, same result.
 */
export async function resolvePersona(
  personaId: string | null | undefined,
): Promise<{ id: string | null; profile: PersonaProfile }> {
  const row = (personaId ? await getPersona(personaId) : null) ?? (await getDefaultPersona());
  return row ? { id: row.id, profile: toPersonaProfile(row) } : { id: null, profile: FALLBACK_PERSONA };
}
