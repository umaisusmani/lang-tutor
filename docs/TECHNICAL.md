# starfinch — Technical Documentation

> State of the codebase as of 2026-10-08 (flashcards F1, on top of `584a504`). This describes
> what is **built**. Feature status is in [ROADMAP.md](../ROADMAP.md); design
> notes live in local `plans/*.md` files that aren't committed. For the
> user-facing overview, see [README.md](../README.md). Where a plan and the
> code disagree, the code is right. Section 11 lists where the build departed
> from the original design.
>
> **Since the last revision of this doc (2026-10-01, `584a504`):** flashcards
> F1, the foundations, with no UI yet: migration 0005 (`cards`,
> `review_logs`, a trigger that creates a card per saved word, the
> `record_review` RPC, `profiles.timezone`), the FSRS scheduler wrapper
> (`lib/srs.ts`), cloze building and answer checking (`lib/cloze.ts`),
> `card.service.ts`, and the project's first unit tests (`npm test`). See §3
> and §6. Nothing in the app calls the card service yet; F2 adds `/review`.

## Contents

1. [System overview](#1-system-overview)
2. [Stack and runtime](#2-stack-and-runtime)
3. [Repository layout](#3-repository-layout)
4. [Request lifecycle: one chat turn](#4-request-lifecycle-one-chat-turn)
5. [LLM layer](#5-llm-layer)
6. [Data model](#6-data-model)
7. [Auth, sessions and security](#7-auth-sessions-and-security)
8. [Frontend](#8-frontend)
9. [Evals](#9-evals)
10. [Configuration and deployment](#10-configuration-and-deployment)
11. [Design vs. implementation](#11-design-vs-implementation)
12. [Known limitations and tradeoffs](#12-known-limitations-and-tradeoffs)
13. [Gotchas](#13-gotchas)

---

## 1. System overview

starfinch is a German conversation tutor: a specific persona (currently
"Ramanath", 24, Düsseldorf — see §6's `personas` table) the learner chats
with in German at a chosen CEFR level (A1–C1). For every message the app
makes **three LLM calls**:

| Call | Input | Output | When |
|---|---|---|---|
| **Reply** | full conversation, persona, level, "don't ask a question if the last reply did" guidance | streamed German reply | immediately |
| **Correction** | the learner's last message only | `{hasMistake, usedEnglish, mistakeType, correction, correctionTranslation, explanation, correctionGloss}` | immediately, in parallel with the reply |
| **Gloss** | the finished reply text | `{translation, words: {word, lemma, lemmaTranslation, translation}[]}` | after the reply finishes |

A **fourth call is on demand**: `/api/explain` streams a plain-language
grammar explanation of a reply or a correction, only when the learner clicks
"explain grammar" (§5.1, §8.2). It is not part of the per-message `Promise.all`
below.

Every result from the three per-message calls is streamed to the browser as a
typed part of the message and, for signed-in users, stored with the message so
a reopened chat looks exactly as it did live without calling the model again.

```
Browser (useChat)                      Next.js server (Vercel)                  External
─────────────────                      ────────────────────────                 ────────
POST /api/chat ───────────────────────► route.ts
                                         ├─ auth? ── no ─► session cap check ──► Supabase (service role)
                                         ├─ resolve CEFR level (body > profile/cookie, see §4.1)
                                         ├─ resolve persona (conversation's own, or the default)
                                         ├─ startChatTurn: create conv + save user msg ─► Supabase (RLS)
                                         └─ runChatTurn ─┬─ streamText (reply) ──────────► Groq
   ◄── text deltas ──────────────────────────────────────┤
   ◄── data-correction ──────────────────────────────────┼─ detectCorrection ───────────► Groq
   ◄── data-gloss ───────────────────────────────────────┴─ glossText (after reply) ────► Groq
   ◄── data-savedLemmas / data-conversation / data-messageIds / data-notice

POST /api/explain ─────────────────────► route.ts (on demand, user click)
   ◄── plain-text stream ─────────────────── streamGrammarExplanation ───────► Groq
                                         (saved onto the message row if signed in)
```

## 2. Stack and runtime

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js **16.3.4**, App Router, React 19.2 | `middleware.ts` is renamed `proxy.ts` in Next 16 |
| Language | TypeScript 5 | `@/` path alias to repo root |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) | Theme tokens in `app/globals.css`; light/dark via `data-theme` |
| AI | Vercel AI SDK v6 (`ai`, `@ai-sdk/react`, `@ai-sdk/groq`) | Groq called directly with the project's own key, not through AI Gateway |
| Model | `openai/gpt-oss-120b` on Groq, `reasoningEffort: 'low'` | Same model for all three calls |
| Validation | Zod v4 | Structured-output schemas for correction and gloss |
| DB + Auth | Supabase (Postgres + Auth) via `@supabase/ssr` | Provisioned through the Vercel Marketplace |
| Toasts | `sonner` | Wrapped in `app/components/toaster.tsx` |
| Hosting | Vercel (Fluid Compute, Node runtime) | GitHub-connected auto deploys |
| Evals | `tsx` script against real Groq | `npm run eval` |
| Spaced repetition | `ts-fsrs` (FSRS-6) | Wrapped by `lib/srs.ts`, the only importer |
| Unit tests | Node's built-in runner via `tsx --test` | `npm test`; pure functions only |

**Why Groq direct, not AI Gateway:** the project aims for zero billing
exposure. A free-tier Groq key has no spend surface at all.

## 3. Repository layout

```
app/
  page.tsx                 Server Component: loads user, level, persona, conversation, saved lemmas; renders <Chat>
  chat.tsx                 Client Component: useChat, messages, corrections, translation panels, word saving, explain-grammar
  layout.tsx               Root layout, fonts, <ConfirmProvider>, <AppToaster>
  globals.css              Tailwind v4 + theme tokens, gloss-panel transitions
  api/chat/route.ts        POST /api/chat — thin controller
  api/explain/route.ts     POST /api/explain — on-demand grammar explanation, text/plain stream
  auth/actions.ts          Server Actions: signIn, signUp, signInWithGoogle, signOut, saveLevel
  auth/callback/route.ts   OAuth code → session exchange
  conversations/actions.ts deleteConversationAction
  vocab/                   /vocab page, saveVocabAction, deleteVocabAction, vocab-grid (flip cards), header
  login/page.tsx           Email/password + Google sign-in form
  components/              SiteHeader (level, chats menu, sign-out; now a 1080px sibling of the
                           860px content column, not nested inside it), Brand, ConfirmModal, Toaster,
                           GlossedText (per-word hover/tap menu + save), TranslationPanel (sentence
                           translation + explain-grammar), PersonaAvatar, vocab-chips (DEPRECATED)
lib/
  prompts.ts               Every system prompt: persona + level + turn-by-turn question guidance for
                           the reply, STRICTNESS_BY_LEVEL + English-stand-in rules for the correction,
                           buildGlossSystemPrompt, buildGrammarExplanationPrompt, LEMMA_RULES
  reply.ts                 replySettings(level, persona, previousReply) — the reply call's model,
                           system prompt and provider options, shared by chat.service.ts and the
                           reply-level eval so both exercise identical settings
  explain.ts               streamGrammarExplanation() — the on-demand grammar-explanation call
  tutor.ts                 detectCorrection() + CorrectionSchema (usedEnglish, correctionTranslation)
  correction-card.ts       hasCorrectionCard() — whether a Correction has anything to render; its own
                           module (not tutor.ts) so the client component can import it without pulling
                           in the Groq SDK
  gloss.ts                 glossText() + WordGlossSchema + ReplyGloss (translation + words) +
                           normalizeReplyGloss() (reads old bare-array rows and new {translation,words} rows alike)
  personas.ts              PersonaProfile type, FALLBACK_PERSONA (used if the personas table/row is
                           unreachable, and by evals, which have no Supabase session)
  chat-types.ts            LangTutorUIMessage (typed data parts: correction, gloss, messageIds,
                           explanations, rateLimited, conversation, savedLemmas, notice)
  mistake-types.ts         MISTAKE_TYPES taxonomy (single source of truth)
  constants.ts             Conversation starters
  srs.ts                   FSRS wrapper: row <-> ts-fsrs Card, gradeCard, previewIntervals,
                           retrievability, dayStart (4am local); NEW_PER_DAY / REVIEWS_PER_DAY
  cloze.ts                 buildVocabCloze (blank the saved word, emphasize a separable particle,
                           English->German fallback) + checkAnswer (umlaut substitutes, case note)
  text.ts                  stripPunctuation, changedWordIndices, sentenceContaining (moved out of
                           chat.tsx / glossed-text.tsx so the server can use them)
  *.test.ts                Unit tests for srs, cloze and text (`npm test`)
  stopwords.ts             DEPRECATED (only used by the deprecated chips)
  services/                One module per table, plus chat.service (orchestration), persona.service,
                           card.service (review queue, due count, recordReview over cards + review_logs)
                           (read-only personas lookups)
  supabase/                client.ts (browser), server.ts (per-request), proxy.ts (session refresh),
                           service-role.ts (RLS-bypassing PostgREST client)
  types/db.ts              Hand-written row types mirroring the migrations (now includes Persona,
                           conversations.persona_id, messages.grammar_explanation)
evals/                     cases.ts (24 correction cases, now incl. English-stand-in cases),
                           gloss-cases.ts (17 lemma cases), reply-level-cases.ts (A1/A2 sentence-length
                           and tense limits, helper-phrasing check, question-share over a scripted chat)
scripts/run-evals.ts       Eval runner — correction | gloss | reply
scripts/docs-status.sh     `npm run docs:status`: code commits the docs haven't caught up with
.github/workflows/         docs-sync.yml runs docs-status.sh on every push (warning only)
supabase/migrations/       0001 schema + RLS, 0002 gloss endpoint, 0003 annotations + titles,
                           0004 personas + persona_id + grammar_explanation + 'explain' usage endpoint,
                           0005 flashcards (cards, review_logs, vocab-card trigger, record_review, timezone)
proxy.ts                   Next 16 proxy (ex-middleware): Supabase session refresh
next.config.ts             Server Action allowedOrigins for Vercel aliases
(no public/avatars/)        the persona has no avatar image (avatar_url is null); the placeholder
                           ramanath.svg was deleted in fd7e4ac, so the folder no longer exists.
                           PersonaAvatar falls back to an initial badge. See §8.2 and §12.
```

### Layering

```
app/ (controllers, UI)  →  lib/services/*  →  lib/supabase/*  →  Postgres
                        →  lib/tutor.ts, lib/gloss.ts  →  Groq
```

- **Route handlers and Server Actions** parse input, work out who is asking
  from the session (never from the client), and delegate.
- **Services** own all SQL. Table and column names appear only here.
- **`tutor.ts` and `gloss.ts` are pure functions** with no request objects,
  so the chat route and the eval runner call the exact same code.

## 4. Request lifecycle: one chat turn

### 4.1 `app/api/chat/route.ts` (controller)

1. Parse `{ messages, conversationId, level }` from the body. The client sends
   the whole message list, as `useChat` does by default, plus the level
   currently shown in its own UI.
2. `getCurrentUserId()` uses `supabase.auth.getUser()`, which checks the token
   with Supabase instead of trusting the cookie.
3. **Anonymous only:** `getSessionId()` reads or creates an httpOnly
   `session_id` cookie, then `checkAndIncrementUsage()`. If the cap
   (`ANON_MESSAGE_CAP = 5`) is reached, it returns a stream holding one
   `data-rateLimited` part and **makes no Groq call**.
4. **Level resolution, and the race it fixes:** the body's `level` wins when
   present and valid; otherwise the profile level if signed in, else the
   `cefr_level` cookie (validated either way, because it ends up inside a
   system prompt), else `A2`. If the resolved level differs from the stored
   profile, the profile is updated to match. This exists because the level
   dropdown used to save via an un-awaited Server Action
   (`void saveLevel(next)`) — a message sent immediately after changing level
   could reach the server before that save landed, and be answered at the old
   level. Sending the level with the request removes the race outright; the
   profile write is now just keeping the stored value in step.
5. `startChatTurn()`, then `createUIMessageStream({ execute: runChatTurn })`.

### 4.2 `startChatTurn()` (before the stream opens)

- Signed in: load the conversation named by `conversationId`, or create a new
  one with its title taken from the first ~60 characters of the message.
- **Persona resolution:** an existing conversation keeps the persona it was
  started with (`conversations.persona_id`); a new conversation, and every
  anonymous turn, gets the default persona (`personas.is_default`). If the
  `personas` table or row is unreachable, `resolvePersona()` falls back to a
  persona hardcoded in `lib/personas.ts` (`FALLBACK_PERSONA`) rather than
  failing the turn — a missing persona should cost the chat its character, not
  the reply.
- Save the user message **before any LLM call**, so what the learner wrote is
  kept even if everything after it fails. Its row id is returned so the
  correction can be attached to it later.

### 4.3 `runChatTurn()` (inside the stream)

```
write data-conversation {id}                           (signed in)
write data-notice 'history' if the save failed         (signed in)

correctionDone = detectCorrection(userText)            ─┐ starts now
   → if hasMistake/usedEnglish but no `correction`:     │
     throw (treated as a failed check, not "no mistake")│
   → write data-correction                              │
   → getSavedLemmas(correctionGloss) → data-savedLemmas │ (id 'saved-correction')
   → recordMistake → mistake_history                    │
   → annotateMessage(userMessageId, {correction})       │
                                                        │ run
result = streamText(reply, persona, level); writer.merge(...) ┤ concurrently
                                                        │
assistantSave = result.text → saveMessage(assistant)   ─┤
   → write data-messageIds {user, assistant}            │
                                                        │
glossDone = result.text → glossText(reply)             ─┘
   → write data-gloss {translation, words}
   → annotateMessage(assistantId, {gloss})
   → getSavedLemmas(gloss.words) → data-savedLemmas      (id 'saved-reply')

await Promise.all([correctionDone, result.text, glossDone, assistantSave])
```

**Correction verdicts without a corrected sentence are failures, not
"nothing to flag."** QA once saw a reply render with no correction card where
one was expected; the fix is that `hasMistake: true` (or `usedEnglish: true`)
with a null `correction` now throws inside the correction chain, which routes
to the same `data-notice` failure path as a thrown Groq call, instead of
silently writing a correction part with nothing to render. Every verdict —
success, "no mistake", or failure — is logged server-side
(`console.info('[correction]', …)`) so a future report like that one can be
matched against what the model actually returned.

**`data-messageIds`** carries the database ids of the turn's two rows (the
user message, which holds the correction, and the assistant reply). The
client's own message ids are generated in the browser and match nothing in
the database; this is what lets "explain grammar" (§5.1) save its answer onto
the right row for a live (not-yet-reloaded) turn.

**The rule that matters most in this file:** `writer.merge()` does not wait
for anything, and the HTTP response closes when `execute`'s promise settles.
Any branch not included in the final `Promise.all` loses its `writer.write()`
without any error, because the write lands on a closed stream. This bug was
hit once already, which is why the comments in the file are so insistent.

**Failure isolation:** each background branch has its own `.catch`, which logs
the error and writes a **transient** `data-notice` part. A failed correction
or gloss never breaks a reply the learner already has. Notices are sent with
`transient: true`, so they reach `useChat`'s `onData` once, never enter
`message.parts`, and can't fire again on re-render or reload.

### 4.4 Stream part contract (`lib/chat-types.ts`)

| Part | Payload | Written by | Persisted? |
|---|---|---|---|
| `text` | reply deltas | `streamText` | yes (`messages.content`) |
| `data-correction` | `Correction` (now incl. `usedEnglish`, `correctionTranslation`) | correction branch | yes, on the **user** row |
| `data-gloss` | `{translation, words: WordGloss}` | gloss branch | yes, on the **assistant** row (`messages.gloss`) |
| `data-messageIds` | `{user, assistant}` (database row ids) | assistant-save branch | no (derivable from the conversation on reload) |
| `data-explanations` | `{reply, correction}` (stored grammar explanations) | only on reload, by `app/page.tsx`'s `toUIMessages()` — a live turn has none yet | n/a — this part *is* the persisted value |
| `data-savedLemmas` | `string[]` (lowercased) | both branches, distinct ids | no (recomputed on load) |
| `data-conversation` | `{id}` | start of turn | no |
| `data-rateLimited` | `{cap}` | route, instead of everything | no |
| `data-notice` | `{source, message}` | any failing branch | no (transient) |

## 5. LLM layer

### 5.1 Calls

| Function | File | AI SDK call | Temperature | Schema |
|---|---|---|---|---|
| reply | `lib/reply.ts` (settings) + `lib/services/chat.service.ts` (call site) | `streamText` | default | — |
| `detectCorrection()` | `lib/tutor.ts` | `generateObject` | 0 | `CorrectionSchema` |
| `glossText()` | `lib/gloss.ts` | `generateObject` | 0 | `{ translation: z.string(), words: WordGlossSchema }` |
| `streamGrammarExplanation()` | `lib/explain.ts` | `streamText` | default | — (plain text, not structured) |

The first three use `providerOptions.groq.reasoningEffort = 'low'`.
`streamGrammarExplanation` uses the same setting — explaining a rule needs a
little more than chatting, but not deep multi-step reasoning. gpt-oss-120b is
a reasoning model, and its hidden reasoning tokens count against Groq's
per-minute token limit.

Groq's structured-output mode rejects a bare array as the top-level schema.
That's why `glossText`'s schema wraps the array in `{ translation, words }`
and the function returns that object directly (callers read `.words` and
`.translation`). Nested inside `CorrectionSchema` the array is still accepted
as-is.

**`/api/explain` (on demand, not part of the per-message calls):** takes
`{ kind: 'reply' | 'correction', text, original?, level, messageId? }`. With a
signed-in user and a `messageId`, it reads the text to explain from that
database row (not from the request body) and, if that row already has a
`grammar_explanation`, returns it without calling the model at all — so
reopening an explanation is free. Otherwise it streams a new one and saves it
onto the row via `annotateMessage`. Without a usable `messageId` (anonymous,
or a turn whose rows failed to save), it explains the text sent in the
request and saves nothing; anonymous requests spend one unit of the same
free-message cap chat uses (`checkAndIncrementUsage`).

### 5.2 Prompts (`lib/prompts.ts`)

- **`buildConversationSystemPrompt(level, persona)`**: a persona section built
  from the persona's fields (name, age, city, bio — see §6), instructions to
  act as a real person having a conversation rather than a helper (react to
  what the learner said, share things about herself, ask a question in only
  roughly half of replies, understand English words the learner substitutes
  for ones they don't know and use the German word naturally in the reply),
  **never** correct the learner directly (that happens separately), then
  `LEVEL_GUIDANCE[level]` last, since its hard limits are what the persona's
  chattiness most wants to break and the last instruction in a prompt tends to
  win that tug-of-war. A1/A2 guidance is now hard numeric limits (sentence
  count, words per sentence, which tenses/conjunctions are allowed), not
  prose description — a vaguer version of this under-constrained gpt-oss at
  low reasoning effort (see `evals/reply-level-cases.ts`, §9).
- **`buildTurnGuidance(previousReply)`**: appended to the system prompt only
  when the persona's own previous reply ended in a question — "this reply
  must not contain a question." The prompt alone couldn't reliably keep the
  question rate down (the model can't count across turns within one call);
  this makes the one-questions-every-other-turn rule a per-call decision in
  code instead of a hope in the prompt text.
- **`buildCorrectionSystemPrompt(level)`**: unchanged leniency/category logic
  (`STRICTNESS_BY_LEVEL[level]`, the "decide hasMistake as if the category
  list didn't exist" instruction, category tie-break rules), plus a new
  English-stand-in block: when the learner substitutes English words for ones
  they don't know, `usedEnglish` is set and judged entirely separately from
  `hasMistake` — an English stand-in is never itself a mistake — but
  `correction`/`correctionTranslation`/`correctionGloss`/`explanation` are
  still filled in (the all-German version of the sentence), so the UI has
  something to show even when there's no grammar mistake to flag. Plus
  `LEMMA_RULES`.
- **`buildGlossSystemPrompt()`**: now asks for the whole-text translation
  first, then one entry per word as before (punctuation stripped, meaning in
  this sentence), plus `LEMMA_RULES`.
- **`buildGrammarExplanationPrompt(level, kind)`**: plain-text, bullet-only
  output (`• ` lines, no Markdown) explaining either a reply's notable grammar
  points or the rule behind a correction, capped around 120 words.

**Why the "as if the category list didn't exist" instruction exists:** putting
`z.enum(MISTAKE_TYPES)` in the schema changed what the model decided, not just
the shape of its output. With the enum, it consistently flagged a borderline A1
sentence that it left alone when the field was a plain string. Showing the
model a list of categories seems to push it to find something to put in one.

### 5.3 Lemmas, the vocab key

The lemma comes from the gloss model. There is no rule-based lemmatizer (no
mature German one exists for Node, and the model already has to know a word's
base form to translate it). `LEMMA_RULES` is shared by both glossing prompts,
so a word gets the same lemma in a reply and in a correction:

- Nouns keep their article (`Kinder` → `das Kind`). Verbs use the infinitive.
  Adjectives use the positive form. Pronouns keep the form as written.
  Contractions reduce to the preposition.
- **Multi-word units share one lemma:** separable verbs (`rufe … an` →
  `anrufen`), reflexive verbs with their preposition (`freue mich auf` →
  `sich freuen auf`), fixed phrases (`ein bisschen`, `es gibt`).
- `translation` is the word's meaning **in this sentence**, used for reading.
  `lemmaTranslation` is the lemma's **dictionary** meaning, and it's what gets
  saved.

### 5.4 Mistake taxonomy (`lib/mistake-types.ts`)

`word_order, case_declension, gender_article, verb_conjugation,
auxiliary_verb, preposition, adjective_ending, plural_form, word_choice,
other`. This list appears in three places: the Zod enum, the
`mistake_history.mistake_type` CHECK constraint, and (planned) the Pinecone
corpus tags. The CHECK constraint is **kept in sync by hand**.

### 5.5 Token usage (`lib/services/usage.service.ts`)

`logUsage(endpoint, model, usage, ctx)` prints a console line (including
reasoning tokens) and inserts a row into `token_usage` using the service-role
client. It does nothing when the service-role env vars are missing, as in the
eval runner, and errors are logged and ignored.

## 6. Data model

Migrations are in `supabase/migrations/` and are applied by hand, in order.
The Supabase CLI isn't installed, so the row types in `lib/types/db.ts` are
written by hand and **must be updated whenever a migration changes a table**.

| Table | Key columns | Written by | RLS |
|---|---|---|---|
| `profiles` | `user_id` PK → auth.users, `cefr_level` (CHECK A1–C1, default A2), `timezone` (0005, IANA name, default UTC) | signup trigger; `updateCefrLevel` | select/update own; no insert/delete policy |
| `vocab_entries` | `term`, `lemma`, `translation`, `example_sentence`, `source` (`new_word`/`mistake`), **UNIQUE(user_id, lemma)** | `saveVocabEntry` (upsert, `ignoreDuplicates`) | full CRUD on own rows |
| `mistake_history` | `mistake_type` (CHECK), `user_input`, `correction`, `explanation`; index `(user_id, mistake_type)` | `recordMistake` | select/insert/delete own; **no update**, since history can't be edited |
| `personas` (0004) | `slug` UNIQUE, `name`, `age`, `city`, `bio`, `avatar_url`, `is_default` (partial unique index: at most one default) | migration seed only — content, not user data | select for `anon, authenticated`; no insert/update/delete policy at all (managed only via migrations / service role) |
| `conversations` | `title` (0003), `persona_id` (0004, FK → `personas`, **ON DELETE SET NULL**) | `createConversation` | select/insert/delete own |
| `messages` | `role`, `content`, `correction jsonb`, `gloss jsonb` (0003), `grammar_explanation text` (0004); index `(conversation_id, created_at)`; FK **ON DELETE CASCADE** | `saveMessage`, `annotateMessage` | ownership proven via `EXISTS` on parent conversation; update policy added in 0003 |
| `session_usage` | `session_id` PK, `message_count` | `checkAndIncrementUsage` (service role) | **RLS on, zero policies**: invisible to every client |
| `cards` (0005) | `kind` (vocab_cloze/grammar_cloze), `vocab_entry_id` **or** `mistake_id` (each UNIQUE, ON DELETE CASCADE; CHECK exactly one), FSRS state (`state`, `due`, `stability`, `difficulty`, `scheduled_days`, `learning_steps`, `reps`, `lapses`, `last_review`), `suspended`; partial index `(user_id, due) where not suspended` | `create_vocab_card` trigger; `record_review` | full CRUD on own rows |
| `review_logs` (0005) | `card_id`, `rating` 1–4, `state` **before** the review, FSRS snapshot, `reviewed_at`, `duration_ms`, `surface` (panel/review_page), `answer_given` | `record_review` | select own; insert own **and only against a card you own**; no update/delete |
| `token_usage` | `endpoint` (CHECK chat/correction/gloss/explain/**drill**, extended in 0004 and 0005), token counts, `user_id` **ON DELETE SET NULL** | `logUsage` (service role) | **RLS on, zero policies** |

**Trigger:** `on_auth_user_created`, then `handle_new_user()` (`SECURITY
DEFINER`, `search_path = ''`), inserts a `profiles` row for each new user.
0004 adds a second trigger-free mechanism: `personas` is seeded directly by
the migration (one row, `slug = 'ramanath'`, `is_default = true`), not by any
app-level insert path, since the table has no insert policy for any role.

**Flashcard trigger (0005):** `on_vocab_entry_created` → `create_vocab_card()`
(`SECURITY INVOKER`) inserts a New card for each new `vocab_entries` row. The
vocab upsert's `ignoreDuplicates` path inserts no row, so a re-save creates no
second card. Words saved before 0005 were backfilled in the migration.

**`record_review` RPC (0005):** writes a graded card and its log line in one
transaction. The scheduling maths runs in TypeScript (`lib/srs.ts`); the
function only stores the result. It takes the card's `reps` as an expected
version and updates `where reps = expected`, so a second tab grading the same
card gets `false` (reported as `stale`) instead of overwriting the first.
`SECURITY INVOKER`, so RLS applies, and `EXECUTE` is revoked from `anon`.

**Annotation placement:** the correction describes what the learner wrote, so
it's stored on the **user** message even though the UI draws it under the
following reply. `app/page.tsx` → `toUIMessages()` reattaches it when
rebuilding the thread. The gloss describes the assistant's own text, so it's
stored on the **assistant** row. `grammar_explanation` follows the same rule:
explaining a reply lands on the assistant row, explaining a correction lands
on the user row next to the correction it explains.

**JSONB, not typed columns:** the Zod schemas define these shapes, so typed
columns would need a migration every time a field is added. Nothing queries
inside them. The cost is that old rows can be missing newer fields
(`lemma`, `lemmaTranslation`, and now `gloss.translation` — a gloss saved
before the sentence-translation field existed is a bare array rather than
`{translation, words}`). Readers handle this with fallbacks, for example
`entry.lemmaTranslation || entry.translation` and `gloss.ts`'s
`normalizeReplyGloss()`, and rows with no lemma can't be saved.

**RLS conventions used throughout:** `TO authenticated` (not an
`auth.role()` check), `(select auth.uid())` so it's evaluated once per query,
and every UPDATE policy pairs `USING` with `WITH CHECK`.

## 7. Auth, sessions and security

### 7.1 Supabase clients

| Client | File | Use |
|---|---|---|
| Browser | `lib/supabase/client.ts` | Client Components (currently unused for data) |
| Server | `lib/supabase/server.ts` | Created per request from `cookies()`. RLS applies as the user. |
| Proxy | `lib/supabase/proxy.ts` | Called on every matched request from `proxy.ts`. `getUser()` refreshes the session and writes the new cookies to both the request and the response. |
| Service role | `lib/supabase/service-role.ts` | A bare `PostgrestClient` that **bypasses RLS**. Server-only, and only for `session_usage` and `token_usage`. |

The service-role client uses `PostgrestClient` directly instead of
supabase-js because supabase-js always builds a Realtime client, which throws
on Node < 22 without a native WebSocket. That broke logging in the eval
runner.

### 7.2 Auth flows

- **Email/password:** `signIn` / `signUp` Server Actions set the cookies on the
  same response that redirects, so there's no flash of signed-out UI.
- **Google OAuth:** `signInWithGoogle` builds its origin from the `Host` and
  `x-forwarded-proto` headers (the `Origin` header isn't reliable behind
  Vercel's proxy), redirects to Google, and `/auth/callback` exchanges the
  code for a session. Failures are logged and redirect to
  `/login?error=auth_callback_failed`.
- **Server Action CSRF:** `next.config.ts` lists every Vercel alias in
  `serverActions.allowedOrigins`. If an alias is missing, sign-in fails on
  that URL without any error.

### 7.3 Authorization model

- The user id **always** comes from the session, never from the request.
- Services use the session-scoped client, so **Postgres RLS is the actual
  access control**. A forged `conversationId` is harmless because the
  `messages` insert policy rejects it.
- Services also add `.eq('user_id', userId)` on deletes as a second check.
- `deleteConversation` reads back the deleted ids with `.select('id')` so it
  can tell "deleted" apart from "RLS matched 0 rows".

### 7.4 Anonymous rate limit

httpOnly cookie plus a server-side counter in a table no client can reach.
Clearing localStorage or calling the endpoint with curl doesn't get around it.
Clearing cookies or using incognito does, which is acceptable for a limit that
only exists to protect a free Groq quota.

## 8. Frontend

### 8.1 `app/page.tsx` (Server Component)

- Loads the user, level, persona (the conversation's own, or the default —
  `resolvePersona()`), remaining anonymous messages, conversation list, the
  requested conversation (`?c=<id>`, `?c=new`, or the latest by default), and
  its messages.
- `toUIMessages()` rebuilds stored rows into `LangTutorUIMessage` without any
  extra queries. It now also: normalizes a stored gloss through
  `normalizeReplyGloss()` (old bare-array rows get `translation: null`),
  attaches a `data-messageIds` part per assistant row (so "explain grammar"
  works immediately after a reload, same as a live turn), and attaches a
  `data-explanations` part carrying any already-saved `grammar_explanation`
  text for the reply and its paired correction.
- **One** `getSavedLemmas` call for the whole thread (batched in groups of 100
  lemmas to keep request URLs under proxy limits), reading lemmas out of
  `gloss.words` rather than a bare array.
- `pickStarters()` runs on the server (partial Fisher-Yates) so the starters
  match between server render and hydration.
- `<Chat key={conversation?.id ?? 'new'}>` remounts the client component when
  switching chats. `useChat` only reads `messages` as an initial value.

### 8.2 `app/chat.tsx` (Client Component)

- `useChat<LangTutorUIMessage>` with `onError` (toast) and `onData` (turns
  `data-notice` parts into toasts, using the notice source as the toast id so
  repeats replace each other instead of stacking).
- `conversationId` is kept in a ref, updated from `data-conversation`, and
  sent in the `body` of each `sendMessage`, **alongside `level`** (§4.1's race
  fix). That's how a new chat's second message goes to the same conversation,
  and how a level change takes effect on the very next message instead of
  racing an un-awaited profile save.
- **Saved-lemma Set** is computed on each render from three sources: lemmas
  known at page load, lemmas from streamed `data-savedLemmas` parts, and
  lemmas saved locally this session. It isn't state updated in an effect, so
  a stale part can't un-tick a word the learner just saved.
- **Saving a word** is optimistic: the ✓ appears immediately, `saveVocabAction`
  runs, and on `ok: false` or an exception the ✓ is removed and a toast shows.
  The saved example sentence is the one sentence containing the word
  (`sentenceContaining`, still in `app/chat.tsx`; only `stripPunctuation`
  moved to `app/components/glossed-text.tsx`).
- **Correction card:** the changed words are highlighted by a local multiset
  diff of the original and corrected sentences (`changedWordIndices`), not by
  anything the model returns. A card now shows for `usedEnglish` sentences
  too, labeled "in German" (a different color from a mistake-type label)
  rather than a grammar category — `hasCorrectionCard()` (`lib/correction-card.ts`)
  decides whether a `Correction` has anything to render at all, used both here
  and in `chat.service.ts`'s failure check (§4.3).
- **Per-word reading is now `GlossedText`** (`app/components/glossed-text.tsx`,
  moved out of this file): hovering a word still shows a quick translation;
  clicking/tapping it pins a small menu with the dictionary form and a
  **+ save** button. This replaced the old always-visible word-list panel
  (`groupGlossByLemma`/`GlossPanel`), which QA felt was noise once per-word
  meanings lived in the words themselves.
- **`TranslationPanel`** (`app/components/translation-panel.tsx`) is the
  "translate" button's panel: the whole-sentence translation plus an
  **explain grammar** button. Clicking it calls `/api/explain`, streams the
  answer into the panel (client-held state keyed by message id — reading the
  stream directly from `fetch`, not through `useChat`), and — for a signed-in
  user with a known `messageId` (from `data-messageIds` or a reload's
  `data-explanations`) — the server saves it, so it survives a reload without
  a second model call. While a reply is still streaming and no translation
  exists yet, the translate button renders disabled and pulsing in its final
  position rather than a separate "gloss…" line, so there's no layout jump
  when it becomes clickable.
- **Persona avatar:** `PersonaAvatar` (`app/components/persona-avatar.tsx`)
  renders next to each of the persona's replies and on the empty-chat screen.
  It shows an image from `avatar_url` when set, or an initial badge when not
  (currently always the latter — see §12).
- Level changes write the cookie and, if signed in, call `saveLevel` — now a
  best-effort sync of the stored profile rather than something the next
  message depends on, since the message itself carries the level. The
  theme is stored in localStorage (`starfinch_theme`, falling back to the
  pre-rename `starprache_theme` on read), and every access is
  wrapped in try/catch.

### 8.3 Other surfaces

- `SiteHeader`: level select, chats menu (open, delete with confirm modal),
  remaining-message indicator for anonymous visitors, theme toggle, sign
  in/out. Now rendered as a sibling of the 860px content column, in its own
  1080px-wide wrapper (`app/chat.tsx`, `app/vocab/page.tsx`, `app/login/page.tsx`
  each changed their top-level layout for this), rather than nested inside
  that column — wider chrome without widening the reply text's line length.
- `/vocab`: `VocabGrid` (`app/vocab/vocab-grid.tsx`) renders saved words as a
  responsive grid of click-to-reveal cards (lemma always visible; translation
  and example sentence hidden until tapped), plus a page-level "show all /
  hide all" toggle. A card's own flip state and the toggle combine with XOR,
  so toggling "show all" clears individual flips rather than fighting them.
  Resets to all-hidden on every page load/navigation by design — it's meant
  to double as light self-testing, not a persistent reading view. Replaced
  the earlier flat list. A revealed card is tinted with a faint wash of
  `--accent-ink` (`bg-accent-ink/[0.08]`), not `bg-soft`: `--soft` is too
  close to `--panel` in both themes for the two states to read as different.
- `ConfirmProvider` / `useConfirm()`: a confirm dialog returned as a promise.

## 9. Evals

`npm run eval [correction|gloss|reply]` runs `scripts/run-evals.ts` through
`tsx` with `.env.local`, calling `detectCorrection`, `glossText` and the
reply model (via `lib/reply.ts`'s `replySettings()`, the same settings
`chat.service.ts` streams with) directly.

| Suite | Cases | Pass rule | Expected |
|---|---|---|---|
| correction (`evals/cases.ts`) | 24 | `hasMistake` matches, `mistakeType` matches when specified, and `usedEnglish` matches when specified. Includes clean sentences, A1-vs-C1 pairs, and English-stand-in cases (clean, with a mistake layered on, and a German loanword that must *not* be flagged as English). | 19–20/20 of the original 20 (`auxiliary-verb-1` flips between runs because of Groq non-determinism); the 4 newer English cases pass steadily |
| gloss (`evals/gloss-cases.ts`) | 17 | Each listed word gets an accepted lemma (case- and whitespace-insensitive) in **all 3 runs**; every run's sentence `translation` must be non-empty | all pass |
| reply (`evals/reply-level-cases.ts`) | 13 single-turn cases + 1 scripted 8-turn conversation | Per case: A1/A2 replies stay within their sentence-count/length/tense limits (`REPLY_LIMITS`), no helper phrasing (`HELPER_PHRASES`), and an English stand-in comes back used in German (`expectContains`). Across the scripted conversation: at most half the replies end in a question (`MAX_QUESTION_SHARE`), checked turn-by-turn against the real `buildTurnGuidance()` behavior, not just a static sample. | all pass as of the prompt in `lib/prompts.ts` as of 2026-09-30 |

- `withRateLimitRetry` waits as long as Groq's 429 message asks, so hitting
  the free tier's 8k tokens/min limit doesn't count as a failed case. It also
  doesn't protect against Groq's **daily** token cap (200k tokens/day on the
  free/on-demand tier) — that one isn't retryable within a run, and a day of
  repeated full-suite runs can exhaust it and start 429ing live chat too, so
  run only the suite a change actually touches.
- Gloss cases run one at a time and take a few minutes. The reply suite's
  question-share check runs its 8 turns sequentially (each depends on the
  previous reply, for `buildTurnGuidance`), so it's not parallelizable either.
- **Nothing runs evals automatically.** CI (`.github/workflows/docs-sync.yml`)
  only checks whether this doc is behind the code, and no git hook runs evals.
  Run them after any change to `lib/prompts.ts`, `lib/tutor.ts` or `lib/gloss.ts`.

## 10. Configuration and deployment

### Environment

| Variable | Scope | Used by |
|---|---|---|
| `GROQ_API_KEY` | server | all LLM calls, evals |
| `NEXT_PUBLIC_SUPABASE_URL` | public | all Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | browser, server and proxy clients |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | `session_usage`, `token_usage` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | server | planned (grammar RAG embeddings), unused |

### Deployment

- Vercel project connected to GitHub. Pushes to `main` deploy to production,
  and branches get preview deployments.
- **Deployment Protection (SSO) must stay disabled**, otherwise every
  `*.vercel.app` URL, including production, sits behind a Vercel login
  (`vercel project protection disable <name> --sso`).
- Supabase is a Marketplace resource owned by a Vercel-managed org. Open its
  dashboard with `vercel integration open supabase <resource>`.
- **Free-tier Supabase pauses after 7 days of inactivity.** When that happens
  the app fails to reach the database until the project is resumed in the
  dashboard.

## 11. Design vs. implementation

Where the build departed from the original v1 design. Whether a feature is
done is in [ROADMAP.md](../ROADMAP.md), not here.

| Originally designed | The code does |
|---|---|
| Rate limit for anonymous visitors only | As designed: 5-message lifetime cap (`session.service.ts`), signed-in users uncapped. A time-windowed signed-in cap is on the roadmap for before public launch |
| Vocab extraction is deterministic (tokenize → lemmatize → stopwords) | **LLM-derived lemmas** from the gloss call. The deterministic stopword path and the chips were built and are now deprecated |
| Vocab candidates shown as chips under each reply | Replaced by **+ buttons in a per-word hover/tap menu** (`GlossedText`); the candidate-chip path (`vocab-chips.tsx`, `getVocabCandidates`) stays deprecated |
| `/app/api/vocab/*` REST routes | **Server Actions** (`app/vocab/actions.ts`) |
| `lib/usage.ts` | `lib/services/usage.service.ts`, persisting to `token_usage` |
| `token_usage.endpoint` ∈ chat, correction | Also `gloss` (0002) and `explain` (0004) |
| Two LLM calls per turn | **Three per turn, plus a fourth on demand** (reply, correction, gloss; `explain` only when the learner asks) |
| A single generic conversation partner | **A named persona** (`personas` table, §6), currently one row ("Ramanath"), designed to extend to several later. `conversations.persona_id` pins each chat to the persona it started with |
| Gloss = word-by-word only | **Gloss = whole-sentence translation + word-by-word**, surfaced as a translation panel with per-word hover/tap menus, not an always-visible word list |
| Corrections only flag mistakes | **Corrections also surface English-stand-in sentences** (`usedEnglish`) under an "in German" label, distinct from a mistake card, reflecting that the UI now explicitly invites English for unknown words |
| — | Not in the original design at all: the persona system, on-demand saved grammar explanations (`/api/explain`), the level/profile race fix (§4.1), the correction-without-a-sentence failure fix (§4.3), the wider header layout, the vocab flip-card grid, the reply-level eval suite, conversation history with reopen/delete, persisted annotations (0003), error toasts, confirm modal, theme toggle, conversation starters |

## 12. Known limitations and tradeoffs

- **Rate-limit race:** read-then-write, not an atomic increment, so two
  simultaneous requests from one anonymous session can go one message over
  the cap. Accepted at this scale.
- **Authenticated users have no rate limit at all**, by original v1 design —
  acceptable for a low-traffic personal project, but a real gap once the app
  has a public domain. See the §11 row above; this is the one piece of the
  public-launch checklist still open.
- **The persona has no avatar image.** `avatar_url` is `null` for the seeded
  row; `PersonaAvatar` falls back to an initial badge everywhere. Several
  generated-art options were tried and rejected (see git history around
  `lib/personas.ts` and `public/avatars/`); the project doesn't want
  AI-generated art, so this needs real artwork, not another generation
  attempt.
- **The whole message list is sent every turn.** Nothing trims history before
  `streamText`, so the reply prompt grows with the conversation.
- **The model name is repeated across call sites** (`lib/reply.ts`'s
  `CHAT_MODEL`, plus a `CORRECTION_MODEL`/`GLOSS_MODEL`/`EXPLAIN_MODEL`
  constant in each of `tutor.ts`/`gloss.ts`/`explain.ts`) and the Groq
  provider is imported in each file. There's no single place to switch model
  or provider — the bring-your-own-model design (`plans/byom.md`, `lib/llm.ts`)
  would be the place this gets fixed, if that's ever built.
- **The mistake taxonomy is in sync by hand** between TypeScript and the SQL
  CHECK constraint.
- **Row types are hand-written.** They drift if a migration changes and
  `lib/types/db.ts` isn't updated.
- **Lemmas depend on the model.** The gloss eval guards the known-hard cases,
  but a new construction can still get an inconsistent lemma and end up saved
  twice.
- **Old JSONB rows** can lack newer gloss fields (`lemma`, `lemmaTranslation`,
  and now the whole-sentence `translation` on `messages.gloss`). Readers must
  keep their fallbacks (`normalizeReplyGloss`, `lemmaTranslation || translation`).
- **Unit tests cover pure functions only** (`lib/srs.ts`, `lib/cloze.ts`,
  `lib/text.ts`). Services, routes and UI have none, and evals are run by hand.
- **No flashcard UI yet.** `card.service.ts` exists but nothing calls it
  until F2. `profiles.timezone` is never set yet either, so every learner's
  day currently starts at 4am UTC.
- **`docs/TECHNICAL.md` and `ROADMAP.md` can lag the code.** `npm run
  docs:status` (also run in CI on every push) lists the code commits made
  since each was last updated, but it only warns. Someone still has to write the update. The check
  goes by when each file was last committed, so a typo fix also counts as
  "synced". See the "Keeping docs in sync" section of `CLAUDE.md`.

## 13. Gotchas

Things that cost real debugging time. Most are explained where they apply;
this is the index.

- **`writer.merge()` doesn't wait.** A branch left out of the final
  `Promise.all` writes to a closed stream and is silently lost. §4.3.
- **An enum in the schema changes the verdict.** `z.enum(MISTAKE_TYPES)` made
  the correction model flag sentences it left alone with `z.string()`. §5.2.
- **gpt-oss-120b's hidden reasoning tokens count against Groq's per-minute
  limit.** Keep `reasoningEffort: 'low'`. §5.1.
- **`temperature: 0` isn't deterministic on Groq.** The same input can take a
  different reasoning path (visible as a different token count) and flip a
  verdict, a side effect of batching on high-throughput inference. That's
  why `auxiliary-verb-1` flips between runs and 19–20/20 is the expected
  correction score. Investigate only a real drop, not one flaky boundary case. §9.
- **Check Groq's live `/v1/models`, not bundled docs.** The AI SDK's bundled
  Groq docs listed `llama-3.3-70b-versatile` after Groq had deprecated it.
- **Vercel SSO protection covers every `*.vercel.app` URL, production
  included,** and silently breaks anonymous chat. Re-check if the project
  ever moves to another team. §10.
- **Free-tier Supabase pauses after 7 days idle** and looks like a production
  outage. §10.
- **The Marketplace Supabase project belongs to a Vercel-managed org.** Open it
  with `vercel integration open supabase <resource>`. Claiming it moves it out
  of Vercel billing. §10.
- **Next 16 renamed `middleware.ts` to `proxy.ts`** (the exported function is
  `proxy` too). The old name still works but warns on every build. §2.
- **supabase-js builds a Realtime client that throws on Node < 22.** That's why
  the service-role client is a bare `PostgrestClient`. §7.1.
