import { createClient } from '@/lib/supabase/server';
import type { NoteCategory } from '@/lib/types/db';

export async function listNoteCategories(userId: string): Promise<NoteCategory[]> {
  try {
    const supabase = await createClient();
    const categories: NoteCategory[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase.from('note_categories').select('*').eq('user_id', userId)
        .order('id').range(from, from + pageSize - 1);
      if (error) throw error;
      categories.push(...((data as NoteCategory[]) ?? []));
      if (!data || data.length < pageSize) break;
    }
    return categories.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  } catch (error) {
    console.error('[note-category.service] listNoteCategories failed:', error);
    return [];
  }
}

export async function createNoteCategory(userId: string, name: string): Promise<NoteCategory | null> {
  const clean = typeof name === 'string' ? name.trim().slice(0, 40) : '';
  if (!clean) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('note_categories')
      .insert({ user_id: userId, name: clean }).select('*').single();
    if (!error) return data as NoteCategory;
    if (error.code === '23505') {
      return (await listNoteCategories(userId)).find((category) =>
        category.name.toLowerCase() === clean.toLowerCase()) ?? null;
    }
    console.error('[note-category.service] createNoteCategory failed:', error.message);
  } catch (error) {
    console.error('[note-category.service] createNoteCategory failed:', error);
  }
  return null;
}

export async function deleteNoteCategory(userId: string, id: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('note_categories').delete().eq('user_id', userId).eq('id', id);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[note-category.service] deleteNoteCategory failed:', error);
    return false;
  }
}
