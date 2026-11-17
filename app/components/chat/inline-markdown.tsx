import type { ReactNode } from 'react';

/**
 * Renders the light formatting the ask model uses (**bold**, *italic*, and
 * bullet lines) as React nodes. Never touches HTML, so model output can't
 * inject markup. Unterminated markers (mid-stream) stay as plain text.
 */
const INLINE = /(\*\*[^*\n]+?\*\*|\*[^*\s][^*\n]*?\*)/g;

function inline(value: string): ReactNode[] {
  return value.split(INLINE).map((part, index) => {
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

type Block = { type: 'list'; items: string[] } | { type: 'paragraph'; text: string };

export function InlineMarkdown({ text }: { text: string }) {
  const blocks: Block[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = trimmed.match(/^(?:•|-|\*)\s+(.+)$/);
    if (bullet) {
      const previous = blocks[blocks.length - 1];
      if (previous?.type === 'list') previous.items.push(bullet[1]);
      else blocks.push({ type: 'list', items: [bullet[1]] });
    } else {
      blocks.push({ type: 'paragraph', text: trimmed });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block, index) =>
        block.type === 'list' ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}
          </ul>
        ) : (
          <p key={index}>{inline(block.text)}</p>
        ),
      )}
    </div>
  );
}
