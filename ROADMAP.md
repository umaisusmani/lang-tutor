# Starvogel — Roadmap

The one place feature status is recorded. Design notes live in local
`plans/*.md` files (not committed), and they don't carry status. What is
built, and how, is in [docs/TECHNICAL.md](docs/TECHNICAL.md).

**Current sequence (2026-10-23):** Translate is deployed as a third tab in the existing chat side panel; migration `0008` is applied, the Azure F0 key/region are configured, and live Azure lookups pass in both directions. A signed-in panel test remains before calling it fully verified. The quota and vocabulary UI fixes from [the UI audit](docs/UI_AUDIT.md) are implemented locally and await live browser testing and deployment. After Translate, fix and evaluate Ask's German grammar accuracy before exposing it more widely. The eight-case eval found recurring 20B errors and occasional 120B errors, so expand the cases and manually review answers before choosing a model. Then improve tutor personalization from existing structured learner data; evaluate semantic retrieval only if simpler methods miss relevant context. Validate demand for a Topics view before adding it. Voice features remain parked.

Status: ✅ done · 🟡 partly done · ⬜ not started

## v1 — core loop

| Feature | Status | Commit | Notes |
|---|---|---|---|
| Chat at a chosen CEFR level (A1–C1) | ✅ | `2e19313` | Cookie when anonymous, `profiles.cefr_level` when signed in |
| Correction + grammar breakdown | ✅ | `55896e5` | Runs concurrently with the reply; also flags English stand-ins (`usedEnglish`) |
| Per-word vocab candidates | ✅ | `e21dd9e`, `875969f` | LLM-derived lemmas from the gloss call, not the planned rule-based pipeline |
| Vocab tracker (save, delete, `/vocab` grid) | ✅ | `5dc547b`, `69615a7` | Server Actions rather than REST routes |
| Auth: email/password + Google OAuth | ✅ | `ad002cf`, `1b6352a` | |
| Anonymous rate limit (5 messages) | ✅ | `df4ff32` | |
| Daily message limits (anon 5, signed-in 35, global kill switch) | ✅ | `96b4d0c` | Migration `0007` applied 2026-10-13 and checked against the live DB. `GLOBAL_DAILY_MESSAGE_CAP` set to 40 on 2026-10-15 (`.env.local`, Vercel Production and Preview; a redeploy picks it up). Design: `plans/limits-and-verification.md` |
| Quota banner and count recovery | 🟡 | | Implemented locally: notice above the composer, user/shared-cap reason, local reset time, and count refresh after failures and UTC rollover. Live limit-state testing remains; see [UI audit](docs/UI_AUDIT.md). |
| Email verification on signup | 🟡 | `96b4d0c`, `7d0ab39` | Code-entry screen, resend, `/auth/confirm` link fallback. "Confirm email" is on. Still to do: paste `supabase/email-templates/confirm-signup.html` into the Supabase "Confirm signup" template, and custom SMTP |
| Conversation history (reopen, delete) | ✅ | `75083e2`, `e73d23c` | Not in the original plan |
| Eval suites: correction, gloss, reply | ✅ | `55896e5`, `875969f`, `69615a7` | |
| Token usage logging | ✅ | `ad002cf` | `token_usage` table |
| Tutor personalization, SQL-first | ⬜ | | Use existing mistake, vocab, review, and recent-conversation data to adapt prompts; define evals before changing behavior. Design: `plans/v1.md` |
| Semantic retrieval (RAG) decision | ⬜ | | Optional follow-up only if SQL-first personalization misses relevant history in evals/user tests; compare simpler SQL/summary selection against vector search first. Design: `plans/v1.md` |
| UI pass + launch (step 7) | ✅ | `5dc547b`, `69615a7` | User reports launch prep complete; continue polish from tester feedback |
| UI audit follow-up | 🟡 | | Empty-vocab onboarding, modal keyboard behavior, truthful auth copy, and password reset are implemented locally. Browser and assistive-technology checks remain; see [the UI audit](docs/UI_AUDIT.md). |

