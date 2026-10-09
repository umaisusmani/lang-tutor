import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/app/components/page-header';
import { ReviewSession, type SessionCard } from '@/app/review/review-session';
import { buildVocabCloze } from '@/lib/cloze';
import { getDueCount, getReviewQueue } from '@/lib/services/card.service';
import { listConversations } from '@/lib/services/conversation.service';
import { getCurrentUser, resolveCefrLevel } from '@/lib/services/profile.service';

export default async function ReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const [queue, dueCount, conversations] = await Promise.all([
    getReviewQueue(user.id),
    getDueCount(user.id),
    listConversations(user.id),
  ]);
  const levelCookie = (await cookies()).get('cefr_level')?.value;
  const level = await resolveCefrLevel(user.id, levelCookie);

  // The front of each card is built here, on the server, so the client gets
  // plain data. A card with nothing to ask (no sentence and no translation)
  // is skipped rather than shown blank.
  const cards: SessionCard[] = [];
  for (const item of queue) {
    const prompt = item.vocab_entry ? buildVocabCloze(item.vocab_entry) : null;
    if (!prompt) continue;
    cards.push({
      id: item.id,
      prompt,
      exampleSentence: item.vocab_entry?.example_sentence ?? null,
      schedule: {
        state: item.state,
        due: item.due,
        stability: item.stability,
        difficulty: item.difficulty,
        scheduled_days: item.scheduled_days,
        learning_steps: item.learning_steps,
        reps: item.reps,
        lapses: item.lapses,
        last_review: item.last_review,
      },
    });
  }

  return (
    <div className="bg-paper text-ink flex min-h-dvh flex-col items-center px-[18px] pb-6">
      <PageHeader
        initialLevel={level}
        userEmail={user.email ?? null}
        userName={user.user_metadata?.full_name ?? user.email ?? null}
        conversations={conversations}
        activePage="review"
        dueCount={dueCount}
      />
      <div className="flex w-full max-w-[640px] flex-1 flex-col">
        <main className="flex flex-1 flex-col gap-5 py-8">
          <ReviewSession initialCards={cards} />
        </main>
      </div>
    </div>
  );
}
