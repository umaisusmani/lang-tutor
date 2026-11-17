import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Tiptap/ProseMirror in jsdom is slow under a parallel full run; the default 1s is too tight.
configure({ asyncUtilTimeout: 4000 });

// ProseMirror measures the DOM; jsdom has no layout, so give it empty geometry.
if (typeof document !== 'undefined') {
  const rects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  const box = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getClientRects ||= rects;
  Range.prototype.getBoundingClientRect ||= box;
  Element.prototype.getClientRects ||= rects;
  document.elementFromPoint ||= () => null;
}
