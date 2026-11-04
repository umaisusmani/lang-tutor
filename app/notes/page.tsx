import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/app/components/page-header';
import { NotesBrowser } from '@/app/notes/notes-browser';
import { getReviewQueue } from '@/lib/services/card.service';
import { listConversations } from '@/lib/services/conversation.service';
import { listGrammarNotes } from '@/lib/services/grammar-note.service';
import { getCurrentUser, resolveCefrLevel } from '@/lib/services/profile.service';
import { getQuotaStatus } from '@/lib/services/session.service';
import { listVocab } from '@/lib/services/vocab.service';

export default async function NotesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const grammarNotes = await listGrammarNotes(user.id);
  // Keep all saved words for Translate, including those without a note.
  const savedWords = await listVocab(user.id);
  const wordNotes = savedWords.filter((entry) => entry.note?.trim());
  const conversations = await listConversations(user.id);
  const dueCount = (await getReviewQueue(user.id)).length;
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = await resolveCefrLevel(user.id, levelCookie);
  const quota = await getQuotaStatus(user.id);
  const count = grammarNotes.length + wordNotes.length;

  const heading = (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-[40px] leading-none font-black tracking-[0.04em]">
        Your <span className="text-accent">notes</span>.
      </h1>
      <span className="text-ink-3 font-mono text-[11px]">
        {count} {count === 1 ? 'note' : 'notes'} saved
      </span>
    </div>
  );

  return (
    <div className="bg-paper bg-dotted text-ink flex min-h-dvh flex-col items-center px-[18px] pb-6">
      <PageHeader
        initialLevel={level}
        userEmail={user.email ?? null}
        userName={user.user_metadata?.full_name ?? user.email ?? null}
        conversations={conversations}
        activePage="notes"
        dueCount={dueCount}
        initialQuota={quota}
        initialSavedLemmas={savedWords.map((entry) => entry.lemma)}
      />
      <div className="flex w-full max-w-[860px] flex-1 flex-col">
        <main className="flex flex-1 flex-col gap-[22px] pt-6 pb-7">
          <NotesBrowser grammarNotes={grammarNotes} wordNotes={wordNotes} heading={heading} />
        </main>
      </div>
    </div>
  );
}
