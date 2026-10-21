# Starvogel — Technical Documentation

> State of the codebase as of 2026-10-21 (`804f84d` plus local, uncommitted UI changes). This describes
> what is **built**. Feature status is in [ROADMAP.md](../ROADMAP.md); design
> notes live in local `plans/*.md` files that aren't committed. For the
> user-facing overview, see [README.md](../README.md). Where a plan and the
> code disagree, the code is right. Section 11 lists where the build departed
> from the original design.
> The original UX findings and current verification gaps are recorded in [UI_AUDIT.md](UI_AUDIT.md).
>
> **Recent changes since the F2 baseline (2026-10-10):** Message limits are now daily and apply to everyone: 5 a day anonymous,
> 35 a day signed in, plus a global cap on the whole app, all counted in
> `daily_usage` (migration 0007) through the atomic `consume_message()`
> function. `session_usage` is no longer written. See §4.1, §6 and §7.4.
> Signing up with an email now needs the address confirmed: the
> confirmation email carries a numeric code that is entered on a second
> login screen (`verifySignupCode`), with `/auth/confirm` kept as a link
> fallback. See §7.2. Adding Supabase's confirmation template and custom
> SMTP are dashboard settings, not code (§10).
> Ask, its eval suite, the refreshed UI/theme, and formatted grammar explanations
> are also present in this revision (§1, §8, §9).

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

Starvogel is a German conversation tutor: a specific persona (currently
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

The **Ask side panel** has its own `POST /api/ask` route. Signed-in learners
can ask a question or paste a sentence; one `openai/gpt-oss-20b` call returns
a short answer, or a translation with one or two grammar notes. Ask receives
only six recent chat messages and four recent panel turns, each clipped to
420 characters. The panel thread stays in client memory for the current page
visit and does not become roleplay history. The Ask button in the chat header
opens a sign-up modal for anonymous visitors; the route independently returns 401
before quota or Groq use.

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

POST /api/ask ─────────────────────────► route.ts (signed-in Ask submission)
   ◄── plain-text stream ─────────────────── streamAskAnswer (20B) ──────────► Groq
```

## 2. Stack and runtime

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js **16.3.4**, App Router, React 19.2 | `middleware.ts` is renamed `proxy.ts` in Next 16 |
| Language | TypeScript 5 | `@/` path alias to repo root |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`) | Theme tokens in `app/globals.css`; light/dark via `data-theme` |
| AI | Vercel AI SDK v6 (`ai`, `@ai-sdk/react`, `@ai-sdk/groq`) | Groq called directly with the project's own key, not through AI Gateway |
| Model | `openai/gpt-oss-120b` for the three chat calls and grammar explanations; `openai/gpt-oss-20b` for Ask | Groq direct, low reasoning effort |
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
  chat.tsx                 Client orchestrator: useChat, conversation state, word saving, explain-grammar
  layout.tsx               Root layout, fonts, <ConfirmProvider>, <AppToaster>
  globals.css              Tailwind v4 + theme tokens, gloss-panel transitions
  api/chat/route.ts        POST /api/chat — thin controller
  api/ask/route.ts         POST /api/ask — signed-in short-answer text stream
  api/explain/route.ts     POST /api/explain — on-demand grammar explanation, text/plain stream
  auth/actions.ts          Server Actions: signIn, signUp, verifySignupCode, resendConfirmation,
                           signInWithGoogle, signOut, saveLevel, saveTimezone
  auth/callback/route.ts   OAuth code → session exchange
  auth/confirm/route.ts    Email-link fallback: token_hash → verifyOtp → session
  conversations/actions.ts deleteConversationAction
  vocab/                   /vocab page; vocab-browser (list <-> session switch + "Start session");
                           vocab-grid (tap-to-reveal word cards); flashcard-session (Anki-style
                           flip-card session); actions: saveVocabAction, deleteVocabAction,
                           startSessionAction, gradeCardAction
  review/page.tsx          redirects to /vocab (old links)
  login/page.tsx           Email/password + Google sign-in form, and the "enter the code"
                           screen (ConfirmCodeScreen) shown after signup; `?mode=signup` opens registration
  components/              chat/ (thread, welcome state, composer, Ask side panel and rate-limit UI),
                           PageHeader (SiteHeader plus level/theme state for /vocab),
                           SiteHeader (level, chats menu, vocab link with due badge, sign-out; now a 1080px sibling of the
                           860px content column, not nested inside it), Brand, ConfirmModal, Toaster,
                           GlossedText (per-word hover/tap menu + save), TranslationPanel (sentence
                           translation + explain-grammar), PersonaAvatar, vocab-chips (DEPRECATED)
  hooks/use-theme.ts       Shared localStorage-backed theme store for chat and non-chat headers
