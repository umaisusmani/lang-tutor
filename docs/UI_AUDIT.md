# UI audit and next steps — 2026-10-20 (status checked 2026-10-21)

This records the code-level findings from 2026-10-20, before the current uncommitted UI changes. The findings below are the original baseline; their present status is summarized here. This is not a live visual or device audit. Feature status remains in [ROADMAP.md](../ROADMAP.md).

| Area | Current status |
|---|---|
| Quota banner and count recovery | Implemented locally above the chat composer. Personal, shared, and unavailable states have separate copy; chat, Ask, and explanations update the same allowance. Live tests of the final allowed request, reload, and UTC rollover remain. |
| Review completion | Implemented locally. Each available card is graded once per round; completion returns to the word grid with a summary. Save failures retain the card for retry. A live graded session remains to be tested. |
| Vocabulary page | Search, sort, filters, missing-meaning status, an empty-state chat action, and separate due review and extra practice are implemented locally. Phone and keyboard checks remain. |
| Other UI | Auth copy and password reset, drawer focus behavior, composer labeling, and menu keyboard behavior are implemented locally. A phone-width browser check found and fixed an off-screen composer on an empty chat. Password recovery email and assistive-technology checks remain. |
| Ask accuracy | Open. The model's German grammar reliability needs expanded evals and manual review before wider promotion. |
| Starter-word source | Open release blocker. The Goethe-derived list lacks confirmed reuse rights; secure permission or replace it before publishing its discovery entry point. |

## 1. Daily-limit banner (highest priority)

The server already enforces 5 anonymous or 35 signed-in requests per UTC day, plus a shared cap. Chat, Ask, and fresh grammar explanations spend the same allowance. Today the header shows a small count, the composer changes its placeholder at zero, and a rejected chat request can render a large card in the thread. There is no persistent notice above the composer when the *last allowed* request takes the count to zero. The Ask panel says only “daily limit reached”; an explanation failure uses a toast. See `app/chat.tsx`, `app/components/chat/chat-content.tsx`, `app/components/chat/side-panel.tsx`, and `lib/services/session.service.ts`.

**Plan:** show one distinct, persistent banner immediately above the sticky chat composer, including in an empty chat. Load both personal and shared-cap status on page entry (today `getRemainingMessages()` reads only the personal bucket), and use the same quota state for the header and Ask panel. Suggested copy:

- Personal cap: **Daily limit reached.** “Your messages reset on [local date] at [local time].” For an anonymous visitor, add “Sign in for 35 messages a day.”
- Shared cap: **The tutor has reached today’s shared limit.** “It resets on [local date] at [local time].” Do not imply signing in will help.

Compute the next 00:00 UTC boundary and display its full date and time in the browser's time zone; label the time zone or include “00:00 UTC.” Make the banner a polite live status, keep its text readable in both themes, and ensure it fits a narrow viewport. Keep cached explanations available because they spend no new allowance. Resolve or replace the existing in-thread limit card so a denied turn does not create competing messages.

**Acceptance checks:** the banner appears on load when either cap is exhausted, immediately after the last allowed chat/Ask/explanation request, and after a server denial; the reason and sign-in action are correct; it survives a reload; the allowance refreshes when the UTC day changes while the tab stays open. Test signed-in, anonymous, shared-cap, and counter-error states separately. The current server maps a counter failure to `reason: 'global'`, so distinguish an outage before claiming the shared daily cap was reached.

## 2. Other UI gaps

| Priority | Surface | Finding and action |
|---|---|---|
| P0 | Chat quota state | `send()` decrements `remaining` before the request; `onError` shows a toast but never reconciles it. A failed request can leave chat disabled locally even when a slot remains. Read the authoritative remaining count after an ambiguous failure rather than blindly adding one, since the server may already have consumed a slot. The page also does not refresh the count at UTC rollover. |
| P1 | Login/signup | The signup description says “chat without limits,” while the signed-in cap is 35/day (`app/login/page.tsx`). Change it to a truthful benefit. Add a recover-password path; the current page and auth actions offer none. |
| P1 | Empty vocab | With zero saved entries, `/vocab` renders explanatory text only and never mounts `VocabBrowser`, so its Start session/starter-word flow is unreachable (`app/vocab/page.tsx`). Give the empty state a clear “Go to chat and save a word” action; expose starter words there only after the list's licensing issue is resolved. |
| P1 | Ask quality and feedback | The Ask examples invite a grammar case that the current 20B eval repeatedly gets wrong (`app/components/chat/side-panel.tsx`, `evals/ask-cases.ts`). Fix and review answer quality before promoting Ask; show the quota reset and shared-cap reason in the panel rather than only a disabled send button or raw API error. |
| P1 | Learning-tools drawer | The drawer is visually modal but does not move focus into it, trap focus, or return focus to the opener on close (`app/components/chat/side-panel.tsx`). Add dialog semantics and keyboard focus management. Check tab arrow-key behavior if retaining `role="tablist"`. |
| P2 | Chat and Ask controls | The chat composer input relies on a placeholder for its accessible name; Ask's streaming answer and the limit state are not announced as live updates. Add a stable input label and suitable status announcements without reading every streamed token aloud. |
| P2 | Conversation menus | The chats/account popovers use overlays and buttons but no menu focus pattern or Escape handling (`app/components/site-header.tsx`). Verify keyboard open, navigate, close, and focus return; then align their semantics with actual behavior. |