## Phase 2 — practice beyond chat

| Feature | Status | Commit | Notes |
|---|---|---|---|
| Flashcards F1: schema, FSRS wrapper, tests | ✅ | `7c5fec0` | Migration `0005` applied 2026-10-08. Design: `plans/flashcards.md` |
| Flashcards F2: Anki-style session on `/vocab`, due badge | ✅ | `372b424`, `80e837b` | Due review and optional extra practice are separate. A round shows one direction per word, finishes after its available cards, and returns to the grid with a summary. `/review` redirects. Timezone is saved from the browser. Reverse (English → German) cards need migration `0006` applied. |
| Vocab review UX: completion, progress, and entry points | 🟡 | | Implemented locally: clear completion, save retry, search/filter/sort, and separate review and practice. Live interaction testing remains; see [the UI audit](docs/UI_AUDIT.md#3-vocabulary-page-and-review-session-audit). |
| Starter vocab by level, offered in optional discovery | 🟡 | `fa0dac0` | Goethe A1–B1 lists (~2,900 words), 3 per discovery round. A word's meaning is shown before adding; skips are remembered per browser. **Release blocker:** the source repo has no licence and the Goethe PDFs assert copyright. Secure permission or replace the list before publishing this entry point. |
| Flashcards F3: review cards inside chat | ⬜ | | Reuses the flip card; sequence after initial learner feedback and personalization priorities are clearer |
| Flashcards F4: grammar cards from repeated mistakes | ⬜ | | |
| Flashcards F5: leeches, steering the tutor toward due words | ⬜ | | |
| Personas | 🟡 | `69615a7` | One persona (Ramanath), pinned per conversation. No selector, no scenario personas, no avatar art. Design: `plans/phase2.md` |
| Tutor-initiated topics | 🟡 | `69615a7` | Prompt only: brings up new topics, asks a question in about half of replies |
| Recasting | 🟡 | `69615a7` | Only English stand-ins come back in German. Grammar mistakes aren't recast |
| Level-gated glossing (B1+ tap to reveal) | ⬜ | | |
| Ask side panel (German-learning utilities, separate from roleplay) | 🟡 | | Code uses signed-in-only Ask on Groq 20B, short answers or sentence translation with grammar notes; Words reuses glosses. Anonymous visitors see a sign-up modal. Groq permission works, but the new `ask` eval exposes recurring 20B grammar errors; compare 120B and expand/repeat cases before launch. Topics deferred; no RAG. Design: `plans/ask-panel.md` |
| Translate side-panel tab | 🟡 | | Production deployment is ready with German ↔ English swap, Azure Dictionary Lookup/Text Translate, and separate atomic 50/user and 300/global daily caps. Migration `0008` is applied; Azure variables are configured in Vercel; live Azure lookups passed in both directions. Signed-in panel testing remains. Design: `plans/translate.md` |
| On-demand grammar explanations | ✅ | `69615a7` | Not in the original plan. Saved to the message |

## Later

| Feature | Status | Notes |
|---|---|---|
| Voice V0: dictation (mic → STT → input box) | ⬜ | Build first: Groq `whisper-large-v3-turbo`, forced German, editable transcript; measure quality with real learner recordings. Design: `plans/voice.md` |
| Voice V1: speak replies (TTS) | ⬜ | Start with browser German `speechSynthesis`; select a server TTS only after validating the voice experience |
| Voice V2: call mode (VAD → STT → chat → TTS) | ⬜ | Turn-based call UX, not duplex realtime. No pronunciation scoring in free conversation; surface corrections after the call |
| Bring your own model, step 1: one `lib/llm.ts` | ⬜ | Design: `plans/byom.md` |
| Bring your own model, step 2: per-user endpoint, calls made from the browser | ⬜ | |