lib/
  chat-request.ts          Runtime validation, request limits, and text-only model-history sanitizer
  prompts.ts               Every system prompt: persona + level + turn-by-turn question guidance for
                           the reply, STRICTNESS_BY_LEVEL + English-stand-in rules for the correction,
                           buildGlossSystemPrompt, buildGrammarExplanationPrompt, LEMMA_RULES
  reply.ts                 replySettings(level, persona, previousReply) — the reply call's model,
                           system prompt and provider options, shared by chat.service.ts and the
                           reply-level eval so both exercise identical settings
  ask.ts                   streamAskAnswer() — concise Ask prompt, Groq 20B model and usage logging
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
                           English->German fallback) + checkAnswer (umlaut substitutes, case note).
                           Currently unused by the UI; kept for typed/grammar cards (F4)
  text.ts                  stripPunctuation, changedWordIndices, sentenceContaining (moved out of
                           chat.tsx / glossed-text.tsx so the server can use them)
  *.test.ts                Unit tests for request validation, srs, cloze and text (`npm test`)
  stopwords.ts             DEPRECATED (only used by the deprecated chips)
  services/                One module per table, plus chat.service (orchestration), persona.service,
                           card.service (review queue, due count, recordReview over cards + review_logs)
                           (read-only personas lookups)
  supabase/                client.ts (browser), server.ts (per-request), proxy.ts (session refresh),
                           service-role.ts (RLS-bypassing PostgREST client)
  types/db.ts              Hand-written row types mirroring the migrations (incl. Persona,
                           conversations.persona_id, messages.grammar_explanation, and from 0005
                           Card, CardSchedule, ReviewLog, Profile.timezone)
evals/                     cases.ts (24 correction cases, now incl. English-stand-in cases),
                           gloss-cases.ts (17 lemma cases), reply-level-cases.ts (A1/A2 sentence-length
                           and tense limits, helper-phrasing check, question-share over a scripted chat)
scripts/run-evals.ts       Eval runner — correction | gloss | reply
scripts/docs-status.sh     `npm run docs:status`: code commits the docs haven't caught up with
.github/workflows/         docs-sync.yml warns on stale docs; quality.yml requires test/lint/build
supabase/migrations/       0001 schema + RLS, 0002 gloss endpoint, 0003 annotations + titles,
                           0004 personas + persona_id + grammar_explanation + 'explain' usage endpoint,
                           0005 flashcards (cards, review_logs, vocab-card trigger, record_review, timezone),
                           0006 reverse cards (cards.direction, two cards per word, backfill),
                           0007 daily_usage + consume_message() (daily limits and the global cap)
supabase/email-templates/  confirm-signup.html, pasted by hand into Supabase → Authentication →
                           Emails (not deployed by anything)
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

1. Read a body of at most 128,000 characters, then validate
   `{ messages, conversationId, level }` with `lib/chat-request.ts`. The client
   sends the whole message list, as `useChat` does by default, plus the level
   currently shown in its own UI. Validation caps the transcript at 40
   messages / 48,000 text characters, requires a final non-empty user message,
   validates the optional conversation UUID and CEFR level, and discards all
   UI-only data parts before the history reaches the model. Invalid requests
   return 400/413 before authentication, quota use, persistence, or Groq.
