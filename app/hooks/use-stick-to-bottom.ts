'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const BOTTOM_THRESHOLD = 80;

export function useStickToBottom(messageCount: number) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const smoothScrollRef = useRef(false);
  const smoothScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousMessageCountRef = useRef(messageCount);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  const clearSmoothScroll = useCallback(() => {
    smoothScrollRef.current = false;
    if (smoothScrollTimeoutRef.current !== null) clearTimeout(smoothScrollTimeoutRef.current);
    smoothScrollTimeoutRef.current = null;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'instant') => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    clearSmoothScroll();
    atBottomRef.current = true;
    setHasNewMessage(false);
    if (behavior === 'smooth') {
      smoothScrollRef.current = true;
      smoothScrollTimeoutRef.current = setTimeout(clearSmoothScroll, 800);
      scroller.scrollTo({ top: scroller.scrollHeight, behavior });
    } else scroller.scrollTop = scroller.scrollHeight;
  }, [clearSmoothScroll]);

  function onScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const atBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= BOTTOM_THRESHOLD;
    if (smoothScrollRef.current && !atBottom) return;
    clearSmoothScroll();
    atBottomRef.current = atBottom;
    if (atBottomRef.current) setHasNewMessage(false);
  }

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    scrollToBottom();
    scroller.addEventListener('wheel', clearSmoothScroll, { passive: true });
    scroller.addEventListener('touchstart', clearSmoothScroll, { passive: true });
    scroller.addEventListener('keydown', clearSmoothScroll);

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (atBottomRef.current) scrollToBottom();
    });
    observer?.observe(content);
    observer?.observe(scroller);
    return () => {
      observer?.disconnect();
      scroller.removeEventListener('wheel', clearSmoothScroll);
      scroller.removeEventListener('touchstart', clearSmoothScroll);
      scroller.removeEventListener('keydown', clearSmoothScroll);
      clearSmoothScroll();
    };
  }, [clearSmoothScroll, scrollToBottom]);

  useLayoutEffect(() => {
    if (messageCount > previousMessageCountRef.current && !atBottomRef.current) {
      setHasNewMessage(true);
    }
    previousMessageCountRef.current = messageCount;
  }, [messageCount]);

  return { scrollerRef, contentRef, hasNewMessage, onScroll, scrollToBottom };
}
