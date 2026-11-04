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
          <NotesBrowser grammarNotes={grammarNotes} wordNotes={wordNotes} count={count} />
        </main>
      </div>
    </div>
  );
}
