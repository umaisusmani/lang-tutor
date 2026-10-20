import Link from 'next/link';

/**
 * Logo tile + wordmark lockup, shared by the chat, login and vocab headers.
 *
 * It links to a fresh chat (`/?c=new`, same target as "+ new chat") everywhere
 * it appears: the header dropped its separate "chat" nav link, so the logo is
 * the way back from /vocab and /login. Plain `/` would reopen the learner's
 * latest conversation instead, which is what the chats menu is for.
 *
 * Wordmark and tagline stack beside the tile, set in the display and mono
 * voices respectively.
 */
export function Brand() {
  return (
    <Link href="/?c=new" className="flex items-center gap-2 no-underline">
      <div className="border-line bg-yellow text-on-bright font-display flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border-2 text-xl tracking-[0.04em]">
        S
      </div>
      <div className="flex flex-col">
        <span className="font-display text-ink text-2xl leading-[1.1] tracking-[0.04em]">
          Starvogel
        </span>
        <span className="text-ink-3 font-mono text-[10px]">german practice</span>
      </div>
    </Link>
  );
}
