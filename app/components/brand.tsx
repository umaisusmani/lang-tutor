import Link from 'next/link';
import { activeLanguage } from '@/lib/languages';

/**
 * Logo tile + wordmark lockup, shared by the chat, login and vocab headers.
 *
 * It links to a fresh chat (`/?c=new`, same target as "+ new chat") everywhere
 * it appears: it offers a fresh chat from /vocab and /login. Plain `/` would
 * reopen the learner's latest conversation, which is what the chats menu is for.
 *
 * Wordmark and tagline stack beside the tile, set in the display and mono
 * voices respectively.
 */
export function Brand({ compactOnMobile = false }: { compactOnMobile?: boolean }) {
  return (
    <Link href="/?c=new" className="flex items-center gap-2 no-underline">
      <div className="border-line bg-yellow text-on-bright font-display flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border-2 text-xl tracking-[0.04em]">
        S
      </div>
      <div className={`flex flex-col ${compactOnMobile ? 'max-[379px]:hidden' : ''}`}>
        <span className="font-display text-ink text-2xl leading-[1.1] tracking-[0.04em]">
          {activeLanguage.appName}
        </span>
      </div>
    </Link>
  );
}
