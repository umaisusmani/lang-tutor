import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/app/components/page-header';
import { VocabGrid } from '@/app/vocab/vocab-grid';
import { getDueCount } from '@/lib/services/card.service';
import { listConversations } from '@/lib/services/conversation.service';
import { getCurrentUser, resolveCefrLevel } from '@/lib/services/profile.service';
import { listVocab } from '@/lib/services/vocab.service';

export default async function VocabPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const entries = await listVocab(user.id);
  const conversations = await listConversations(user.id);
  const dueCount = await getDueCount(user.id);
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = await resolveCefrLevel(user.id, levelCookie);

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
        <main className="flex flex-1 flex-col gap-5 py-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-[30px] leading-[1.05] font-extrabold tracking-[-0.02em]">
              Vokabelliste
            </h1>
            <span className="text-ink-3 font-mono text-[11px]">
              {entries.length} {entries.length === 1 ? 'word' : 'words'} saved
            </span>
          </div>

          {entries.length === 0 ? (
            <p className="text-ink-2 text-[15px] leading-relaxed">
              Nothing saved yet. Words you save from the chat will show up here.
            </p>
          ) : (
            <VocabGrid entries={entries} />
          )}
        </main>
      </div>
    </div>
  );
}
