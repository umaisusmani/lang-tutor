# Lang Tutor

A German-language conversation practice tool that chats with you at your level, explains your mistakes in plain language, and tracks the vocabulary you pick up along the way.

> **Status: in progress** — actively being built. See the v1 checklist below for what's live.

## v1 features

- [ ] **Text-based conversational practice** — chat interface where the LLM plays a German conversation partner pitched at your level
- [ ] **Grammar breakdown on correction** — when you make a mistake, the tutor explains what was wrong and why, in plain language
- [ ] **Vocabulary tracker** — logs new words and phrases you encounter or get wrong
- [ ] **Light RAG layer** — retrieves relevant grammar rules and example sentences for the specific mistake you just made, personalized against your own growing mistake history
- [ ] **Eval suite** — 15–20 curated German correction pairs, scored pass/fail, to catch regressions when prompts change

## Tech stack

- **Framework** — Next.js (App Router) + TypeScript
- **LLM** — Groq
- **Database + Auth** — Supabase (Postgres, email/password + Google OAuth)
- **Vector store** — Pinecone
- **Embeddings** — Google Gemini
- **Hosting** — Vercel

## Out of scope for v1

No voice/speech, no languages other than German, no password-reset or account-management flows, and no auto-generated exercises. Those are v2 territory.

## License

MIT — see [LICENSE](LICENSE).
