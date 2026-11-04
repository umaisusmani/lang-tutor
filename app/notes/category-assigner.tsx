'use client';

import { useEffect, useRef, useState } from 'react';

import { createNoteCategoryAction } from '@/app/vocab/actions';
import type { NoteCategory } from '@/lib/types/db';

export function CategoryAssigner({ categories, selectedId, onSelect, onCreated }: {
  categories: NoteCategory[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreated: (category: NoteCategory) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = categories.find((category) => category.id === selectedId);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || pending) return;
    setPending(true);
    setError('');
    try {
      const result = await createNoteCategoryAction(name);
      if (!result.ok || !result.category) throw new Error('Create failed');
      onCreated(result.category);
      onSelect(result.category.id);
      setName('');
      setOpen(false);
    } catch {
      setError("Couldn't add this category. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <div ref={rootRef} className="relative flex items-center gap-2 self-start">
    <button type="button" aria-label="Add or choose a category" aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
      className="text-ink-2 hover:bg-soft hover:text-ink rounded-md p-1.5">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 3v14M3 10h14" /></svg>
    </button>
    {selected && <span className="bg-soft text-ink-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs">
      {selected.name}
      <button type="button" aria-label={`Remove category ${selected.name}`} onClick={() => onSelect(null)} className="px-0.5">×</button>
    </span>}
    {open && <div className="border-line bg-panel absolute top-full left-0 z-30 mt-1 min-w-48 rounded-[14px] border-2 p-1.5 shadow-[3px_3px_0_var(--line)] animate-[fade-rise_160ms_ease-out]">
      <div className="max-h-48 overflow-auto">
        {categories.map((category) => <button key={category.id} type="button"
          className={`min-h-11 w-full rounded-lg px-2.5 text-left text-sm ${selectedId === category.id ? 'bg-yellow text-on-bright' : 'hover:bg-soft'}`}
          onClick={() => { onSelect(category.id); setOpen(false); }}>{category.name}</button>)}
      </div>
      <div className="border-hair my-1 border-t" />
      <form onSubmit={(event) => void create(event)} className="flex gap-1">
        <input aria-label="New category name" value={name} maxLength={40} onChange={(event) => setName(event.target.value)}
          placeholder="New category" className="border-hair bg-panel min-w-0 flex-1 rounded-md border px-2 py-1 text-sm outline-none" />
        <button type="submit" disabled={pending || !name.trim()} className="text-ink-2 hover:bg-soft hover:text-ink rounded-md px-2 text-sm disabled:opacity-50">Add</button>
      </form>
      {error && <p role="alert" className="text-ink-2 px-2 py-1 text-xs">{error}</p>}
    </div>}
  </div>;
}
