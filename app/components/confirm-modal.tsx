'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' paints the confirm button orange, for destructive actions;
   * 'default' is the plain dark button. */
  tone?: 'danger' | 'default';
};

/** Resolves true if the user confirmed, false if they cancelled, pressed Esc
 * or clicked outside. Never rejects. */
type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * The one confirmation dialog for the whole app, mounted once in the root
 * layout and reached through useConfirm():
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: 'Delete this chat?', tone: 'danger' }))) return;
 *
 * A promise rather than a controlled <Modal open onConfirm> per call site, so
 * a call site that wants a confirmation writes one `if`, not a piece of state,
 * a handler pair and a JSX block -- and there is exactly one dialog's markup
 * and styling to keep consistent, instead of one per delete button.
 *
 * Built on the native <dialog> element: showModal() supplies the top-layer
 * rendering (so no z-index fights with the header's menus), a focus trap,
 * Esc-to-cancel and an inert page behind it. Those are the parts of a modal
 * that are easy to get subtly wrong by hand.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  // `options` is kept after the dialog closes and only `open` flips: clearing
  // it would blank the title and buttons for the frame before close() lands.
  const [options, setOptions] = useState<ConfirmOptions>({ title: '' });
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const confirm = useCallback<Confirm>((next) => {
    // A second request while one is showing supersedes it. Settling the first
    // as "no" means its caller isn't left awaiting a promise nobody can
    // resolve any more.
    resolveRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setOptions(next);
      setOpen(true);
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    setOpen(false);
  }, []);

  // Syncing React state to the imperative <dialog> API -- the legitimate use
  // of an effect: the dialog is an external system with methods, not props.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const danger = options.tone === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={options.description ? descriptionId : undefined}
        // Esc fires `cancel`. Prevented so the browser doesn't close the
        // dialog behind React's back -- state stays the single source of
        // truth and the pending promise always gets settled.
        onCancel={(e) => {
          e.preventDefault();
          settle(false);
        }}
        // The dialog has no padding of its own (the inner div carries it), so
        // a click whose target is the <dialog> itself can only have landed on
        // the ::backdrop. That's the click-outside-to-cancel gesture.
        onClick={(e) => {
          if (e.target === e.currentTarget) settle(false);
        }}
        className="border-line bg-panel text-ink m-auto w-[min(92vw,400px)] rounded-[18px] border-2 p-0 shadow-[4px_4px_0_var(--line)] backdrop:bg-black/45"
      >
        <div className="flex flex-col gap-3 p-6">
          <h2 id={titleId} className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
            {options.title}
          </h2>

          {options.description && (
            <div id={descriptionId} className="text-ink-2 text-[14px] leading-relaxed">
              {options.description}
            </div>
          )}

          {/* Cancel comes first in the DOM on purpose: showModal() focuses the
              first focusable element, so a destructive dialog opens with the
              safe choice focused -- a stray Enter cancels rather than deletes. */}
          <div className="mt-2 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => settle(false)}
              className="border-line text-ink hover:bg-soft cursor-pointer rounded-full border-2 px-4 py-2 text-[14px] font-bold transition-colors duration-150"
            >
              {options.cancelLabel ?? 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => settle(true)}
              className={`border-line cursor-pointer rounded-full border-2 px-4 py-2 text-[14px] font-bold transition-transform duration-150 hover:translate-x-px hover:translate-y-px ${
                danger ? 'bg-orange text-on-bright' : 'bg-ink text-paper'
              }`}
            >
              {options.confirmLabel ?? 'Confirm'}
            </button>
          </div>
        </div>
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
