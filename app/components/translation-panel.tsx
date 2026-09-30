'use client';

/**
 * The button that opens a TranslationPanel.
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
      title={pending ? 'Translating…' : undefined}
      className={`border-line text-ink-2 flex-none rounded-lg border-2 px-2 py-0.5 font-mono text-[11px] transition-colors duration-150 ${
        pending
          ? 'animate-pulse cursor-default opacity-60'
          : 'hover:bg-yellow hover:text-on-bright cursor-pointer active:translate-x-px active:translate-y-px'
      } ${className ?? ''}`}
    >
      {open && !pending ? 'hide' : 'translate'}
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
 * The explanation is plain text with "•" bullets (see
 * buildGrammarExplanationPrompt), hence whitespace-pre-wrap and nothing more.
 */
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
        <div className="border-hair bg-soft flex flex-col gap-3 rounded-xl border-2 px-4 py-3">
          {translation ? (
            <p className="text-ink text-[15px] leading-relaxed italic">{translation}</p>
          ) : (
            <p className="text-ink-3 font-mono text-[11px]">
              No translation was saved for this older message.
            </p>
          )}

          {explanation ? (
            <div className="border-hair flex flex-col gap-1 border-t-2 pt-3">
              <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">
                grammar
              </span>
              <p className="text-ink-2 font-mono text-[12.5px] leading-[1.6] whitespace-pre-wrap">
                {explanation}
                {explaining && (
                  <span className="bg-accent ml-[3px] inline-block h-[12px] w-[6px] animate-[blink_1s_step-end_infinite] align-[-1px]" />
                )}
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={onExplain}
              disabled={explaining}
              className="border-line text-ink-2 hover:bg-yellow hover:text-on-bright self-start cursor-pointer rounded-lg border-2 px-2.5 py-1 font-mono text-[11px] transition-colors duration-150 active:translate-x-px active:translate-y-px disabled:cursor-default disabled:opacity-60"
            >
              {explaining ? 'explaining…' : 'explain grammar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