## 3. Vocabulary page and review-session audit

The review flow is embedded in `/vocab`; ending it switches back to the word grid on the same route. The current queue keeps cards in learning/relearning until their minute-level delay expires. When no card is available, the session shows a countdown instead of finishing (`app/vocab/flashcard-session.tsx`). This is the completion problem reported by the user.

| Priority | Finding | UI fix |
|---|---|---|
| P0 | A session with only future learning cards remains on a “Next card in a moment” countdown; a fully empty queue remains on a separate “All caught up” screen. | Finish when no review card is available *now*, leave scheduled cards for a later session, switch back to the vocab grid automatically, and show a clear completion summary there. Do not force the learner to wait or find “Back to word list.” |
| P1 | “1 card left” counts a card waiting on its next learning step; “cards reviewed” counts grading attempts, so a repeated card inflates the total. | Show “available now” and a separate “scheduled later” count, and distinguish unique cards from review attempts in the completion summary. |
| P1 | The page's due badge counts both directions of a word, while a session deliberately shows only one direction per word. “Practice N due” can promise more cards than the session contains, and a due badge may remain after completion. | Label the badge as due directions or show the number actually available in this session; explain that the other direction waits for a later session. |
| P1 | With zero due cards, “Start session” silently loads early practice; the page simultaneously says “nothing due right now.” “Practice 10 more” can also surface waiting or recently graded cards. | Offer separate, clearly named actions for due review and optional extra practice. Keep a completed session complete; make extra practice a fresh, explicit choice. |
| P1 | A failed grade save removes the card from the visible queue and can lead to a misleading completion state, although the review did not persist. | Keep the card available for retry or show a distinct “review not saved” state; never count it as completed. |
| P1 | Discovery cards interrupt reviews and can continue after all review cards are done. The learner must add or skip each one to reach completion. | Make new-word discovery a separate optional activity or offer it after the completed-session summary, without blocking the return to the word list. |
| P1 | The empty vocab page has only a sentence and no action. | Link directly to a new chat with a prompt to save the first word. The existing starter list needs its licensing issue resolved before it becomes a public onboarding path. |
| P2 | A starter card shows a sentence translation but not the word's own meaning before “Add to my vocab”; a saved card with no translation still enters review and reveals “no translation saved.” | Show the meaning before asking for an add decision; flag or repair missing meanings before a card can be graded. |
| P2 | The word grid has no search, sorting, filtering, or due status; at scale it is a long set of hidden-meaning tiles. | Add find/sort controls and a clear distinction between saved words and cards due for review. |
| P2 | “Again / Hard / Good / Easy” gives interval previews but no explanation of which choice means “I forgot”; key numbers and interval text are tiny. | Add one-line grading guidance, make the labels readable on narrow screens, and distinguish the four choices clearly. |
| P2 | The session listens for Space/Enter and 1–4 on `window` without checking the focused control. | Scope shortcuts to the review surface and ignore keys when a button or form control has focus, so keyboard activation of “End session” or toggles is reliable. |

Validate the revised flow on a phone-sized viewport and with keyboard/screen reader. The current audit is from code; the live browser and database paths have not been verified here.

## 4. Documentation and sequence

- [README.md](../README.md) now states that Ask and fresh explanations share the chat allowance, and that a shared cap can stop requests early.
- [ROADMAP.md](../ROADMAP.md) now tracks the quota banner, audit follow-up, and Translate as a side-panel tab. Translate is planned/in progress by the user; it is not a shipped page.
- [TECHNICAL.md](TECHNICAL.md) identifies the current code revision and points to this audit. Its implementation description is separate from future work.

After the user's Translate work: **(1)** verify and ship the quota and vocabulary UI changes, after resolving the starter-list rights issue; **(2)** bring Ask grammar reliability to an acceptable level with expanded evals and manual review; **(3)** build SQL-first tutor personalization using existing mistake, vocab, review, and recent-chat data. Assess semantic retrieval only if simpler context selection fails. Keep voice and richer flashcards after those steps.
