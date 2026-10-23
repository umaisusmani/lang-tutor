# AI prompt audit — 2026-10-23

Scope: the six Groq-backed paths in the application. Azure Translate is a
translation API and has no application prompt. This is a source review, not a
fresh measurement of model quality. `node --import tsx --env-file=.env.local
scripts/run-evals.ts ask` could not reach `api.groq.com` from this workspace
(`EAI_AGAIN` on all eight cases); no answer-quality conclusion comes from that
run. The existing Ask failures cited in `ROADMAP.md` predate this audit.

| Path | Prompt and call | Review |
|---|---|---|
| Main chat reply | `lib/prompts.ts`, `lib/reply.ts`, `lib/services/chat.service.ts` | CEFR limits and persona are explicit; production and evals share settings. `reasoningFormat: 'hidden'` addresses the earlier raw-reasoning leak in this path. The client supplies the full transcript, including purported assistant turns. |
| Correction and English stand-ins | `lib/prompts.ts`, `lib/tutor.ts` | Strong taxonomy, keyboard leniency, and a second look at clean verdicts. The schema checks field types, but the eval only checks `hasMistake`, `mistakeType`, and `usedEnglish`; it does not check whether corrected text, explanation, translation, or word gloss are accurate. Recorded mistake types will drive personalization. |
| Reply gloss and vocab lemmas | `lib/prompts.ts`, `lib/gloss.ts` | Shared lemma rules and repeated lemma evals cover difficult constructions. The eval does not verify the full translation, every source word, or lemma translations. Schema validation does not enforce one output entry per input word. |
| On-demand grammar explanation | `lib/prompts.ts`, `lib/explain.ts` | The prompt requests 2–4 points even for a very short reply, which can encourage filler or invented grammar claims. This stream lacks the main chat's `reasoningFormat: 'hidden'` setting. There is no explanation eval. Generated text is persisted when a message ID exists. |
| Ask panel | `lib/ask.ts`, `app/api/ask/route.ts` | The prompt clearly separates questions from phrase translation and labels context as untrusted. It uses the 20B model despite known grammar errors in the existing eight-case eval. It also streams without `reasoningFormat: 'hidden'`. Recent context is client-supplied and inserted into XML-like delimiters without escaping; treat its roles and contents as hints, not authoritative history. |
| Starter-word translation | `lib/starter-vocab/translate.ts` | Short dictionary-gloss instruction and schema, but no dedicated eval for sense selection, noun/verb formatting, or accuracy. This path currently depends on the starter list whose reuse rights remain unresolved. |

Persona follow-up: Ramanath's bio explicitly names walks by the Rhine, and
the old `buildTurnGuidance()` forbade a question after every question-ending
reply. The local prompt now treats bio details as occasional background and
only asks for a statement after two consecutive question-ending replies. The
reply eval targets a 25–75% question share; live behavior still needs review
when Groq is reachable.

## Priorities before tutor personalization

1. **Prevent visible reasoning in every text stream.** Apply the same explicit
   Groq reasoning format to Ask and grammar explanation that main chat uses.
   Add a regression case that fails on reasoning-style preambles, instruction
   echoes, or other non-answer text in each streamed surface. The installed
   `@ai-sdk/groq` provider forwards `reasoningFormat` as `reasoning_format`;
   the setting is currently present only in `lib/reply.ts`.
2. **Validate the learning signal.** Add hand-reviewed correction cases that
   check corrected sentences and explanations, including false positives and
   English stand-ins. Check gloss completeness and lemma translations on a
   small set. Personalization should not amplify mislabeled mistakes.
3. **Fix Ask accuracy before wider exposure.** Repeat and expand the current
   grammar cases, inspect the complete answers, and compare the existing 20B
   setting with 120B or a narrower prompt. Passing regex checks alone does
   not establish that a grammar explanation is correct.
4. **Make explanation prompts fit short inputs.** Permit one useful point or
   an explicit “nothing notable” result; evaluate short, correct sentences
   and English-word replacement cases. Add a small regression set for
   explanations and starter-word translations.
5. **Keep model context narrow and clearly marked.** For future personalized
   chat, fetch user-scoped mistake and review signals on the server, cap their
   size, and label them as data. Do not promote raw conversation text or
   client-supplied assistant turns into system instructions.

## Related operational issue

`/api/explain` deliberately does not consume chat-message allowance, but it
accepts anonymous requests and makes an uncapped 120B model call for each
nonempty request. A separate request-rate or cost guard is needed if this
endpoint remains publicly available. This is an API control issue, not a
prompt-quality finding.
