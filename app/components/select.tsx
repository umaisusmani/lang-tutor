'use client';

import { useEffect, useId, useRef, useState } from 'react';

type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  variant: 'pill' | 'panel';
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  className?: string;
  selectClassName?: string;
};

const styles = {
  pill: {
    wrapper: 'relative inline-flex',
    trigger: 'border-line bg-yellow text-on-bright hover:brightness-105 flex min-h-9 items-center justify-between gap-2 rounded-full border-2 px-3 py-1 font-display text-[13px] font-bold tracking-[0.04em] cursor-pointer',
    list: 'right-0 min-w-max',
  },
  panel: {
    wrapper: 'relative w-full',
    trigger: 'border-line bg-panel text-ink hover:bg-soft flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left font-mono text-xs cursor-pointer',
    list: 'right-0 left-0',
  },
};

export function Select({ value, onValueChange, options, variant, id, className, selectClassName, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const triggerId = id ?? `select-${generatedId}`;
  const listId = `${triggerId}-listbox`;
  const valueId = `${triggerId}-value`;
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  const style = styles[variant];

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function openAt(index: number) {
    if (!options.length) return;
    setActiveIndex(Math.max(0, Math.min(index, options.length - 1)));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onValueChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab' && open) {
      setOpen(false);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (open) setActiveIndex((index) => (index + step + options.length) % options.length);
      else openAt(selectedIndex < 0 ? 0 : (selectedIndex + step + options.length) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      openAt(event.key === 'Home' ? 0 : options.length - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key.length === 1 && /\S/.test(event.key) && open) {
      const letter = event.key.toLocaleLowerCase();
      const next = options.findIndex((option, index) => index > activeIndex && option.label.toLocaleLowerCase().startsWith(letter));
      const first = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(letter));
      if (next >= 0 || first >= 0) {
        event.preventDefault();
        setActiveIndex(next >= 0 ? next : first);
      }
    }
  }

  return (
    <div ref={wrapperRef} className={[style.wrapper, className].filter(Boolean).join(' ')}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel ? `${ariaLabel}: ${selected?.label ?? ''}` : undefined}
        aria-labelledby={ariaLabelledBy ? `${ariaLabelledBy} ${valueId}` : undefined}
        onClick={() => open ? setOpen(false) : openAt(selectedIndex < 0 ? 0 : selectedIndex)}
        onKeyDown={onKeyDown}
        className={[style.trigger, selectClassName].filter(Boolean).join(' ')}
      >
        <span id={valueId}>{selected?.label ?? ''}</span><span aria-hidden="true" className="text-[9px] opacity-60">▾</span>
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : triggerId)}
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-option-${activeIndex}`}
          onKeyDown={onKeyDown}
          className={`border-line bg-panel absolute top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-[14px] border-2 p-1.5 shadow-[3px_3px_0_var(--line)] animate-[fade-rise_160ms_ease-out] ${style.list}`}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => choose(index)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 font-mono text-xs ${option.value === value ? 'bg-yellow text-on-bright' : index === activeIndex ? 'bg-soft text-ink' : 'text-ink hover:bg-soft'}`}
            >
              {option.label}
              {option.value === value && <span aria-hidden="true">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
