# starfinch — Roadmap

The one place feature status is recorded. Design notes live in local
`plans/*.md` files (not committed), and they don't carry status. What is
built, and how, is in [docs/TECHNICAL.md](docs/TECHNICAL.md).

**Next up:** flashcards F2 (`/review` page). Then F3–F5, then grammar RAG.

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
| Signed-in rate limit (time-windowed) | ⬜ | | Needed before public launch |
| Conversation history (reopen, delete) | ✅ | `75083e2`, `e73d23c` | Not in the original plan |
| Eval suites: correction, gloss, reply | ✅ | `55896e5`, `875969f`, `69615a7` | |
| Token usage logging | ✅ | `ad002cf` | `token_usage` table |
| Grammar RAG (step 5) | ⬜ | | Pinecone + Gemini embeddings. Design: `plans/v1.md` |
| Conversation memory RAG (step 6) | ⬜ | | Design: `plans/v1.md` |
| UI pass + launch (step 7) | 🟡 | `5dc547b`, `69615a7` | Most UI shipped piecemeal. Launch checklist still open |

## Phase 2 — practice beyond chat

| Feature | Status | Commit | Notes |
|---|---|---|---|
| Flashcards F1: schema, FSRS wrapper, tests | ✅ | *(uncommitted)* | Migration `0005` applied 2026-10-08. No UI yet. Design: `plans/flashcards.md` |
| Flashcards F2: `/review` page | ⬜ | | |
| Flashcards F3: review cards inside chat | ⬜ | | |
| Flashcards F4: grammar cards from repeated mistakes | ⬜ | | |
| Flashcards F5: leeches, steering the tutor toward due words | ⬜ | | |
| Personas | 🟡 | `69615a7` | One persona (Ramanath), pinned per conversation. No selector, no scenario personas, no avatar art. Design: `plans/phase2.md` |
| Tutor-initiated topics | 🟡 | `69615a7` | Prompt only: brings up new topics, asks a question in about half of replies |
| Recasting | 🟡 | `69615a7` | Only English stand-ins come back in German. Grammar mistakes aren't recast |
| Level-gated glossing (B1+ tap to reveal) | ⬜ | | |
| On-demand grammar explanations | ✅ | `69615a7` | Not in the original plan. Saved to the message |

## Later

| Feature | Status | Notes |
|---|---|---|
| Voice (turn-based STT → chat → TTS) | ⬜ | Design: `plans/voice.md` |
| Bring your own model, step 1: one `lib/llm.ts` | ⬜ | Design: `plans/byom.md` |
| Bring your own model, step 2: per-user endpoint, calls made from the browser | ⬜ | |
