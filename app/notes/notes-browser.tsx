'use client';

import { activeLanguage } from '@/lib/languages';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Button, buttonClassName } from '@/app/components/button';
import { Modal } from '@/app/components/modal';
import { Pill, pillClassName } from '@/app/components/pill';
import { Select } from '@/app/components/select';
import { NoteRow, type NoteItem } from '@/app/notes/note-row';
import { RichEditor } from '@/app/notes/rich-editor';
import { createNoteCategoryAction, listNoteCategoriesAction, saveGrammarNoteAction, searchSavedWordsAction, updateVocabNoteAction } from '@/app/vocab/actions';
import { noteHtmlToPlainText, noteTextToHtml } from '@/lib/sanitize-note-html';
import type { GrammarNote, NoteCategory, VocabEntry } from '@/lib/types/db';

type SavedWord = { id: string; lemma: string };

export function NotesBrowser({ grammarNotes, wordNotes, count }: {
  grammarNotes: GrammarNote[];
  wordNotes: VocabEntry[];
  count: number;
}) {
  const router = useRouter();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addNoteModalOpen, setAddNoteModalOpen] = useState(false);
  const [addCategoryModalOpen, setAddCategoryModalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [categoryPending, setCategoryPending] = useState(false);
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<NoteCategory[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SavedWord[]>([]);
  const [selectedWord, setSelectedWord] = useState<SavedWord | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const searchRef = useRef(0);
  const addMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!addMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!addMenuRef.current?.contains(event.target as Node)) setAddMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setAddMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [addMenuOpen]);

  useEffect(() => {
    let active = true;
    void listNoteCategoriesAction().then((values) => {
      if (active) setCategories((current) => {
        const byId = new Map([...values, ...current].map((category) => [category.id, category]));
        return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      });
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  function includeCategory(category: NoteCategory) {
    setCategories((current) => [...current.filter((item) => item.id !== category.id), category]
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name || categoryPending) return;
    setCategoryPending(true);
    setCategoryError('');
    try {
      const result = await createNoteCategoryAction(name);
      if (!result.ok || !result.category) throw new Error('Create failed');
      includeCategory(result.category);
      setCategoryName('');
      setAddCategoryModalOpen(false);
    } catch {
      setCategoryError("Couldn't add this category. Please try again.");
    } finally {
      setCategoryPending(false);
    }
  }

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
  ].filter((item) => !removed.has(`${item.kind}-${item.note.id}`)
    && (!categoryFilter || (item.kind === 'grammar' && item.note.category_id === categoryFilter)))
    .sort((a, b) => b.note.created_at.localeCompare(a.note.created_at));

  function resetAttachment() {
    searchRef.current++;
    setQuery('');
    setMatches([]);
    setSelectedWord(null);
    setSearching(false);
  }

  function closeNoteModal() {
    setAddNoteModalOpen(false);
    setError('');
  }

  function closeCategoryModal() {
    setAddCategoryModalOpen(false);
    setCategoryError('');
  }

  async function add() {
    if (!noteHtmlToPlainText(text).trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = selectedWord
        ? await updateVocabNoteAction(selectedWord.id, text.trim())
        : await saveGrammarNoteAction(text, undefined, categoryId);
      if (!result.ok) throw new Error('Save failed');
      if (selectedWord) setRemoved((previous) => {
        const next = new Set(previous);
        next.delete(`word-${selectedWord.id}`);
        return next;
      });
      setText('');
      setCategoryId(null);
      resetAttachment();
      setAttachOpen(false);
      closeNoteModal();
      router.refresh();
    } catch {
      setError("Couldn't add this note. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[40px] leading-none font-black tracking-[0.04em]">
          Your <span className="text-accent">notes</span>.
        </h1>
        <span className="text-ink-3 font-mono text-[11px]">
          {count} {count === 1 ? 'note' : 'notes'} saved
        </span>
      </div>
      <div ref={addMenuRef} className="relative">
        <button type="button" aria-label="Add" aria-expanded={addMenuOpen} aria-haspopup="menu"
          onClick={() => setAddMenuOpen((current) => !current)}
          className={buttonClassName('primary', 'sm', 'h-10 w-10 !p-0 sm:w-auto sm:!px-4')}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10 3v14M3 10h14" /></svg>
          <span className="hidden sm:inline">New</span>
        </button>
        {addMenuOpen && <div className="border-line bg-panel absolute top-full right-0 z-30 mt-1 min-w-40 rounded-[14px] border-2 p-1.5 shadow-[3px_3px_0_var(--line)] animate-[fade-rise_160ms_ease-out]">
          <button type="button" className="hover:bg-soft min-h-11 w-full rounded-lg px-2.5 text-left"
            onClick={() => { setAddMenuOpen(false); setAddNoteModalOpen(true); }}>Add note</button>
          <button type="button" className="hover:bg-soft min-h-11 w-full rounded-lg px-2.5 text-left"
            onClick={() => { setAddMenuOpen(false); setAddCategoryModalOpen(true); }}>Add category</button>
        </div>}
      </div>
    </div>
    <Modal open={addNoteModalOpen} onClose={closeNoteModal} title="Add a note" size="lg">
      {addNoteModalOpen && <>
        {selectedWord ? <textarea aria-label="Add a note" value={text} maxLength={500} rows={4}
          onChange={(event) => setText(event.target.value)}
          placeholder="A grammar rule, a reminder, anything you want to keep…"
          className="border-line bg-panel text-ink w-full resize-y rounded-xl border-2 px-3 py-2.5 text-sm outline-none" />
          : <RichEditor label="Add a note" value={text} onChange={setText} minHeight="lg"
            placeholder="A grammar rule, a reminder, anything you want to keep…" />}
        {selectedWord ? <div className="flex items-center gap-2">
          <span className="text-ink-3 font-mono text-xs">attached to:</span>
          <Pill onClick={() => { setText(noteTextToHtml(text)); resetAttachment(); }} aria-label={`Remove attachment: ${selectedWord.lemma}`}>
            {selectedWord.lemma} ×
          </Pill>
        </div> : <>
          <Pill onClick={() => {
            if (attachOpen) resetAttachment();
            setAttachOpen(!attachOpen);
          }} aria-expanded={attachOpen} className="self-start">attach to a saved word (optional)</Pill>
          <div className="flex flex-col gap-1 text-sm">
            <span id="add-note-category-label">Category</span>
            <Select variant="panel" value={categoryId ?? ''} onValueChange={(value) => setCategoryId(value || null)}
              aria-labelledby="add-note-category-label"
              options={[{ value: '', label: 'No category' }, ...categories.map((category) => ({ value: category.id, label: category.name }))]} />
          </div>
          {attachOpen && <div className="flex flex-col gap-2">
            <label htmlFor="saved-word-search" className="text-ink-2 text-sm">Search saved words</label>
            <input id="saved-word-search" type="search" value={query} maxLength={50}
              onChange={(event) => {
                searchRef.current++;
                setQuery(event.target.value);
                setMatches([]);
                setSearching(Boolean(event.target.value.trim()));
              }}
              placeholder={`Type a ${activeLanguage.name} word…`}
              className="border-line bg-panel rounded-xl border-2 px-3 py-2" />
            {searching && <span className="text-ink-3 font-mono text-xs" role="status">Searching…</span>}
            {matches.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Saved word matches">
              {matches.map((word) => <Pill key={word.id} onClick={() => {
                searchRef.current++;
                const plain = new DOMParser().parseFromString(text, 'text/html').body.textContent ?? '';
                setText(plain);
                setSelectedWord(word);
                setMatches([]);
                setSearching(false);
              }}>{word.lemma}</Pill>)}
            </div>}
          </div>}
        </>}
        {error && <p role="alert" className="text-ink-2 text-sm">{error}</p>}
        <Button variant="primary" size="sm" type="button" disabled={saving || !noteHtmlToPlainText(text).trim()} onClick={() => void add()}
          className="self-start">{saving ? 'Adding…' : 'Add note'}</Button>
      </>}
    </Modal>
    <Modal open={addCategoryModalOpen} onClose={closeCategoryModal} title="Add a category">
      {addCategoryModalOpen && <form onSubmit={(event) => void addCategory(event)} className="flex flex-col gap-3">
        <label htmlFor="category-name" className="text-ink-2 text-sm">Category name</label>
        <input id="category-name" value={categoryName} maxLength={40} placeholder="Category name"
          onChange={(event) => setCategoryName(event.target.value)}
          className="border-line bg-panel text-ink w-full rounded-xl border-2 px-3 py-2.5 text-sm outline-none" />
        {categoryError && <p role="alert" className="text-ink-2 text-sm">{categoryError}</p>}
        <div className="mt-2 flex justify-end gap-2.5">
          <Button variant="secondary" size="sm" type="button" onClick={closeCategoryModal}>Cancel</Button>
          <Button variant="primary" size="sm" type="submit" disabled={categoryPending || !categoryName.trim()}>{categoryPending ? 'Adding…' : 'Add'}</Button>
        </div>
      </form>}
    </Modal>
    <div className="flex flex-col gap-3">
      <div role="group" className="flex flex-wrap items-center gap-2" aria-label="Filter notes by category">
        <button type="button" className={pillClassName({ active: categoryFilter === null })} aria-pressed={categoryFilter === null}
          onClick={() => setCategoryFilter(null)}>All</button>
        {categories.map((category) => <button key={category.id} type="button"
          className={pillClassName({ active: categoryFilter === category.id })} aria-pressed={categoryFilter === category.id}
          onClick={() => setCategoryFilter(category.id)}>{category.name}</button>)}
      </div>
      <p className="text-ink-3 font-mono text-xs" role="status">
        {categoryFilter ? `${items.length} ${items.length === 1 ? 'note' : 'notes'} in ${categories.find((category) => category.id === categoryFilter)?.name ?? 'category'}`
          : `${items.length} ${items.length === 1 ? 'note' : 'notes'}`}
      </p>
      {items.map((item) => <NoteRow key={`${item.kind}-${item.note.id}-${item.note.note}`} item={item}
        categories={categories}
        onChanged={() => router.refresh()}
        onRemoved={() => {
          setRemoved((previous) => new Set(previous).add(`${item.kind}-${item.note.id}`));
          router.refresh();
        }} />)}
      {items.length === 0 && <p className="text-ink-3 text-sm">No notes saved yet. Save one from a chat correction, or use the + button above.</p>}
    </div>
  </>;
}
