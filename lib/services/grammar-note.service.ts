import { createClient } from '@/lib/supabase/server';
import { noteHtmlToPlainText } from '@/lib/sanitize-note-html';
import { EXAMPLE_SENTENCE_MAX } from '@/lib/services/vocab.service';
import type { GrammarNote } from '@/lib/types/db';

function validNote(note: string): string | null {
  if (typeof note !== 'string') return null;
  const trimmed = note.trim();
  const plain = noteHtmlToPlainText(trimmed);
  return plain.trim() && plain.length <= 500 && trimmed.length <= 5000 ? trimmed : null;
}

export async function saveGrammarNote(
  userId: string,
  input: { note: string; exampleSentence?: string; categoryId?: string | null },
): Promise<boolean> {
  const note = validNote(input.note);
  if (!note) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('grammar_notes').insert({
      user_id: userId,
      note,
      category_id: input.categoryId ?? null,
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
  userId: string, noteId: string, input: { note: string; categoryId?: string | null },
): Promise<boolean> {
  const note = validNote(input.note);
  if (!note) return false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('grammar_notes').update({ note, category_id: input.categoryId ?? null })
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