2. `getCurrentUserId()` uses `supabase.auth.getUser()`, which checks the token
   with Supabase instead of trusting the cookie.
3. **Daily limit, for everyone:** `consumeMessage(userId)` takes one message
   from the caller's allowance (`user:<uuid>`, or `anon:<session cookie>`,
   where `getSessionId()` reads or creates the httpOnly `session_id` cookie)
   and from the app-wide `global` one, in a single `consume_message()` call
   (§7.4). If either is spent, the route returns a stream holding one
   `data-rateLimited` part (`{cap, reason: 'user' | 'global', signedIn}`) and
   **makes no Groq call**.
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
| `data-rateLimited` | `{cap, reason: 'user' \| 'global', signedIn}` | route, instead of everything | no |
| `data-notice` | `{source, message}` | any failing branch | no (transient) |

## 5. LLM layer

### 5.1 Calls

| Function | File | AI SDK call | Temperature | Schema |
|---|---|---|---|---|
| reply | `lib/reply.ts` (settings) + `lib/services/chat.service.ts` (call site) | `streamText` | default | — |
| `detectCorrection()` | `lib/tutor.ts` | `generateObject` | 0 | `CorrectionSchema` |
| `glossText()` | `lib/gloss.ts` | `generateObject` | 0 | `{ translation: z.string(), words: WordGlossSchema }` |
| `streamGrammarExplanation()` | `lib/explain.ts` | `streamText` | default | — (plain text, not structured) |
| `streamAskAnswer()` | `lib/ask.ts` | `streamText` on `openai/gpt-oss-20b` | 0.2 | — (plain text, 160 output tokens max) |

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

**`/api/ask` (on demand, signed-in only):** accepts a question or sentence up
to 500 characters, the current CEFR level, up to six recent roleplay messages,
and up to four recent panel turns. The route enforces a 9,000-character body
limit and clips each context message to 420 characters. It returns 401 for an
anonymous caller before `consumeMessage`; a successful request spends one
daily message and streams plain text. The model prompt treats a bare German
sentence as a request for an English translation and a brief grammar
breakdown, and a bare English sentence as a request for a German translation
with a brief grammar note. It asks for at most 50 words. The Ask transcript
is client-only, not persisted or sent to the roleplay model. Ask usage is
currently recorded under the existing `explain` token-usage category because
the database endpoint constraint has no `ask` value.

