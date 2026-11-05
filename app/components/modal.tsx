'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Modal({ open, onClose, title, children, size = 'md' }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'md' | 'lg';
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className={`border-line bg-panel text-ink m-auto max-h-[92dvh] overflow-y-auto rounded-[18px] border-2 p-0 shadow-[4px_4px_0_var(--line)] backdrop:bg-black/45 ${size === 'lg' ? 'w-[min(94vw,760px)]' : 'w-[min(92vw,560px)]'}`}
    >
      <div className="flex flex-col gap-3 p-6">
        <h2 id={titleId} className="font-display text-[28px] leading-none font-black tracking-[0.02em]">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
