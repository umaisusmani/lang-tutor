'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
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
      className="border-line bg-panel text-ink m-auto w-[min(92vw,400px)] rounded-[18px] border-2 p-0 shadow-[4px_4px_0_var(--line)] backdrop:bg-black/45"
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
