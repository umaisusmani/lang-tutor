'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/app/components/button';
import { Pill } from '@/app/components/pill';
import { NoteRow, type NoteItem } from '@/app/notes/note-row';
import { saveGrammarNoteAction, searchSavedWordsAction, updateVocabNoteAction } from '@/app/vocab/actions';
import type { GrammarNote, VocabEntry } from '@/lib/types/db';

type SavedWord = { id: string; lemma: string };

export function NotesBrowser({ grammarNotes, wordNotes, heading }: {
  grammarNotes: GrammarNote[];
  wordNotes: VocabEntry[];
  heading: ReactNode;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SavedWord[]>([]);
  const [selectedWord, setSelectedWord] = useState<SavedWord | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const searchRef = useRef(0);

  useEffect(() => {
    if (!attachOpen || selectedWord || !query.trim()) return;
    const request = ++searchRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const words = await searchSavedWordsAction(query.trim());
        if (request === searchRef.current) setMatches(words);
      } catch {
        if (request === searchRef.current) setMatches([]);
      } finally {
        if (request === searchRef.current) setSearching(false);
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [attachOpen, query, selectedWord]);

  const items: NoteItem[] = [
    ...grammarNotes.map((note): NoteItem => ({ kind: 'grammar', note })),
    ...wordNotes.filter((note) => note.note?.trim()).map((note): NoteItem => ({ kind: 'word', note })),
  ].filter((item) => !removed.has(`${item.kind}-${item.note.id}`))
    .sort((a, b) => b.note.created_at.localeCompare(a.note.created_at));

  function resetAttachment() {
    searchRef.current++;
    setQuery('');
    setMatches([]);
    setSelectedWord(null);
    setSearching(false);
  }

  async function add() {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = selectedWord
        ? await updateVocabNoteAction(selectedWord.id, text.trim())
        : await saveGrammarNoteAction(text.trim());
      if (!result.ok) throw new Error('Save failed');
      if (selectedWord) setRemoved((previous) => {
        const next = new Set(previous);
        next.delete(`word-${selectedWord.id}`);
        return next;
      });
      setText('');
      resetAttachment();
      setAttachOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't add this note. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    {heading}
    <section className="border-line bg-panel flex flex-col gap-3 rounded-2xl border-2 p-4">
      <label htmlFor="new-note" className="font-display text-xl">Add a note</label>
      <textarea id="new-note" value={text} maxLength={500} rows={4}
        onChange={(event) => setText(event.target.value)}
        placeholder="A grammar rule, a reminder, anything you want to keep…"
        className="border-line bg-panel text-ink w-full resize-y rounded-xl border-2 px-3 py-2.5 text-sm outline-none" />
      {selectedWord ? <div className="flex items-center gap-2">
        <span className="text-ink-3 font-mono text-xs">attached to:</span>
        <Pill onClick={resetAttachment} aria-label={`Remove attachment: ${selectedWord.lemma}`}>
          {selectedWord.lemma} ×
        </Pill>
      </div> : <>
        <Pill className="self-start" onClick={() => {
          if (attachOpen) resetAttachment();
          setAttachOpen(!attachOpen);
        }} aria-expanded={attachOpen}>attach to a saved word (optional)</Pill>
        {attachOpen && <div className="flex flex-col gap-2">
          <label htmlFor="saved-word-search" className="text-ink-2 text-sm">Search saved words</label>
          <input id="saved-word-search" type="search" value={query} maxLength={50}
            onChange={(event) => {
              searchRef.current++;
              setQuery(event.target.value);
              setMatches([]);
              setSearching(Boolean(event.target.value.trim()));
            }}
            placeholder="Type a German word…"
            className="border-line bg-panel rounded-xl border-2 px-3 py-2" />
          {searching && <span className="text-ink-3 font-mono text-xs" role="status">Searching…</span>}
          {matches.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Saved word matches">
            {matches.map((word) => <Pill key={word.id} onClick={() => {
              searchRef.current++;
              setSelectedWord(word);
              setMatches([]);
              setSearching(false);
            }}>{word.lemma}</Pill>)}
          </div>}
        </div>}
      </>}
      {error && <p role="alert" className="text-ink-2 text-sm">{error}</p>}
      <Button variant="primary" type="button" disabled={saving || !text.trim()} onClick={() => void add()}
        className="self-start">{saving ? 'Adding…' : 'Add note'}</Button>
    </section>
    <div className="flex flex-col gap-3">
      {items.map((item) => <NoteRow key={`${item.kind}-${item.note.id}-${item.note.note}`} item={item}
        onChanged={() => router.refresh()}
        onRemoved={() => {
          setRemoved((previous) => new Set(previous).add(`${item.kind}-${item.note.id}`));
          router.refresh();
        }} />)}
      {items.length === 0 && <p className="text-ink-3 text-sm">No notes saved yet. Save one from a chat correction, or add one above.</p>}
    </div>
  </>;
}
