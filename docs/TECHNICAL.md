# starfinch — Technical Documentation

> State of the codebase as of 2026-09-22 (commit `0a92c6a`). This describes
> what is **built**. What is planned lives in local working docs that aren't
> committed (`PLAN.md` for v1, `PHASE2.md` for phases 2-3, `FLASHCARDS.md` for
> the SRS feature). For the user-facing overview, see
> [README.md](../README.md). Where the plan and the code disagree, the code is
> right. Section 11 lists every known difference.

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
11. [Plan vs. implementation](#11-plan-vs-implementation)
12. [Known limitations and tradeoffs](#12-known-limitations-and-tradeoffs)

---

## 1. System overview

starfinch is a German conversation tutor. The learner chats in German at a
chosen CEFR level (A1–C1). For every message the app makes **three LLM calls**:

| Call | Input | Output | When |
|---|---|---|---|
| **Reply** | full conversation | streamed German reply | immediately |
| **Correction** | the learner's last message only | `{hasMistake, mistakeType, correction, explanation, correctionGloss}` | immediately, in parallel with the reply |
| **Gloss** | the finished reply text | word-by-word `{word, lemma, lemmaTranslation, translation}[]` | after the reply finishes |

Every result is streamed to the browser as a typed part of the message and,
for signed-in users, stored with the message so a reopened chat looks exactly
as it did live without calling the model again.

```
Browser (useChat)                      Next.js server (Vercel)                  External
─────────────────                      ────────────────────────                 ────────
POST /api/chat ───────────────────────► route.ts
                                         ├─ auth? ── no ─► session cap check ──► Supabase (service role)
                                         ├─ resolve CEFR level
                                         ├─ startChatTurn: create conv + save user msg ─► Supabase (RLS)
                                         └─ runChatTurn ─┬─ streamText (reply) ──────────► Groq
   ◄── text deltas ──────────────────────────────────────┤
   ◄── data-correction ──────────────────────────────────┼─ detectCorrection ───────────► Groq
   ◄── data-gloss ───────────────────────────────────────┴─ glossText (after reply) ────► Groq
   ◄── data-savedLemmas / data-conversation / data-notice
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

**Why Groq direct, not AI Gateway:** the project aims for zero billing
exposure. A free-tier Groq key has no spend surface at all.

## 3. Repository layout

```
app/
  page.tsx                 Server Component: loads user, level, conversation, saved lemmas; renders <Chat>
  chat.tsx                 Client Component: useChat, messages, corrections, gloss panels, word saving
  layout.tsx               Root layout, fonts, <ConfirmProvider>, <AppToaster>
  globals.css              Tailwind v4 + theme tokens, gloss-panel transitions
  api/chat/route.ts        POST /api/chat — thin controller
  auth/actions.ts          Server Actions: signIn, signUp, signInWithGoogle, signOut, saveLevel
  auth/callback/route.ts   OAuth code → session exchange
  conversations/actions.ts deleteConversationAction
  vocab/                   /vocab page, saveVocabAction, deleteVocabAction, remove button, header
  login/page.tsx           Email/password + Google sign-in form
  components/              SiteHeader (level, chats menu, sign-out), Brand, ConfirmModal, Toaster,
                           vocab-chips (DEPRECATED)
lib/
  prompts.ts               Every system prompt, CEFR levels, LEVEL_GUIDANCE, STRICTNESS_BY_LEVEL, LEMMA_RULES
  tutor.ts                 detectCorrection() + CorrectionSchema
  gloss.ts                 glossText() + WordGlossSchema
  chat-types.ts            LangTutorUIMessage (typed data parts)
  mistake-types.ts         MISTAKE_TYPES taxonomy (single source of truth)
  constants.ts             Conversation starters
  stopwords.ts             DEPRECATED (only used by the deprecated chips)
  services/                One module per table, plus chat.service (orchestration)
  supabase/                client.ts (browser), server.ts (per-request), proxy.ts (session refresh),
                           service-role.ts (RLS-bypassing PostgREST client)
  types/db.ts              Hand-written row types mirroring the migrations
evals/                     cases.ts (20 correction cases), gloss-cases.ts (17 lemma cases)
scripts/run-evals.ts       Eval runner
supabase/migrations/       0001 schema + RLS, 0002 gloss endpoint, 0003 annotations + titles
proxy.ts                   Next 16 proxy (ex-middleware): Supabase session refresh
next.config.ts             Server Action allowedOrigins for Vercel aliases
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

1. Parse `{ messages, conversationId }` from the body. The client sends the
   whole message list, as `useChat` does by default.
2. `getCurrentUserId()` uses `supabase.auth.getUser()`, which checks the token
   with Supabase instead of trusting the cookie.
3. **Anonymous only:** `getSessionId()` reads or creates an httpOnly
   `session_id` cookie, then `checkAndIncrementUsage()`. If the cap
   (`ANON_MESSAGE_CAP = 5`) is reached, it returns a stream holding one
   `data-rateLimited` part and **makes no Groq call**.
4. `resolveCefrLevel()`: the profile level if signed in, otherwise the
   `cefr_level` cookie (validated, because it ends up inside a system prompt),
   otherwise `A2`.
5. `startChatTurn()`, then `createUIMessageStream({ execute: runChatTurn })`.

### 4.2 `startChatTurn()` (before the stream opens)

- Signed in: load the conversation named by `conversationId`, or create a new
  one with its title taken from the first ~60 characters of the message.
- Save the user message **before any LLM call**, so what the learner wrote is
  kept even if everything after it fails. Its row id is returned so the
  correction can be attached to it later.

### 4.3 `runChatTurn()` (inside the stream)

```
write data-conversation {id}                           (signed in)
write data-notice 'history' if the save failed         (signed in)

correctionDone = detectCorrection(userText)            ─┐ starts now
   → write data-correction                              │
   → getSavedLemmas(correctionGloss) → data-savedLemmas │ (id 'saved-correction')
   → recordMistake → mistake_history                    │
   → annotateMessage(userMessageId, {correction})       │
                                                        │ run
result = streamText(reply); writer.merge(...)          ─┤ concurrently
                                                        │
assistantSave = result.text → saveMessage(assistant)   ─┤
                                                        │
glossDone = result.text → glossText(reply)             ─┘
   → write data-gloss
   → annotateMessage(assistantId, {gloss})
   → getSavedLemmas(gloss) → data-savedLemmas           (id 'saved-reply')

await Promise.all([correctionDone, result.text, glossDone, assistantSave])
```

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
| `data-correction` | `Correction` | correction branch | yes, on the **user** row |
| `data-gloss` | `WordGloss` | gloss branch | yes, on the **assistant** row |
| `data-savedLemmas` | `string[]` (lowercased) | both branches, distinct ids | no (recomputed on load) |
| `data-conversation` | `{id}` | start of turn | no |
| `data-rateLimited` | `{cap}` | route, instead of everything | no |
| `data-notice` | `{source, message}` | any failing branch | no (transient) |

## 5. LLM layer

### 5.1 Calls

| Function | File | AI SDK call | Temperature | Schema |
|---|---|---|---|---|
| reply | `lib/services/chat.service.ts` | `streamText` | default | — |
| `detectCorrection()` | `lib/tutor.ts` | `generateObject` | 0 | `CorrectionSchema` |
| `glossText()` | `lib/gloss.ts` | `generateObject` | 0 | `{ words: WordGlossSchema }` |

All three use `providerOptions.groq.reasoningEffort = 'low'`. gpt-oss-120b is
a reasoning model, and its hidden reasoning tokens count against Groq's
per-minute token limit.

Groq's structured-output mode rejects a bare array as the top-level schema.
That's why `glossText` wraps the array in `{ words }` and unwraps it after the
call. Nested inside `CorrectionSchema` the array is accepted.

### 5.2 Prompts (`lib/prompts.ts`)

- **`buildConversationSystemPrompt(level)`**: base persona (short replies,
  always end with a question, **never** correct the learner, since that
  happens separately) plus `LEVEL_GUIDANCE[level]`.
- **`buildCorrectionSystemPrompt(level)`**: `STRICTNESS_BY_LEVEL[level]` (A1
  very lenient, up to B2/C1 strict), an explicit "decide hasMistake **as if
  the category list didn't exist**" instruction, category tie-break rules
  (case_declension vs preposition vs word_choice), and `LEMMA_RULES`.
- **`buildGlossSystemPrompt()`**: one entry per word, punctuation stripped,
  meaning in this sentence, plus `LEMMA_RULES`.

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
| `profiles` | `user_id` PK → auth.users, `cefr_level` (CHECK A1–C1, default A2) | signup trigger; `updateCefrLevel` | select/update own; no insert/delete policy |
| `vocab_entries` | `term`, `lemma`, `translation`, `example_sentence`, `source` (`new_word`/`mistake`), **UNIQUE(user_id, lemma)** | `saveVocabEntry` (upsert, `ignoreDuplicates`) | full CRUD on own rows |
| `mistake_history` | `mistake_type` (CHECK), `user_input`, `correction`, `explanation`; index `(user_id, mistake_type)` | `recordMistake` | select/insert/delete own; **no update**, since history can't be edited |
| `conversations` | `title` (0003) | `createConversation` | select/insert/delete own |
| `messages` | `role`, `content`, `correction jsonb`, `gloss jsonb` (0003); index `(conversation_id, created_at)`; FK **ON DELETE CASCADE** | `saveMessage`, `annotateMessage` | ownership proven via `EXISTS` on parent conversation; update policy added in 0003 |
| `session_usage` | `session_id` PK, `message_count` | `checkAndIncrementUsage` (service role) | **RLS on, zero policies**: invisible to every client |
| `token_usage` | `endpoint` (CHECK chat/correction/gloss), token counts, `user_id` **ON DELETE SET NULL** | `logUsage` (service role) | **RLS on, zero policies** |

**Trigger:** `on_auth_user_created`, then `handle_new_user()` (`SECURITY
DEFINER`, `search_path = ''`), inserts a `profiles` row for each new user.

**Annotation placement:** the correction describes what the learner wrote, so
it's stored on the **user** message even though the UI draws it under the
following reply. `app/page.tsx` → `toUIMessages()` reattaches it when
rebuilding the thread. The gloss describes the assistant's own text, so it's
stored on the **assistant** row.

**JSONB, not typed columns:** the Zod schemas define these shapes, so typed
columns would need a migration every time a field is added. Nothing queries
inside them. The cost is that old rows can be missing newer fields
(`lemma`, `lemmaTranslation`). Readers handle this with fallbacks, for example
`entry.lemmaTranslation || entry.translation`, and rows with no lemma can't be
saved.

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

- Loads the user, level, remaining anonymous messages, conversation list, the
  requested conversation (`?c=<id>`, `?c=new`, or the latest by default), and
  its messages.
- `toUIMessages()` rebuilds stored rows into `LangTutorUIMessage` without any
  extra queries.
- **One** `getSavedLemmas` call for the whole thread (batched in groups of 100
  lemmas to keep request URLs under proxy limits).
- `pickStarters()` runs on the server (partial Fisher-Yates) so the starters
  match between server render and hydration.
- `<Chat key={conversation?.id ?? 'new'}>` remounts the client component when
  switching chats. `useChat` only reads `messages` as an initial value.

### 8.2 `app/chat.tsx` (Client Component)

- `useChat<LangTutorUIMessage>` with `onError` (toast) and `onData` (turns
  `data-notice` parts into toasts, using the notice source as the toast id so
  repeats replace each other instead of stacking).
- `conversationId` is kept in a ref, updated from `data-conversation`, and
  sent in the `body` of each `sendMessage`. That's how a new chat's second
  message goes to the same conversation.
- **Saved-lemma Set** is computed on each render from three sources: lemmas
  known at page load, lemmas from streamed `data-savedLemmas` parts, and
  lemmas saved locally this session. It isn't state updated in an effect, so
  a stale part can't un-tick a word the learner just saved.
- **Saving a word** is optimistic: the ✓ appears immediately, `saveVocabAction`
  runs, and on `ok: false` or an exception the ✓ is removed and a toast shows.
  The saved example sentence is the one sentence containing the word
  (`sentenceContaining`).
- **Correction card:** the changed words are highlighted by a local multiset
  diff of the original and corrected sentences (`changedWordIndices`), not by
  anything the model returns.
- **Gloss panel:** `groupGlossByLemma` merges words that share a lemma into one
  row (joined with "…" when the words aren't next to each other). The panel
  stays mounted and is collapsed with CSS so it can animate, and it's `inert`
  when closed so keyboard and screen-reader users can't reach hidden buttons.
- Level changes write the cookie and, if signed in, call `saveLevel`. The
  theme is stored in localStorage (`starfinch_theme`, falling back to the
  pre-rename `starprache_theme` on read), and every access is
  wrapped in try/catch.

### 8.3 Other surfaces

- `SiteHeader`: level select, chats menu (open, delete with confirm modal),
  remaining-message indicator for anonymous visitors, theme toggle, sign
  in/out.
- `/vocab`: saved words newest first, with example sentence and source, and a
  remove button that calls `deleteVocabAction`.
- `ConfirmProvider` / `useConfirm()`: a confirm dialog returned as a promise.

## 9. Evals

`npm run eval [correction|gloss]` runs `scripts/run-evals.ts` through `tsx`
with `.env.local`, calling `detectCorrection` and `glossText` directly.

| Suite | Cases | Pass rule | Expected |
|---|---|---|---|
| correction (`evals/cases.ts`) | 20 | `hasMistake` matches, and `mistakeType` matches when specified. Includes clean sentences and A1-vs-C1 pairs. | 19–20/20 (`auxiliary-verb-1` flips between runs because of Groq non-determinism) |
| gloss (`evals/gloss-cases.ts`) | 17 | Each listed word gets an accepted lemma (case- and whitespace-insensitive) in **all 3 runs** | all pass |

- `withRateLimitRetry` waits as long as Groq's 429 message asks, so hitting
  the free tier's 8k tokens/min limit doesn't count as a failed case.
- Gloss cases run one at a time and take a few minutes.
- **Nothing runs evals automatically.** There's no CI and no git hook. Run
  them after any change to `lib/prompts.ts`, `lib/tutor.ts` or `lib/gloss.ts`.

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

## 11. Plan vs. implementation

| PLAN.md says | The code does |
|---|---|
| Step 3 "in progress"; Google OAuth ⬜; vocab CRUD ⬜ | **Done.** Google OAuth works; saving and deleting vocab work through Server Actions |
| Step 4 rate limiting not started | **Done.** 5-message anonymous cap (`session.service.ts`) |
| Vocab extraction is deterministic (tokenize → lemmatize → stopwords) | **LLM-derived lemmas** from the gloss call. The deterministic stopword path and the chips were built and are now deprecated |
| Vocab candidates shown as chips under each reply | Replaced by **+ buttons in the gloss panel** (`vocab-chips.tsx` and `getVocabCandidates` kept, deprecated) |
| `/app/api/vocab/*` REST routes | **Server Actions** (`app/vocab/actions.ts`) |
| `lib/usage.ts` | `lib/services/usage.service.ts`, persisting to `token_usage` |
| `token_usage.endpoint` ∈ chat, correction | Also `gloss` (migration 0002) |
| Two LLM calls per turn | **Three** (reply, correction, gloss) |
| — | Not in the plan: conversation history with reopen/delete, persisted annotations (0003), error toasts, confirm modal, theme toggle, conversation starters, gloss eval suite |
| Step 5 Grammar RAG, step 6 memory RAG, step 7 UI pass | **Not started.** No Pinecone, no embeddings. `getMistakesByType()` exists but nothing calls it yet |

## 12. Known limitations and tradeoffs

- **Rate-limit race:** read-then-write, not an atomic increment, so two
  simultaneous requests from one anonymous session can go one message over
  the cap. Accepted at this scale.
- **The whole message list is sent every turn.** Nothing trims history before
  `streamText`, so the reply prompt grows with the conversation.
- **The model name is repeated three times** (`CHAT_MODEL`,
  `CORRECTION_MODEL`, `GLOSS_MODEL`) and the Groq provider is imported in each
  file. There's no single place to switch model or provider.
- **The mistake taxonomy is in sync by hand** between TypeScript and the SQL
  CHECK constraint.
- **Row types are hand-written.** They drift if a migration changes and
  `lib/types/db.ts` isn't updated.
- **Lemmas depend on the model.** The gloss eval guards the known-hard cases,
  but a new construction can still get an inconsistent lemma and end up saved
  twice.
- **Old JSONB rows** can lack newer gloss fields. Readers must keep their
  fallbacks.
- **No automated tests or CI.** Evals are run by hand.
