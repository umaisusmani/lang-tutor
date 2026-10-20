import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/app/components/page-header';
import { VocabBrowser } from '@/app/vocab/vocab-browser';
import { getReviewQueue } from '@/lib/services/card.service';
import { listConversations } from '@/lib/services/conversation.service';
import { getCurrentUser, resolveCefrLevel } from '@/lib/services/profile.service';
import { listVocab } from '@/lib/services/vocab.service';

export default async function VocabPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const entries = await listVocab(user.id);
  const conversations = await listConversations(user.id);
  const dueCards = await getReviewQueue(user.id);
  const dueCount = dueCards.length;
  const dueWordIds = dueCards.flatMap((card) => card.vocab_entry_id ? [card.vocab_entry_id] : []);
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = await resolveCefrLevel(user.id, levelCookie);

  const heading = (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-[40px] leading-none font-black tracking-[0.04em]">
        Vokabelliste
      </h1>
      <span className="text-ink-3 font-mono text-[11px]">
        {entries.length} {entries.length === 1 ? 'word' : 'words'} saved
      </span>
    </div>
  );

  return (
    <div className="bg-paper text-ink flex min-h-dvh flex-col items-center px-[18px] pb-6">
      <PageHeader
        initialLevel={level}
        userEmail={user.email ?? null}
        userName={user.user_metadata?.full_name ?? user.email ?? null}
        conversations={conversations}
        activePage="vocab"
        dueCount={dueCount}
      />
      <div className="flex w-full max-w-[860px] flex-1 flex-col">
        <main className="flex flex-1 flex-col gap-[22px] pt-6 pb-7">
          <VocabBrowser entries={entries} dueCount={dueCount} dueWordIds={dueWordIds} heading={heading} />
        </main>
      </div>
    </div>
  );
}
