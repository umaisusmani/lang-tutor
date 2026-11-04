import { createElement, type ReactNode } from 'react';

type Frame = { marker: '*' | '**' | ''; children: ReactNode[] };

/** Render only the two inline markers supported by learner notes. */
export function renderInlineFormat(text: string): ReactNode {
  const frames: Frame[] = [{ marker: '', children: [] }];
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '*') {
      const next = text.indexOf('*', index);
      frames[frames.length - 1].children.push(text.slice(index, next < 0 ? text.length : next));
      index = next < 0 ? text.length : next;
      continue;
    }

    let run = 0;
    while (text[index + run] === '*') run++;
    while (run > 0) {
      const current = frames[frames.length - 1];
      if (current.marker && current.marker.length <= run) {
        frames.pop();
        frames[frames.length - 1].children.push(createElement(
          current.marker === '**' ? 'strong' : 'em',
          { key: index + run },
          ...current.children,
        ));
        run -= current.marker.length;
      } else {
        const marker = run >= 2 ? '**' : '*';
        frames.push({ marker, children: [] });
        run -= marker.length;
      }
    }
    while (text[index] === '*') index++;
  }

  while (frames.length > 1) {
    const unfinished = frames.pop()!;
    frames[frames.length - 1].children.push(unfinished.marker, ...unfinished.children);
  }
  return frames[0].children;
}
