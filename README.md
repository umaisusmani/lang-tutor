# Lang Tutor

A German conversation practice app. You chat with an AI tutor in German, it corrects your mistakes and explains them in plain English, and it keeps track of the vocabulary and grammar patterns you personally struggle with.

Most language apps drill you with pre-written exercises. This one holds an actual conversation, then uses what you got wrong to decide what to explain — pulling the relevant grammar rule for *your* mistake, and noticing when you make the same one repeatedly.

> **Status:** in progress. Built in the open, one feature at a time — see the roadmap below.

## Features

- [x] **Conversational practice** — chat with an LLM playing a German conversation partner pitched at your level
- [ ] **Grammar breakdown on correction** — when you slip, the tutor explains what was wrong and why, in plain language
- [ ] **Vocabulary tracker** — logs the words and phrases you encounter or get wrong
- [ ] **Personalized retrieval** — pulls the grammar rule and example sentences matching your specific mistake, informed by your own mistake history
- [ ] **Eval suite** — 15–20 curated correction pairs scored pass/fail, so prompt changes can't silently regress quality

## How it works

The conversation runs through a streaming chat endpoint backed by Groq. When you make a mistake, a second structured-output pass classifies it (word order, case, gender, verb conjugation, …) rather than leaving the correction to freeform prose — that classification is what makes the rest possible.

That mistake type becomes a retrieval key: it pulls matching grammar rules and example sentences from a vector store, and cross-references your own past mistakes of the same type in Postgres. So the explanation you get is grounded in a real grammar reference *and* aware that this is the third time you've dropped the dative.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| LLM | Groq (`llama-3.3-70b-versatile`) |
| Database + Auth | Supabase — Postgres, email/password + Google OAuth |
| Vector store | Pinecone |
| Embeddings | Google Gemini |
| Hosting | Vercel |

## Running locally

Requires Node.js 20+.

```bash
git clone git@github.com:umaisusmani/lang-tutor.git
cd lang-tutor
npm install
```

Copy the env template and fill in your keys:

```bash
cp .env.example .env.local
```

You'll need a [Groq API key](https://console.groq.com) (free tier). Then:

```bash
npm run dev
```

Open http://localhost:3000 and start typing in German.

## Roadmap

v1 is the checklist above. Deliberately **not** in v1: voice input/output, languages beyond German, account management flows, and auto-generated exercises.

## License

MIT — see [LICENSE](LICENSE).
