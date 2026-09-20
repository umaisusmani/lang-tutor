# starprache — Phase 2 Plan (SRS + Recasting + Personas)

> Builds on `PLAN.md` (v1). Not started — v1's build order (steps 3-7) ships
> first. This doc exists so the phase 2 ideas don't get lost, and so v1's
> schema/taxonomy decisions can be made with phase 2 in mind where cheap to
> do so (e.g. don't paint the vocab schema into a corner).

## Context

v1 validates the core loop: level-aware chat, out-of-band correction, vocab
candidates, grammar RAG, conversation memory RAG. Phase 2 turns that into a
genuine three-method system — immersion (chat), vocab (SRS flashcards), and
grammar (SRS-scheduled drills from the learner's own recurring mistakes) —
instead of three disconnected features that happen to share a database.

Guiding principle carried over from v1: reuse existing infrastructure
(`mistake_history`, `mistake_types.ts`, `vocab_entries`) rather than building
a second parallel system for cards. A flashcard is a *review schedule*
attached to data you already capture, not a new content type.

## Feature set (phase 2)

1. **In-conversation recasting** — the reply-generation prompt (not just the
   correction-detection pass) is told to quietly use the corrected form in
   its own reply when the learner makes a mistake, without calling attention
   to it. Costs nothing extra: both calls already run concurrently off the
   same user message; this only changes the reply prompt's instructions.
2. **Level-gated glossing** — A1/A2 keep the current always-available gloss.
   B1+ requires an explicit tap/reveal per sentence instead of a persistent
   hover affordance, so higher levels have to attempt inference before
   getting the answer. Pure UI + prompt-context change, no new data.
3. **Vocab flashcards (SM-2 scheduling)** — `vocab_entries` gains scheduling
   columns; a review queue and review UI let the learner drill due cards.
   Cards default to cloze-style using the entry's own `example_sentence`
   (already captured) rather than a bare term/translation pair.
4. **Grammar drill cards from recurring mistakes** — when a `mistake_type`
   recurs for a user (2nd+ occurrence, queried from `mistake_history`), a
   cloze card is generated from the learner's own flagged sentence (the
   *wrong* word blanked, not just re-showing the correction as text). Shares
   the same review schedule and queue as vocab cards, tagged by source so the
   UI can distinguish them if needed, but reviewed together.
5. **Interleaved review** — due cards (vocab or grammar) surface inline in
   the chat side panel after every N exchanges, instead of requiring a
   separate "flashcards" screen/mode. A dedicated full review view still
   exists for catching up on a large backlog, but it's not the primary path.
6. **Scenario personas** — a `persona` selector alongside the existing
   `cefr_level` one, changing the system prompt's role/register/implicit
   goal (e.g. Bürgeramt clerk, barista, a friend catching up). Each persona
   can optionally imply a target vocab domain and a soft session goal (e.g.
   the barista persona doesn't end the "order" until drink + size + name have
   come up), nudging elicitation rather than leaving it fully learner-led.
7. **Tutor-initiated topics** — occasionally, the tutor steers rather than
   only reactively asking follow-ups (e.g. "Erzähl mir von deinem
   Wochenende"), so long sessions don't flatten into the same handful of
   exchanges repeating.

Explicitly out of scope for phase 2 (same reasoning as v1's out-of-scope
list — revisit only after these ship and get used): audio/TTS on cards,
image-based cards, community/shared decks, mobile app.

**Target proficiency ceiling: A1-B2, not C1.** Confirmed decision, not a
gap to fill later. At C1 the value proposition weakens (a learner at that
level wants native content and real people, not a Groq-hosted model whose
German hasn't been independently vetted for that level of nuance), so
personas, memory RAG, and drill design should all be built and tuned
against A1-B2, without spending effort making the conversational tone hold
up at C1.

## Idea validation

Plan: post in communities where "I built a tool, want feedback" is a
native genre rather than self-promo spam — r/German and r/languagelearning
(check each sub's rules first; most restrict this to weekly resource
threads or dedicated self-promo posts), plus Discord servers built around
other language-learning tools/methods, which tend to have higher-intent
users actively looking for something better.

Ask for behavior, not opinions: give testers a concrete task ("order a
coffee in German with it, tell me where it breaks") rather than "what do
you think?" — and ask A1/A2 and B1/B2 testers separately, since they'll
hit different walls (A1/A2: does the leniency/glossing actually help;
B1/B2: does it hold attention past the first few sessions, i.e. exactly
the gap phase 2 is meant to close). Keep this separate from any
build-in-public posts (r/SideProject, Indie Hackers) — that's a different
question (is this a good product) from whether it teaches German well.

## Data model additions

- `vocab_entries` gains: `interval_days`, `ease_factor`, `repetitions`,
  `next_review_at`, `last_reviewed_at` (SM-2 fields). `next_review_at`
  needs an index — it's the review-queue query.
- `mistake_history` gains: `review_count` (how many times this specific
  flagged instance has been drilled) and the same `next_review_at` /
  `ease_factor` / `interval_days` fields, OR a separate `grammar_cards`
  table referencing `mistake_history(id)` if keeping mistake logging and
  drill scheduling cleanly separated turns out to matter once built — decide
  at implementation time, not now.
- `conversations` gains: `persona` column (nullable, defaults to the
  existing generic partner behaviour for backward compatibility with v1
  conversations).

No new tables are strictly required beyond the above — this reuses v1's
schema rather than introducing a parallel "cards" content model.

## Architecture notes

- SM-2 itself is a small, self-contained pure function (`lib/srs.ts`,
  analogous to `lib/tutor.ts`) — takes a card's current scheduling state +
  a review grade, returns the next state. No LLM call, no new provider.
- Grammar card generation (item 4) reuses the existing `mistake_type`
  taxonomy in `lib/mistake-types.ts` as-is — no separate taxonomy needed,
  the recurrence check is just a `COUNT(*) GROUP BY mistake_type` against
  `mistake_history` for the user.
- Recasting (item 1) is a system-prompt change to
  `buildConversationSystemPrompt` in `lib/prompts.ts`, gated on the
  correction result being available before the reply prompt is built —
  needs the correction pass to run *before* (or the reply to be revised
  after) rather than fully concurrently as in v1; worth checking whether
  this meaningfully increases latency before committing to it.
- Personas (item 6) extend `lib/prompts.ts` the same way `CefrLevel` does
  now — a `Persona` union type + a guidance table, composed into the system
  prompt alongside the existing level guidance.

## Build order (draft — sequence after v1 ships)

1. SM-2 scheduling + vocab flashcard review UI (validates the mechanic on
   the simpler case before reusing it for grammar cards)
2. Grammar drill cards from `mistake_history` recurrence, sharing the review
   queue from step 1
3. Interleaved review surfacing in the chat side panel
4. In-conversation recasting
5. Level-gated glossing
6. Scenario personas + tutor-initiated topics

## Phase 3 — Voice ("video call", turn-based pipeline)

Decision: build voice the way Duolingo's "video call" feature actually
works, not the way it's presented. It *looks* like a live call (avatar,
listening/speaking states, a "calling..." transition), but under the hood
it's turn-based — record until the learner pauses, transcribe, run the
existing text pipeline, speak the reply back. No persistent duplex socket,
no OpenAI Realtime API, no per-minute meter. This keeps voice on the same
near-zero-billing footing as the rest of the stack (see `PLAN.md`'s
guiding principle) instead of introducing the first genuinely metered,
usage-scaling cost in the project.

Rejected for now: true realtime duplex (OpenAI Realtime API) — ~$0.016-
0.05/min with no free tier, and duplex turn-taking/interrupt handling is
meaningfully more engineering than this project needs to validate the
"does anyone want voice at all" question first.

- **Pipeline:** browser records while the learner talks, client-side
  silence/VAD detection ends the turn → audio sent to STT → transcript fed
  into the *existing* chat pipeline unchanged (`buildConversationSystemPrompt`,
  `detectCorrection`, etc. all reused as-is — voice is just a different
  input/output surface on the same text pipeline, not a parallel one) →
  reply text sent to TTS → audio played back, with the UI driving the
  avatar's listening/thinking/speaking states off each pipeline stage.
- **STT/TTS provider:** check Groq's catalog first (it already serves
  Whisper for STT) to keep this on the existing free-tier account before
  reaching for a paid TTS provider — same reasoning as the LLM choice.
  Needs a concrete check of what TTS Groq currently offers and its quality,
  not assumed.
- **Correction handling in voice mode:** the side-panel correction UI
  doesn't make sense mid-call — decide whether corrections are silently
  logged to `mistake_history` for later (surfaced after the call ends, or
  as phase-2 drill cards) or spoken as a brief recast (Phase 2 item 1)
  within the reply itself. Leaning toward the latter, since it's already
  planned and voice is exactly where a spoken recast is most natural.
- **Latency budget:** STT + LLM + TTS chained sequentially will be
  noticeably slower turn-around than true duplex. Worth measuring actual
  round-trip time early (a throwaway script, before any UI work) to decide
  if it's tolerable or needs streaming TTS (start speaking before the full
  reply text is generated) to feel acceptable.

## Open questions to settle before building

- SM-2 grading UI: simplest is a binary again/got-it, Anki-standard is a
  4-button again/hard/good/easy — decide based on how much friction is
  acceptable in the interleaved (in-chat) review path specifically, which
  may want the simpler binary even if the full review view offers 4 buttons.
- Cloze blanking for grammar cards: blank just the wrong span, or the whole
  phrase containing it? Affects difficulty and needs a few manual examples
  before deciding.
- Whether persona and CEFR level should be able to vary independently or
  whether some personas imply a level floor (e.g. a fast-paced barista
  persona may not make sense at A1).
