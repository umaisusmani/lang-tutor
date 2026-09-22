import Link from 'next/link';

/**
 * Logo tile + wordmark lockup, shared by the chat, login and vocab headers.
 *
 * It links to a fresh chat (`/?c=new`, same target as "+ new chat") everywhere
 * it appears: the header dropped its separate "chat" nav link, so the logo is
 * the way back from /vocab and /login. Plain `/` would reopen the learner's
 * latest conversation instead, which is what the chats menu is for.
 *
 * The wordmark's line box is pinned to the tile's height (34px), so the two
 * read as one unit rather than a small logo next to small text. That's also
 * why there's no tagline stacked under the name any more: a second line would
 * push the text block taller than the tile again.
 */
export function Brand() {
  return (
    <Link href="/?c=new" className="flex items-center gap-2.5 no-underline">
      <div className="border-line bg-yellow text-on-bright flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border-2 text-base font-extrabold">
        s
      </div>
      <span className="text-ink text-[30px] leading-[34px] font-extrabold tracking-[-0.03em] sm:text-[34px]">
        starprache
      </span>
    </Link>
  );
}
