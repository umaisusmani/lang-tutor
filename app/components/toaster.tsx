'use client';

import { toast, Toaster } from 'sonner';

/**
 * Surfaces a failure the user would otherwise never learn about.
 *
 * The one entry point for error toasts, so the rest of the app doesn't import
 * the toast library directly -- swapping it later is a change in this file.
 *
 * Pass an `id` to make a toast idempotent: a second call with the same id
 * replaces the first instead of stacking. That matters when one root cause
 * trips several failure paths at once (a dead database makes the message save,
 * the reply save and the vocab save all fail in the same second) -- the
 * learner should see one "couldn't save" notice, not three.
 */
export function notifyError(message: string, id?: string) {
  toast.error(message, id ? { id } : undefined);
}

/**
 * The single toast host, mounted once in the root layout.
 *
 * Runs sonner in `unstyled` mode and styles it from the app's own design
 * tokens rather than sonner's `theme` prop. The tokens are CSS variables that
 * already flip with the theme (both the system preference and the manual
 * data-theme toggle), so toasts follow the theme for free -- sonner's own
 * theme prop can only follow the system setting, and would disagree with the
 * manual toggle.
 *
 * The base `toast` class carries only layout and border; the background lives
 * on the per-type classes. Two utilities that both set `background` on one
 * element are resolved by stylesheet order, not class order, so putting a
 * base background here and an error one on `error` would be a coin flip.
 */
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      duration={5000}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'border-line flex w-full items-center gap-3 rounded-[14px] border-2 px-4 py-3 font-sans text-[14px] font-medium shadow-[3px_3px_0_var(--line)]',
          default: 'bg-panel text-ink',
          error: 'bg-orange text-on-bright',
          title: 'font-bold',
          description: 'text-[13px] opacity-80',
        },
      }}
    />
  );
}
