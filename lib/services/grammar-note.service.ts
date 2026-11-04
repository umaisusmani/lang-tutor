import { createClient } from '@/lib/supabase/server';
import { EXAMPLE_SENTENCE_MAX } from '@/lib/services/vocab.service';
import type { GrammarNote } from '@/lib/types/db';

function validNote(note: string): string | null {
  if (typeof note !== 'string') return null;
  const trimmed = note.trim();
  return trimmed && trimmed.length <= 500 ? trimmed : null;
}

function cleanCategory(category?: string): string | null {
  return typeof category === 'string' ? category.trim().slice(0, 40) || null : null;
}

export async function saveGrammarNote(
  userId: string,
  input: { note: string; exampleSentence?: string; category?: string },
): Promise<boolean> {
  const note = validNote(input.note);
  if (!note) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('grammar_notes').insert({
      user_id: userId,
      note,
      category: cleanCategory(input.category),
      example_sentence: typeof input.exampleSentence === 'string'
        ? input.exampleSentence.slice(0, EXAMPLE_SENTENCE_MAX) || null : null,
    });
    if (error) {
      console.error('[grammar-note.service] saveGrammarNote failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[grammar-note.service] saveGrammarNote failed:', err);
    return false;
  }
}

export async function deleteGrammarNote(userId: string, noteId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('grammar_notes').delete()
      .eq('id', noteId).eq('user_id', userId);
    if (error) {
      console.error('[grammar-note.service] deleteGrammarNote failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[grammar-note.service] deleteGrammarNote failed:', err);
    return false;
  }
}

export async function updateGrammarNote(
  userId: string, noteId: string, input: { note: string; category?: string },
): Promise<boolean> {
  const note = validNote(input.note);
  if (!note) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('grammar_notes').update({ note, category: cleanCategory(input.category) })
      .eq('id', noteId).eq('user_id', userId);
    if (error) {
      console.error('[grammar-note.service] updateGrammarNote failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[grammar-note.service] updateGrammarNote failed:', err);
    return false;
  }
}

export async function listGrammarNotes(userId: string): Promise<GrammarNote[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('grammar_notes').select('*')
    .eq('user_id', userId).order('created_at', { ascending: false });
  return (data as GrammarNote[]) ?? [];
}

export async function listNoteCategories(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const categories = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('grammar_notes').select('category')
      .eq('user_id', userId).order('id').range(from, from + pageSize - 1);
    if (error) {
      console.error('[grammar-note.service] listNoteCategories failed:', error.message);
      return [];
    }
    for (const row of data ?? []) {
      const category = row.category?.trim();
      if (category) categories.add(category);
    }
    if (!data || data.length < pageSize) break;
  }
  return [...categories]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
