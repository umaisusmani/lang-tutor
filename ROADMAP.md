# Starvogel — Roadmap

The one place feature status is recorded. Design notes live in local
`plans/*.md` files (not committed), and they don't carry status. What is
built, and how, is in [docs/TECHNICAL.md](docs/TECHNICAL.md).

**Current sequence (2026-11-03):** A large UI/UX pass shipped on top of the 2026-10-29 state: chat sticks to the bottom instead of jumping on every streamed chunk, the correction card collapses to a one-line summary, buttons/chips/the dropdown got a consistent design pass, word tooltips are portalled so they clear their containers and the side panel's modal dialog, and `/vocab`'s review flow collapsed "Review due words"/"Extra practice" into one mode-aware **Practice** button with new words mixed into practice and Discover expanded to 10 words with batched meaning lookups — addressing the single-button-silently-falls-back issue [the UI audit](docs/UI_AUDIT.md) flagged (P1). `AddWord` gained typo-tolerant search and an AI lookup beyond the starter list, so adding a word is no longer limited to the Goethe list (though Discover and practice's new-word mixing still are — see the licence blocker below). A new **grammar notes** feature (migration `0009`, applied to production 2026-11-03) lets a learner save a correction's explanation as a standalone note and add a personal note to any saved word — a smaller, separate feature from the still-unbuilt Flashcards F4. The header's chat controls merged into one trigger, the mobile hamburger is gone, and the app is now an installable PWA (manifest, icons, an install prompt in the account menu — not yet verified on a real device). The live browser/assistive-technology pass [the UI audit](docs/UI_AUDIT.md) called for still hasn't happened, and the starter-word licence (see Phase 2) is still the one open release blocker. Next, build tutor personalization: identify recurring weak points from mistake history and review data, select relevant vocabulary and prior conversation topics, and steer the chat toward natural practice opportunities. Start with structured SQL selection and measure whether the tutor uses this context well; evaluate semantic retrieval only if simpler selection misses useful history. After that, fix and evaluate Ask's German grammar accuracy before exposing it more widely. The eight-case eval found recurring 20B errors and occasional 120B errors, so expand the cases and manually review answers before choosing a model. Validate demand for a separate Topics view before adding it. Voice features remain parked.

Before personalization, review the findings in [the AI prompt audit](docs/AI_PROMPT_AUDIT.md), especially visible-reasoning risk and the accuracy of mistake data used for steering.

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
| Quota banner and count recovery | 🟡 | `dec1a4d` | Full takeover card (persona, due count, reset time, Translate CTA) once the learner's own daily cap is hit, replacing the composer; a compact one-line banner elsewhere (shared-cap reason, counter-outage retry) and count refresh after failures and UTC rollover. Live limit-state testing remains; see [UI audit](docs/UI_AUDIT.md). |
| Email verification on signup | 🟡 | `96b4d0c`, `7d0ab39` | Code-entry screen, resend, `/auth/confirm` link fallback. "Confirm email" is on. Still to do: paste `supabase/email-templates/confirm-signup.html` into the Supabase "Confirm signup" template, and custom SMTP |
| Conversation history (reopen, delete) | ✅ | `75083e2`, `e73d23c` | Not in the original plan |
| Eval suites: correction, gloss, reply | ✅ | `55896e5`, `875969f`, `69615a7` | |
| Token usage logging | ✅ | `ad002cf` | `token_usage` table |
| Tutor personalization, SQL-first | ⬜ | | Next development milestone: identify recurring weak points, select relevant vocabulary and prior conversation topics, and use them to steer chat naturally. Define evals before changing behavior. Design: `plans/v1.md` |
| Semantic retrieval (RAG) decision | ⬜ | | Optional follow-up only if SQL-first personalization misses relevant history in evals/user tests; compare simpler SQL/summary selection against vector search first. Design: `plans/v1.md` |
| UI pass + launch (step 7) | ✅ | `5dc547b`, `69615a7` | User reports launch prep complete; continue polish from tester feedback |
| UI audit follow-up | 🟡 | `bf2fffb`, `9c1fb29`, `0e357bc` | Empty-vocab onboarding, modal keyboard behavior, English-throughout auth copy (shared `PasswordInput`), password reset, and the single mode-aware Practice button (replacing the two separate buttons P1 flagged) are implemented. Browser and assistive-technology checks remain; see [the UI audit](docs/UI_AUDIT.md). |

## Phase 2 — practice beyond chat

| Feature | Status | Commit | Notes |
|---|---|---|---|
| Flashcards F1: schema, FSRS wrapper, tests | ✅ | `7c5fec0` | Migration `0005` applied 2026-10-08. Design: `plans/flashcards.md` |
| Flashcards F2: Anki-style session on `/vocab`, due badge | ✅ | `372b424`, `80e837b` | Due review and optional extra practice are separate. A round shows one direction per word, finishes after its available cards, and returns to the grid with a summary. `/review` redirects. Timezone is saved from the browser. Reverse (English → German) cards need migration `0006` applied. |
| Vocab review UX: completion, progress, and entry points | 🟡 | `0e357bc` | Implemented locally: clear completion, save retry, search/filter/sort, a styled progress bar, and one mode-aware Practice button (was two separate buttons) with a due round ending in "Keep practising." Live interaction testing remains; see [the UI audit](docs/UI_AUDIT.md#3-vocabulary-page-and-review-session-audit). |
| Starter vocab by level, offered in optional discovery | 🟡 | `fa0dac0`, `0e357bc` | Goethe A1–B1 lists (~2,900 words), 10 per discovery round (was 3), meaning and example shown immediately with meanings fetched in one batched call. ~25% new words are also mixed into extra-practice rounds (as introduction cards, not graded). Skips are remembered per browser. **Release blocker:** the source repo has no licence and the Goethe PDFs assert copyright. Secure permission or replace the list before publishing this entry point — note that `AddWord`'s new AI lookup (below) gives a licence-clean alternative for typed words, but Discover and practice's new-word mixing still draw only from this list. |
| Flashcards F3: review cards inside chat | ⬜ | | Reuses the flip card; sequence after initial learner feedback and personalization priorities are clearer |
| Flashcards F4: grammar cards from repeated mistakes | ⬜ | | |
| Flashcards F5: leeches, steering the tutor toward due words | ⬜ | | |
| Personas | 🟡 | `69615a7` | One persona (Ramanath), pinned per conversation. No selector, no scenario personas, no avatar art. Design: `plans/phase2.md` |
| Tutor-initiated topics | 🟡 | `69615a7`, `f63d967` | Prompt only: brings up new topics; now only forces a statement-only reply after two consecutive question-ending replies (was: after every one), and bio details (e.g. Rhine walks) are occasional, not default. See [AI_PROMPT_AUDIT.md](docs/AI_PROMPT_AUDIT.md) |
| Recasting | 🟡 | `69615a7` | Only English stand-ins come back in German. Grammar mistakes aren't recast |
| Level-gated glossing (B1+ tap to reveal) | ⬜ | | |
| Ask side panel (German-learning utilities, separate from roleplay) | 🟡 | | Code uses signed-in-only Ask on Groq 20B, short answers or sentence translation with grammar notes. Anonymous visitors see a sign-up modal. Groq permission works, but the new `ask` eval exposes recurring 20B grammar errors; compare 120B and expand/repeat cases before launch. The panel's old "Words" tab (reusing glosses) was removed — see the Translate row and "Word search on /vocab" below. Topics deferred; no RAG. Design: `plans/ask-panel.md` |
| Translate side-panel tab | 🟡 | `09bc831`, `a3194e1`, `0e357bc` | Production deployment is ready with German ↔ English swap, Azure Dictionary Lookup/Text Translate, and separate atomic 50/user and 300/global daily caps. Migration `0008` is applied; Azure variables are configured in Vercel; live Azure lookups passed in both directions, and the user confirmed the panel works. Saving now happens inline: German→English via a "save words ↓" breakdown, English→German via tappable words inside the translated sentence itself (`TranslatableResult`). A single non-noun dictionary word now skips the extra LLM call (Azure's dictionary already has the meaning). Limit-state testing remains. Design: `plans/translate.md` |
| Word search on `/vocab` (`AddWord`) | ✅ | `09bc831`, `35df25c` | Not in the original plan. Type-ahead search over the starter word lists (now typo-tolerant), generated meaning preview, editable before saving. An AI lookup ("See more results", or automatic when nothing matches) now covers German or English words outside the starter list — spends one unit of the Translate daily allowance per lookup. Only Discover/practice's new-word mixing still carry the starter-list licence caveat (see Phase 2 row above). |
| On-demand grammar explanations | ✅ | `69615a7` | Not in the original plan. Saved to the message |
| Grammar notes (manual save, no scheduling) | ✅ | `35df25c` | Not in the original plan, and not Flashcards F4 (below) — a deliberately simpler feature. Migration `0009` applied to production 2026-11-03. A correction's explanation can be saved (editable first) as a standalone note from chat; a "My notes" filter on `/vocab` lists, edits, and deletes them. A saved word can also carry a personal free-text note. No FSRS, no review session, no automatic selection — plain save/list/edit/delete. Known gap: the "already saved" state isn't persisted, so a reload lets the same explanation be saved twice. |
| Installable PWA | ✅ | `35df25c` | Not in the original plan. Manifest, generated brand icons, iOS web-app metadata, and an "Install app" row in the account menu (captures `beforeinstallprompt` on Chromium/Android; shows manual Share → Add to Home Screen steps on iOS). No service worker — a manifest over HTTPS is enough per the Next.js guide for this version, and caching HTML/API responses would be unsafe for this app's signed-in pages. **Installability on a real device is unverified** — check after deploying. |

## Later

| Feature | Status | Notes |
|---|---|---|
| Voice V0: dictation (mic → STT → input box) | ⬜ | Build first: Groq `whisper-large-v3-turbo`, forced German, editable transcript; measure quality with real learner recordings. Design: `plans/voice.md` |
| Voice V1: speak replies (TTS) | ⬜ | Start with browser German `speechSynthesis`; select a server TTS only after validating the voice experience |
| Voice V2: call mode (VAD → STT → chat → TTS) | ⬜ | Turn-based call UX, not duplex realtime. No pronunciation scoring in free conversation; surface corrections after the call |
| Bring your own model, step 1: one `lib/llm.ts` | ⬜ | Design: `plans/byom.md` |
| Bring your own model, step 2: per-user endpoint, calls made from the browser | ⬜ | |
