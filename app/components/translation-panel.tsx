'use client';

/**
 * The button that opens a TranslationPanel. Labeled "explain" rather than
 * "translate" -- the translation is the first thing it reveals, not the only
 * thing; "explain grammar" inside the panel goes a level deeper from there.
 *
 * `pending` is the placeholder QA asked for: while a reply streams, its
 * translation doesn't exist yet (it's fetched once the reply is complete), so
 * the button sits in its final spot, disabled and pulsing, and turns
 * clickable in place when the translation lands. The old version was a tiny
 * "gloss …" line under the reply that was easy to miss and then vanished.
 */
export function TranslateButton({
  open,
  pending,
  onToggle,
  className,
}: {
  open: boolean;
  pending?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-expanded={pending ? undefined : open}
      title={pending ? 'Explaining…' : undefined}
      className={`group flex min-h-11 min-w-11 flex-none items-center justify-center ${
        pending ? 'cursor-default' : 'cursor-pointer'
      } ${className ?? ''}`}
    >
      <span className={`border-line text-ink-2 rounded-full border-2 px-3 py-1 font-mono text-[11px] leading-none transition-colors duration-150 ${
        pending
          ? 'animate-pulse opacity-60'
          : 'group-hover:bg-yellow group-hover:text-on-bright group-active:translate-x-px group-active:translate-y-px'
      }`}>
        {open && !pending ? 'hide' : 'explain'}
      </span>
    </button>
  );
}

/**
 * Whole-sentence translation, plus the "explain grammar" button and its
 * answer. Replaced the word-by-word panel: per-word meanings moved into the
 * words themselves (GlossedText), leaving this panel for the sentence as a
 * whole.
 *
 * Always mounted, collapsed by CSS rather than unmounted -- that's what lets
 * the open/close actually transition. `inert` keeps a collapsed panel's
 * button out of the tab order and the accessibility tree while it's still
 * rendered.
 *
 * Explanations stream as bullet lines with optional **bold** phrases. Render
 * those small formatting cues without treating model output as HTML.
 */
function ExplanationText({ text, explaining }: { text: string; explaining: boolean }) {
  const blocks: Array<{ type: 'list'; items: string[] } | { type: 'paragraph'; text: string }> = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const bullet = trimmed.match(/^(?:•|[-*]|\d+\.)\s+(.+)$/);
    if (bullet) {
      const previous = blocks[blocks.length - 1];
      if (previous?.type === 'list') previous.items.push(bullet[1]);
      else blocks.push({ type: 'list', items: [bullet[1]] });
    } else {
      blocks.push({ type: 'paragraph', text: trimmed });
    }
  }

  function inline(value: string, showCursor: boolean) {
    return (
      <>
        {value.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
          part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
            <strong key={index} className="font-semibold text-ink">
              {part.slice(2, -2)}
            </strong>
          ) : (
            part.replace(/\*\*/g, '')
          ),
        )}
        {showCursor && (
          <span className="bg-accent ml-[3px] inline-block h-[12px] w-[6px] animate-[blink_1s_step-end_infinite] align-[-1px]" />
        )}
      </>
    );
  }

  return (
    <div className="text-explain-ink flex flex-col gap-1.5 font-mono text-[12.5px] leading-[1.6]">
      {blocks.map((block, index) =>
        block.type === 'list' ? (
          <ul key={index} className="list-disc space-y-1.5 pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                {inline(item, explaining && index === blocks.length - 1 && itemIndex === block.items.length - 1)}
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>{inline(block.text, explaining && index === blocks.length - 1)}</p>
        ),
      )}
    </div>
  );
}

export function TranslationPanel({
  open,
  translation,
  explanation,
  explaining,
  onExplain,
}: {
  open: boolean;
  translation: string | null;
  explanation: string | undefined;
  explaining: boolean;
  onExplain: () => void;
}) {
  return (
    <div className="gloss-panel" data-open={open} inert={!open}>
      <div>
        <div className="border-hair bg-soft flex flex-col gap-2 rounded-xl border-2 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-3">
            {translation ? (
              <p className="text-ink-2 font-mono text-[11px] leading-relaxed">{translation}</p>
            ) : (
              <p className="text-ink-3 font-mono text-[11px]">
                No translation was saved for this older message.
              </p>
            )}

            {!explanation && (
              <button
                type="button"
                onClick={onExplain}
                disabled={explaining}
                className="text-ink-3 hover:text-ink flex-none cursor-pointer p-0 font-mono text-[10px] whitespace-nowrap transition-colors duration-150 disabled:cursor-default disabled:opacity-60"
              >
                {explaining ? 'explaining…' : 'explain grammar ↓'}
              </button>
            )}
          </div>

          {explanation && (
            <div className="border-hair flex flex-col gap-1 border-t-2 pt-2">
              <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">
                grammar
              </span>
              <ExplanationText text={explanation} explaining={explaining} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
