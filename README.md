# starprache

German conversation practice with an AI tutor. You chat in German at your CEFR level. Every reply comes with a word-by-word translation, every mistake you make gets a correction with a plain-English explanation, and any word you tap can be saved to your own vocabulary list.

**Live:** https://language-chatbot-starchy.vercel.app

## Features

- **Conversation at your level.** Pick a CEFR level (A1–C1). The tutor keeps its German at that level, and the correction check gets stricter as the level goes up. At A1 it ignores a dropped article, but at C1 it doesn't.
- **Corrections.** When your message has a mistake, you get the corrected sentence with the changed words highlighted, a short explanation, and the mistake type (word order, case, gender/article, verb conjugation, and so on).
- **Word-by-word gloss.** Hover a word to see its translation, or open the gloss panel to see every word's translation in a list.
- **Saving words.** Every row in the gloss panel has a **+** button. It saves the word's [lemma](#glossary) with its dictionary meaning and the sentence you found it in. Words from a correction are tagged as mistakes.
- **Vocab page** (`/vocab`). Your saved words, with the sentence each one came from. Remove the ones you no longer want.
- **Chat history.** Conversations are saved, with their corrections and glosses, and you can reopen or delete them from the chats menu. The logo always opens a new chat.
- **Try before signing in.** You can send 5 messages without an account. Sign in with email/password or Google to keep going and save your progress.

## How a message is handled

Each message you send makes three LLM calls, all to `openai/gpt-oss-120b` on Groq:

```
your message ──┬──► reply           streamed to you as it's written   lib/services/chat.service.ts
               ├──► correction check runs at the same time as the reply lib/tutor.ts
               └──► (reply finishes) ──► gloss of the reply            lib/gloss.ts
```

- **Correction and reply run in parallel.** The correction check only needs your message, so you don't wait for it.
- **The gloss runs last** because it needs the finished reply.
- **All three results are saved with the message,** so a reopened chat looks exactly as it did live, without calling the model again.

### How saved words work

The gloss model returns one entry per word: `{ word, lemma, lemmaTranslation, translation }`.

- `translation` is what the word means **in this sentence**. It's used for reading.
- `lemma` is the dictionary form, and it's what a saved word is **keyed on**. One lemma is one vocab entry, however many forms of it you meet. `Kinder`, `Kind` and `Kindes` all save as `das Kind`.
- `lemmaTranslation` is the lemma's own meaning, which is what gets saved. For "Es **gibt** hier…", `translation` is "is", but the saved entry is `es gibt` = "there is / there are".

**Words that belong together share one lemma.** Each word still gets its own row in the gloss panel, but saving any of them saves the whole unit:

| In the sentence | Saved as |
|---|---|
| Ich **rufe** dich morgen **an** | `anrufen` (separable verb) |
| Ich **freue mich auf** das Wochenende | `sich freuen auf` (reflexive verb + its preposition) |
| Ich spreche **ein bisschen** Deutsch | `ein bisschen` (fixed phrase) |
| Ich habe **ein** Auto | `ein` (ordinary word, nothing merged) |
| Wie ist das Wetter bei **euch**? | `euch` (pronouns keep the form you saw) |

