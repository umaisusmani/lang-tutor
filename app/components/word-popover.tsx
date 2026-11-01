'use client';

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  anchorRef: RefObject<HTMLElement | null>;
  popoverRef?: RefObject<HTMLDivElement | null>;
  preferAbove?: boolean;
  className: string;
  role?: string;
  'aria-label'?: string;
  children: ReactNode;
};

export function WordPopover({ anchorRef, popoverRef, preferAbove = false, className, role, children, ...aria }: Props) {
  const ownRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    setContainer(anchorRef.current?.closest('dialog') ?? document.body);
  }, [anchorRef]);

  useLayoutEffect(() => {
    const element = ownRef.current;
    if (!element || !(container instanceof HTMLDialogElement) || !container.open || !element.showPopover) return;
    // The top layer keeps the menu above clipped or transformed dialog content.
    element.popover = 'manual';
    try {
      element.showPopover();
    } catch {
      element.removeAttribute('popover');
      return;
    }
    return () => { if (element.matches(':popover-open')) element.hidePopover(); };
  }, [container]);

  useLayoutEffect(() => {
    const element = ownRef.current;
    if (!element) return;

    function reposition() {
      const anchor = anchorRef.current;
      if (!anchor || !anchor.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      const width = element!.getBoundingClientRect().width;
      const height = element!.getBoundingClientRect().height;
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const placeAbove = preferAbove ? above >= height + 7 || above > below : below < height + 7 && above > below;
      const next = {
        left: Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8)),
        top: Math.max(8, placeAbove ? rect.top - height - 7 : rect.bottom + 7),
      };
      setPosition((current) => current?.left === next.left && current.top === next.top ? current : next);
    }

    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  });

  if (!container) return null;

  return createPortal(
    <div
      ref={(element) => {
        ownRef.current = element;
        if (popoverRef) popoverRef.current = element;
      }}
      role={role}
      {...aria}
      className={className}
      style={{ position: 'fixed', inset: 'auto', margin: 0, left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    container,
  );
}