**`/api/explain` (on demand, not part of the per-message calls):** takes
`{ kind: 'reply' | 'correction', text, original?, level, messageId? }`. With a
signed-in user and a `messageId`, it reads the text to explain from that
database row (not from the request body) and, if that row already has a
`grammar_explanation`, returns it without calling the model at all — so
reopening an explanation is free. Otherwise it streams a new one and saves it
onto the row via `annotateMessage`. Without a usable `messageId` (anonymous,
or a turn whose rows failed to save), it explains the text sent in the
request and saves nothing. A fresh explanation, signed in or not, spends one
message of the same daily allowance chat uses (`consumeMessage`), checked
before the model call; a cached one costs nothing. Over the limit it answers
429 with `{reason, signedIn}`, and a successful response carries the new
allowance in an `X-Messages-Remaining` header.

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
- **`buildCorrectionSystemPrompt(level)`**: level-based leniency/category logic
  (`STRICTNESS_BY_LEVEL[level]`, the "decide hasMistake as if the category
  list didn't exist" instruction, category tie-break rules), plus a new
  English-stand-in block: when the learner substitutes English words for ones
  they don't know, `usedEnglish` is set and judged entirely separately from
  `hasMistake` — an English stand-in is never itself a mistake — but
  `correction`/`correctionTranslation`/`correctionGloss`/`explanation` are
  still filled in (the all-German version of the sentence), so the UI has
  something to show even when there's no grammar mistake to flag. Capitalization
  and missing keyboard characters (umlauts and ß) alone do not trigger a
  correction; a final check in `lib/tutor.ts` suppresses orthographic-only
  verdicts that the model still returns. Plus `LEMMA_RULES`.
- **`buildGlossSystemPrompt()`**: now asks for the whole-text translation
  first, then one entry per word as before (punctuation stripped, meaning in
  this sentence), plus `LEMMA_RULES`.
- **`buildGrammarExplanationPrompt(level, kind)`**: short `• ` bullet lines with
  bold German phrases explaining either a reply's notable grammar points or
  the rule behind a correction, capped around 120 words. The panel renders
  bullets and bold text without accepting arbitrary Markdown or HTML.

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
| `daily_usage` (0007) | `(key, day)` PK, `message_count`. Keys: `user:<uuid>`, `anon:<session>`, `global`; days roll over at 00:00 UTC | `consume_message()` RPC (service role) | **RLS on, zero policies**: invisible to every client |
| `session_usage` | `session_id` PK, `message_count` | nothing since 0007; left in place | **RLS on, zero policies** |
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
| Service role | `lib/supabase/service-role.ts` | A bare `PostgrestClient` that **bypasses RLS**. Server-only, and only for `daily_usage` and `token_usage`. |

The service-role client uses `PostgrestClient` directly instead of
supabase-js because supabase-js always builds a Realtime client, which throws
on Node < 22 without a native WebSocket. That broke logging in the eval
runner.

### 7.2 Auth flows

- **Email/password:** `signIn` / `signUp` Server Actions set the cookies on the
  same response that redirects, so there's no flash of signed-out UI.
- **Email confirmation (code):** the Supabase project has "Confirm email" on, so
  `signUp` returns no session and the page switches to `ConfirmCodeScreen`.
  The confirmation email carries a numeric code (`{{ .Token }}` in the
  "Confirm signup" template; the project issues 8 digits, the input accepts
  6–10). `verifySignupCode` calls `verifyOtp({ email, token, type: 'email' })`,
  which sets the session on the response that redirects. A code is used
  instead of a link because a link can be spent by an email scanner before the
  person opens it, and a code works from any device. "Send a new code" is
  `resendConfirmation`. Signing in with the right password but an unconfirmed
  address re-sends a code and opens the same screen.
- **Email confirmation (link, fallback):** `app/auth/confirm/route.ts` takes
  `token_hash` and `type`, calls `verifyOtp`, and redirects to `/`, or to
  `/login?error=confirm_failed`. It's only reached if the template still
  carries a link. It verifies `token_hash` directly, so unlike the PKCE
  `/auth/callback` it works in a different browser from the one that signed up.
- **No account enumeration:** signing up with an address that already exists
  returns no error and no session, the same as a new one, so it lands on the
  code screen too. No new code is sent for an existing account; the screen
  says so and points to "Already have an account? Sign in".
- **Password recovery:** `/login/reset` requests a recovery email through
  Supabase Auth. The recovery link returns through `/auth/callback` to the
  reset form, where `updateUser` sets the new password. Redirect destinations
  are restricted to local app paths.
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

### 7.4 Daily message limits

Everyone has a daily allowance, counted in `daily_usage` (migration 0007),
keyed by who is asking, with days rolling over at 00:00 UTC:

| Key | Who | Cap |
|---|---|---|
| `anon:<session cookie>` | an anonymous browser | `ANON_DAILY_CAP` = 5 |
| `user:<uuid>` | a signed-in account | `USER_DAILY_CAP` = 35 |
| `global` | the whole app | `GLOBAL_DAILY_MESSAGE_CAP` env var, default 300 |

The caps are in `lib/services/session.service.ts`. A chat message costs one, and
so does a freshly generated grammar explanation (cached ones are free).

- **Atomic:** `consume_message(p_key, p_cap, p_global_cap)` is one Postgres
  function. It takes the global slot first, then the caller's, each with a
  single `INSERT … ON CONFLICT DO UPDATE … WHERE count < cap`, which Postgres
  serialises per row, so two concurrent requests can't both take the last
  slot. If the caller is over their own cap, the global slot is handed back,
  so a capped-out user doesn't eat the shared budget.
- **Checked before any model call**, so a refused request costs no tokens.
- **Fails closed:** if the counter can't be reached, the request is refused
  rather than let through, because this is the guard on the budget.
- **Unreachable from clients:** the table has RLS on with zero policies, and
  `consume_message` has `EXECUTE` revoked from `public`, `anon` and
  `authenticated`. Only the service role calls it.
- **Anonymous identity** is the httpOnly `session_id` cookie. Clearing
  cookies or using incognito gives a fresh bucket; the global cap is the
  backstop for that.
- **Showing the allowance:** `getRemainingMessages()` reads the counter
  without writing anything (a Server Component can't set the cookie), and
  doesn't look at the global one. The global limit only shows up as the
  "tutor is resting" notice when someone actually sends.

## 8. Frontend

### 8.1 `app/page.tsx` (Server Component)

- Loads the user, level, persona (the conversation's own, or the default —
  `resolvePersona()`), the remaining daily messages, conversation list, the
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

### 8.2 Chat client (`app/chat.tsx` and `app/components/chat/`)

`app/chat.tsx` owns state and side effects. The presentation layer lives in
`app/components/chat/chat-content.tsx`: `ChatWelcome`, `ChatThread`, and
`ChatComposer`. Keeping API streaming, optimistic persistence, and quota state
in the orchestrator prevents leaf UI components from becoming alternate
sources of truth while allowing them to change independently.

- `useChat<LangTutorUIMessage>` with `onError` (toast) and `onData` (turns
  `data-notice` parts into toasts, using the notice source as the toast id so
  repeats replace each other instead of stacking). A transient `data-quota`
  part updates the allowance after a chat request; `useQuota` also refreshes
  it after errors, on focus, and at UTC rollover.
- `QuotaBanner` sits directly above the composer for personal limits, the
  shared app cap, or a counter outage. `/api/quota` and the initial page load
  read both counters without spending a message. Ask and fresh explanations
  report quota changes to the same client state.
- The chat column fills the viewport and scrolls its welcome or message area
  inside it, keeping the composer visible on a phone-sized screen.
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
  decides whether a `Correction` has anything to render at all, used both in
  `ChatThread` and in `chat.service.ts`'s failure check (§4.3).
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
- **Ask side panel:** an Ask button beside the header's daily allowance opens a full-height,
  native modal dialog; its chevron closes it. For anonymous visitors, the tab
  opens the shared native confirmation dialog and "Create account" navigates
  to `/login?mode=signup`. The Ask route enforces the same boundary server-side.
  The panel has Ask and Words views. Ask reads the `/api/ask` text stream using
  `fetch` and keeps its turns in React state for the current page visit; Words
  filters existing reply and correction glosses without a model call.
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
  remaining-message indicator ("free trial" when signed out, "today" when
  signed in), theme toggle, sign
  in/out. Now rendered as a sibling of the 860px content column, in its own
  1080px-wide wrapper (`app/chat.tsx`, `app/vocab/page.tsx`, `app/login/page.tsx`
  each changed their top-level layout for this), rather than nested inside
  that column — wider chrome without widening the reply text's line length.
- `/vocab`: `VocabGrid` (`app/vocab/vocab-grid.tsx`) renders saved words as a
  responsive grid of click-to-reveal cards (lemma always visible; translation
  and example sentence hidden until tapped), with search, sort, filters,
  ready status, and a page-level "show all / hide all" toggle. A card's own
  flip state and the toggle combine with XOR,
  so toggling "show all" clears individual flips rather than fighting them.
  Resets to all-hidden on every page load/navigation by design — it's meant
  to double as light self-testing, not a persistent reading view. Replaced
  the earlier flat list. A revealed card is tinted with a faint wash of
  `--accent-ink` (`bg-accent-ink/[0.08]`), not `bg-soft`: `--soft` is too
  close to `--panel` in both themes for the two states to read as different.
- **Flashcard session** (`app/vocab/vocab-browser.tsx`, `flashcard-session.tsx`):
  `/vocab` shows **Review due words** and **Extra practice** separately.
  `startSessionAction()` loads the chosen queue on click and returns plain
  card data. The session replaces the grid, then automatically returns to it
  with a completion summary when its available cards are done.
  - Anki-style flip card: the German lemma shows, **Show answer** (Space /
    Enter) reveals the meaning and the saved example sentence, then four
    buttons (Again / Hard / Good / Easy, keys 1-4), each labelled with when
    the card returns (`previewIntervals` + `formatInterval`).
  - Grading awaits `gradeCardAction`. Each card appears once per round;
    learning steps scheduled for later stay for another round. A failed save
    keeps the card on screen for retry. A stale card asks the learner to
    reload the queue.
  - Every grade is logged with `surface = 'review_page'` (the only surface
    value besides `panel`, kept as is) and the time taken. `answer_given` is
    null, since nothing is typed.
  - Words missing a meaning are marked on the grid and excluded from review.
- **Extra practice** (`getPracticeQueue()`): an explicit on-demand round of
  review cards due tomorrow or later, followed by new cards past today's
  allowance. Waiting cards and words already reviewed today are excluded.
  These are graded with the same FSRS scheduler.
- **Two directions per word (migration 0006):** `cards.direction` is
  `forward` (German → meaning) or `reverse` (meaning → German, production).
  The trigger creates both when a word is saved, and 0006 backfills reverse
  cards for existing words. `UNIQUE (vocab_entry_id)` became `UNIQUE
  (vocab_entry_id, direction)`. A session holds at most one card per word
  (siblings are buried until the next session, so one answer doesn't give
  away the other); the other direction is buried for that day. A reverse card is skipped when the word has no saved
  translation. Code treats a missing `direction` as `forward`, so it runs
  before 0006 is applied, just without reverse cards.
- **Front sentence toggle:** a checkbox on the card shows
  the saved example on a forward card's front (remembered in
  `localStorage`).
- **Timezone:** `SiteHeader` calls `saveTimezone` once per browser session,
  writing the browser's IANA zone to `profiles.timezone`, so the 4am day start
  is the learner's, not UTC's.
- **New-word discovery (starter vocab):** `discoverWordsAction` separately
  offers up to 3 words from `lib/starter-vocab/{a1,a2,b1}.json` the learner
  hasn't saved. The meaning is generated and shown before the learner can
  choose **Add to my vocabulary**; the add action saves a normal `new_word`
  entry and the trigger makes its cards. Skips are kept in browser
  `localStorage`. The source-list licence remains unresolved (§12), so this
  entry point must not be published until permission or replacement is secured.
- **Starter data:** `scripts/import-wordlist.ts` parses the Goethe-Institut
  TSV lists (github.com/ilkermeliksitki/goethe-institute-wordlist) into the
  JSON files: cleaned lemma ("die Adresse,-en" → "die Adresse"), one entry
  per lemma at its lowest level. About 640 A1, 540 A2 and 1,700 B1 words.
- `/review` is a one-line redirect to `/vocab`.
- **Due badge:** `SiteHeader` shows the number of reviewable words in the
  queue on the `vocab` link. `app/page.tsx` and `/vocab` compute it with
  `getDueCount()` on each load; `gradeCardAction` revalidates the layout.
- `ConfirmProvider` / `useConfirm()`: a confirm dialog returned as a promise.

## 9. Evals

`npm run eval [correction|gloss|reply|ask]` runs `scripts/run-evals.ts` through
`tsx` with `.env.local`, calling `detectCorrection`, `glossText`, the reply
model (via `lib/reply.ts`'s `replySettings()`) and Ask (via `lib/ask.ts`'s
`askSettings()`) directly. The shared Ask settings let evals use the same
prompt and generation parameters without logging eval usage to `token_usage`.

| Suite | Cases | Pass rule | Expected |
|---|---|---|---|
| correction (`evals/cases.ts`) | 27 | `hasMistake` matches, `mistakeType` matches when specified, and `usedEnglish` matches when specified. Includes clean sentences, A1-vs-C1 pairs, English stand-ins, and capitalization/keyboard-spelling controls. | Earlier 24-case baseline: 19–20/20 of the original 20 (`auxiliary-verb-1` flips between runs); the 4 English cases passed steadily. The 3 new spelling cases await a live run. |
| gloss (`evals/gloss-cases.ts`) | 17 | Each listed word gets an accepted lemma (case- and whitespace-insensitive) in **all 3 runs**; every run's sentence `translation` must be non-empty | all pass |
| reply (`evals/reply-level-cases.ts`) | 12 reply cases + 1 scripted 8-turn conversation | Per case: A1/A2 replies stay within their sentence-count/length/tense limits (`REPLY_LIMITS`), no helper phrasing (`HELPER_PHRASES`), and an English stand-in comes back used in German (`expectContains`). Across the scripted conversation: at most half the replies end in a question (`MAX_QUESTION_SHARE`), checked turn-by-turn against the real `buildTurnGuidance()` behavior, not just a static sample. | all pass as of the prompt in `lib/prompts.ts` as of 2026-09-30 |
| ask (`evals/ask-cases.ts`) | 8 sentence/question cases | Two-line format for bare phrases, direct-answer format for questions, required translation/rule fragments, and rejection of known wrong case/tense claims. Prints every answer for manual German review; one run is not a reliability estimate. | 20B repeatedly failed the `auf das Wochenende` case; 120B scored 7–8/8 across two runs but once called mixed adjective inflection "weak" |

- `withRateLimitRetry` waits as long as Groq's 429 message asks, so hitting
  the free tier's 8k tokens/min limit doesn't count as a failed case. It also
  doesn't protect against Groq's **daily** token cap (200k tokens/day on the
  free/on-demand tier) — that one isn't retryable within a run, and a day of
  repeated full-suite runs can exhaust it and start 429ing live chat too, so
  run only the suite a change actually touches.
- Gloss cases run one at a time and take a few minutes. The reply suite's
  question-share check runs its 8 turns sequentially (each depends on the
  previous reply, for `buildTurnGuidance`), so it's not parallelizable either.
- Ask defaults to `openai/gpt-oss-20b`. Run
  `ASK_EVAL_MODEL=openai/gpt-oss-120b npm run eval -- ask` to compare with the
  main-chat model. The runner reports token totals, not current dollar cost.
- **Nothing runs model evals automatically.** They make real Groq calls. CI
  runs deterministic unit tests, lint, and a production build in
  `quality.yml`, while `docs-sync.yml` checks whether this doc is behind the
  code. Run the relevant eval suite after any change to `lib/prompts.ts`,
  `lib/tutor.ts`, `lib/gloss.ts` or `lib/ask.ts`.

## 10. Configuration and deployment

### Environment

| Variable | Scope | Used by |
|---|---|---|
| `GROQ_API_KEY` | server | all LLM calls, evals |
| `NEXT_PUBLIC_SUPABASE_URL` | public | all Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | browser, server and proxy clients |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | `daily_usage`, `token_usage` |
| `GLOBAL_DAILY_MESSAGE_CAP` | server, optional | messages the whole app serves per UTC day (`session.service.ts`); defaults to 300. Set it in Vercel as well as `.env.local` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | server | planned (grammar RAG embeddings), unused |

The Groq project used by `GROQ_API_KEY` must allow `openai/gpt-oss-20b`
for Ask. If project model permissions use an "Only Allow" list, add the model
under Groq → Settings → Projects → Limits. The model was enabled and three
live Ask calls succeeded on 2026-10-20.

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
- **Email confirmation is configured in the Supabase dashboard, not in code:**
  Authentication → "Confirm email" on, the "Confirm signup" template pasted
  from `supabase/email-templates/confirm-signup.html` (it must contain
  `{{ .Token }}`), and custom SMTP. The built-in Supabase mailer is for
  testing only, with a very low hourly cap and restricted recipients, so
  signups beyond the team won't get their code without custom SMTP and a
  verified sending domain.

## 11. Design vs. implementation

Where the build departed from the original v1 design. Whether a feature is
done is in [ROADMAP.md](../ROADMAP.md), not here.

| Originally designed | The code does |
|---|---|
| Rate limit for anonymous visitors only: a 5-message lifetime cap, signed-in users uncapped | **Daily limits for everyone** (5 anonymous, 35 signed in, plus a global cap), counted per UTC day in `daily_usage` (§7.4). Added before launch, so a public domain doesn't expose the Groq budget |
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

- **An anonymous bucket resets when cookies are cleared.** The limit is keyed
  on the `session_id` cookie, so incognito or clearing cookies gives a fresh 5
  messages. The global cap bounds the damage; per-IP buckets are the next step
  if it gets abused.
- **Some model spend isn't counted against the daily limit:** starter-vocab
  translations (`lib/starter-vocab/translate.ts`) call the model but don't
  call `consumeMessage`.
- **Verification doesn't stop throwaway inboxes.** A code proves the person
  controls an address, not that it's a real one. A CAPTCHA on signup is the
  usual next step.
- **A message-limit counter outage locks everyone out.** `consumeMessage`
  fails closed on purpose, so a Supabase hiccup reads as "tutor is resting".
- **The persona has no avatar image.** `avatar_url` is `null` for the seeded
  row; `PersonaAvatar` falls back to an initial badge everywhere. Several
  generated-art options were tried and rejected (see git history around
  `lib/personas.ts` and `public/avatars/`); the project doesn't want
  AI-generated art, so this needs real artwork, not another generation
  attempt.
- **The whole message list is sent every turn.** Nothing trims history before
  `streamText`, so the reply prompt grows with the conversation.
- **The model name is repeated across call sites** (`lib/reply.ts`'s
  `CHAT_MODEL`, plus a `CORRECTION_MODEL`/`GLOSS_MODEL`/`EXPLAIN_MODEL`/`ASK_MODEL`
  constant in `tutor.ts`/`gloss.ts`/`explain.ts`/`ask.ts`) and the Groq
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
- **Unit tests cover pure functions** including scheduling, review selection,
  quota parsing, and safe auth redirects. Services, routes and UI have no
  automated integration tests; evals are run by hand.
- **Reviewing only works from `/vocab`** until F3 puts cards in the chat
  panel. `profiles.timezone` is set from the browser on the first page load of a
  session, and stays `UTC` until then.
- **Review selection has pure-function tests,** but saving a grade and
  returning to the grid have not had a live browser/database test.
- **`lib/cloze.ts` is dead weight for now.** The flip-card session doesn't
  use it. It has tests and is the intended basis for grammar cards (F4); delete
  it if F4 goes another way.
- **Starter words have no per-word translation in the source,** only a
  sentence and its translation; the word's meaning is generated when the
  learner reveals it in discovery. The source lists are Goethe-Institut material,
  reached through a third-party GitHub repo
  (`ilkermeliksitki/goethe-institute-wordlist`) that declares no licence. The
  Goethe PDFs assert copyright, so the right to ship these ~2,900 words and
  example sentences hasn't been established. The parser also leaves some noise
  (a few conjugated headwords such as "packt ein").
- **Skipped starter words are remembered per browser only**, so another
  device can offer them again.
- **No suspend / undo / leech handling yet** (F5). Suspending needs a way to
  un-suspend, so it ships with that UI.
- **A session is the whole queue** (up to `NEW_PER_DAY` new + due reviews,
  capped at `REVIEWS_PER_DAY`), not a fixed-size batch.
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
- **A confirmation link can be spent by an email scanner.** Corporate and
  provider scanners open links before the person does, and `/auth/confirm`
  verifies on a plain GET. That's why the email carries a code and the link is
  only a fallback, and why a template carrying *both* is a trap: opening the
  link uses up the code. §7.2.
- **`signUp` for an existing address succeeds silently** with no session and no
  new email, by design (no account enumeration). A user who "never got the
  code" may simply already have an account. §7.2.
- **`consume_message` is security definer with its execute grant revoked.**
  The default `PUBLIC` grant would otherwise let any browser call it through
  the REST API and burn another caller's allowance. §7.4.