The rules live in one place, `LEMMA_RULES` in [lib/prompts.ts](lib/prompts.ts), shared by the reply gloss and the correction gloss so a word gets the same lemma wherever you meet it. The lemma comes from the model, not from a dictionary, so the [gloss eval](#evals) checks these cases.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS · Vercel AI SDK · Groq · Supabase (Postgres, Auth, row-level security) · Vercel

## Run locally

You need Node 20+, a [Groq](https://console.groq.com) API key (the free tier works), and a [Supabase](https://supabase.com) project.

```bash
npm install
cp .env.example .env.local   # then fill in the values, see below
npm run dev                  # http://localhost:3000
```

| Variable | Where to find it | Used for |
|---|---|---|
| `GROQ_API_KEY` | Groq console → API Keys | All LLM calls |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Database and auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | Database and auth, as the signed-in user |
| `SUPABASE_SERVICE_ROLE_KEY` | same page | Server-only: token-usage logs and the signed-out message cap. Never expose it to the browser. |

**Database:** run the migrations in [supabase/migrations/](supabase/migrations/) in order, either with `supabase db push` or by pasting each file into the Supabase SQL editor. They create every table with row-level security turned on.

**Google sign-in** (optional): enable the Google provider under Supabase → Authentication → Providers, and add `http://localhost:3000/auth/callback` to the allowed redirect URLs. Email/password sign-in works without this.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run eval` | Run both eval suites (see below) |

## Evals

The model's output isn't fixed, so the prompts are checked with evals rather than ordinary unit tests. An eval sends hand-picked sentences with known right answers to the real model and scores how many it gets right. The runner calls the same functions the app does. It makes real Groq calls, so it needs `GROQ_API_KEY` in `.env.local`.

```bash
npm run eval                 # both suites
npm run eval -- correction   # just the correction check
npm run eval -- gloss        # just the lemma rules
```

- **Correction** ([evals/cases.ts](evals/cases.ts)): 20 cases. Each one says whether a sentence has a mistake and what type. The set includes correct sentences, so over-correction is caught too, and some pairs where the same sentence should pass at A1 but be flagged at C1.
- **Gloss** ([evals/gloss-cases.ts](evals/gloss-cases.ts)): each case lists the words that matter in a sentence and the lemma each one should get. Each case runs 3 times and passes only if all 3 runs are right, because a lemma that changes between runs is a word that ends up in your vocab twice. Some of the cases are controls, which check that ordinary words are *not* merged into a phrase.

Each case prints ✓ or ✗ with the wrong lemmas listed, and the runner exits with an error if any case fails. The gloss suite takes a few minutes on Groq's free tier because it waits out the per-minute token limit instead of failing.

**Nothing runs this automatically.** There's no CI workflow and no git hook — run it yourself after any change to `lib/prompts.ts`, `lib/gloss.ts` or `lib/tutor.ts`, before you commit.

When you find a word the app gets wrong, add it as a case so it stays fixed.

## Project layout

```
app/
  page.tsx               chat page: loads the conversation, saved words, level
  chat.tsx               the chat UI: messages, corrections, gloss panels, saving
  api/chat/route.ts      the chat endpoint
  vocab/                 the saved-words page and its server actions
  conversations/         delete-chat action
  login/, auth/          sign-in pages, server actions, OAuth callback
  components/            header, logo, toasts, confirm dialog
lib/
  prompts.ts             every system prompt, including LEMMA_RULES
  tutor.ts               correction check
  gloss.ts               word-by-word gloss
  services/              database access, one file per table (chat, vocab, mistakes, …)
  supabase/              Supabase clients: browser, server, service-role
evals/                   eval cases
scripts/run-evals.ts     eval runner
supabase/migrations/     database schema
```

## Glossary

**Lemma.** The dictionary form of a word, the form you'd look up. `gegangen` → `gehen`, `Kinder` → `das Kind`, `besser` → `gut`. In this app the lemma is what a saved word is keyed on, so every form of a word lands on the same vocab entry. Nouns keep their article, because gender is the part learners most need to learn with the noun.

**Gloss.** A word-by-word translation shown alongside the original text. Here, each word's translation appears on hover and in the gloss panel.

**CEFR level.** The Common European Framework of Reference scale for language ability: A1 and A2 (beginner), B1 and B2 (intermediate), C1 and C2 (advanced). The app offers A1–C1.

**Separable verb.** A German verb whose prefix splits off and moves to the end of the clause: *anrufen* → "Ich **rufe** dich **an**." The two halves share one lemma here, because "rufen" alone is a different verb.

**Reflexive verb.** A verb that takes a reflexive pronoun (*mich, dich, sich*…), often with a set preposition: *sich freuen auf* ("to look forward to"). The verb, pronoun and preposition share one lemma, because that's how the verb is learned.

**Fixed phrase (chunk).** A group of words that means something only as a whole, such as *ein bisschen* ("a little"), *es gibt* ("there is"), *nach Hause* ("home, as a destination") or *auf jeden Fall* ("definitely"). Saved as the whole phrase.

**Mistake type.** The category a correction is filed under: word order, case, gender/article, verb conjugation, auxiliary verb, preposition, adjective ending, plural form, word choice, or other. Each mistake is recorded by type. There's no screen for this history yet.

**Eval.** A test for LLM output. A fixed set of inputs with known right answers is run against the real model and scored, which catches a prompt change that makes things worse. See [Evals](#evals).

**Stopword.** A very common word (*und, der, ist*…) with little learning value on its own. The list is in [lib/stopwords.ts](lib/stopwords.ts). It was used by the old save chips and isn't applied to the gloss panel.

**RLS (row-level security).** A Postgres feature that makes the database itself check who may read or change each row. It's on for every table. User tables have policies that allow only the owner's own rows, so a bug in the app code still can't expose someone else's data. The two logging tables have no policies at all, so only the server's service-role key can write to them.

## License

MIT
