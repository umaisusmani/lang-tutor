import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { RemoveWordButton } from '@/app/vocab/remove-word-button';
import { VocabPageHeader } from '@/app/vocab/VocabPageHeader';
import { listConversations } from '@/lib/services/conversation.service';
import { getCurrentUser, resolveCefrLevel } from '@/lib/services/profile.service';
import { listVocab } from '@/lib/services/vocab.service';

export default async function VocabPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const entries = await listVocab(user.id);
  const conversations = await listConversations(user.id);
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = await resolveCefrLevel(user.id, levelCookie);

  return (
    <div className="bg-paper text-ink flex min-h-dvh justify-center px-[18px] pb-6">
      <div className="flex min-h-dvh w-full max-w-[860px] flex-col">
        <VocabPageHeader
          initialLevel={level}
          userEmail={user.email ?? null}
          userName={user.user_metadata?.full_name ?? user.email ?? null}
          conversations={conversations}
        />

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
            <div className="border-line bg-panel flex flex-col rounded-[14px] border-2">
              {entries.map((entry, i) => (
                <div
                  key={entry.id}
                  className={`flex items-center gap-3.5 px-4 py-3.5 ${
                    i > 0 ? 'border-hair border-t' : ''
                  }`}
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[17px] font-semibold">{entry.lemma}</span>
                    {entry.translation && (
                      <span className="text-ink-2 font-mono text-[11px]">
                        {entry.translation}
                      </span>
                    )}
                  </div>
                  <span className="text-ink-3 ml-auto font-mono text-[10px]">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                  <RemoveWordButton entryId={entry.id} lemma={entry.lemma} />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
