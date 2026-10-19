'use client';

import type { ChatStatus } from 'ai';
import Link from 'next/link';

import { GlossedText } from '@/app/components/glossed-text';
import { PersonaAvatar } from '@/app/components/persona-avatar';
import { TranslateButton, TranslationPanel } from '@/app/components/translation-panel';
import type { LangTutorUIMessage } from '@/lib/chat-types';
import type { Starter } from '@/lib/constants';
import { hasCorrectionCard } from '@/lib/correction-card';
import type { ExplainKind } from '@/lib/explain';
import type { WordGloss } from '@/lib/gloss';
import { MISTAKE_TYPES } from '@/lib/mistake-types';
import type { PersonaProfile } from '@/lib/personas';
import type { CefrLevel } from '@/lib/prompts';
import { changedWordIndices } from '@/lib/text';
import type { VocabSource } from '@/lib/types/db';

const MISTAKE_TYPE_LABELS: Record<(typeof MISTAKE_TYPES)[number], string> = {
  word_order: 'word order',
  case_declension: 'case',
  gender_article: 'gender / article',
  verb_conjugation: 'verb conjugation',
  auxiliary_verb: 'auxiliary verb',
  preposition: 'preposition',
  adjective_ending: 'adjective ending',
  plural_form: 'plural form',
  word_choice: 'word choice',
  other: 'grammar',
};

export type ExplanationRequest = {
  kind: ExplainKind;
  messageId: string | null;
  text: string;
  original?: string;
};

function resetTimeLabel(): string {
  const now = new Date();
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return reset.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function limitMessage(
  reason: 'user' | 'global' | undefined,
  signedIn: boolean,
): string {
  const resets = `Resets at ${resetTimeLabel()}.`;
  if (reason === 'global') return `The tutor has hit its limit for today. ${resets}`;
  return signedIn
    ? `You've used today's messages. ${resets}`
    : `You've used your free messages for today. ${resets} Or sign in to get more.`;
}

function messageText(message: LangTutorUIMessage, separator = '\n'): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(separator);
}

export function ChatWelcome({
  level,
  remaining,
  messageCap,
  signedIn,
  starters,
  persona,
  onSend,
}: {
  level: CefrLevel;
  remaining: number | null;
  messageCap: number;
  signedIn: boolean;
  starters: Starter[];
  persona: PersonaProfile;
  onSend: (text: string) => void;
}) {
  return (
    <main className="flex flex-1 flex-col justify-center gap-[26px] py-10">
      <div className="flex flex-col gap-2.5">
        <span className="text-ink-3 font-mono text-[10px] tracking-[0.12em] uppercase">
          level {level}
          {remaining !== null && ` · ${remaining} ${signedIn ? 'messages left' : 'free messages'}`}
        </span>
        <div className="flex items-center gap-3">
          <PersonaAvatar persona={persona} size={48} />
          <div className="flex flex-col">
            <span className="text-[17px] font-bold">{persona.name}</span>
            <span className="text-ink-3 font-mono text-[11px]">
              {[persona.age, persona.city].filter((value) => value != null).join(' · ')}
            </span>
          </div>
        </div>
        <h1 className="text-4xl leading-[1.05] font-extrabold tracking-[-0.025em]">
          Sag einfach etwas.
        </h1>
        <p className="text-ink-2 max-w-[52ch] text-base leading-relaxed">
          Chat with {persona.name} in German, however rough. Don&apos;t know a word? Just write it
          in English and you&apos;ll see how to say it in German. Every reply comes with a
          translation, and a correction when something&apos;s off.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">
          or start with
        </span>
        {starters.map(([de, en]) => (
          <button
            key={de}
            type="button"
            onClick={() => onSend(de)}
            className="border-line bg-panel hover:shadow-[3px_3px_0_var(--line)] flex cursor-pointer flex-col gap-[3px] rounded-[14px] border-2 px-4 py-3.5 text-left transition-transform hover:-translate-x-px hover:-translate-y-px"
          >
            <span className="text-ink text-[17px]">{de}</span>
            <span className="text-ink-3 font-mono text-[11px]">{en}</span>
          </button>
        ))}
      </div>

      {remaining !== null && (
        <div className="text-ink-3 flex items-center gap-2 font-mono text-[11px]">
          <span className="bg-yellow text-on-bright rounded-[5px] px-[7px] py-0.5 font-medium">
            {messageCap} {signedIn ? 'per day' : 'free'}
          </span>
          <span>{signedIn ? 'messages today' : 'messages a day before signing in'}</span>
        </div>
      )}
    </main>
  );
}

type ChatThreadProps = {
  messages: LangTutorUIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  persona: PersonaProfile;
  openPanels: Readonly<Record<string, boolean>>;
  explanations: Readonly<Record<string, string>>;
  explaining: Readonly<Record<string, boolean>>;
  canSave: boolean;
  isSaved: (lemma: string) => boolean;
  onTogglePanel: (key: string) => void;
  onSaveWord: (entry: WordGloss[number], source: VocabSource, sourceText: string) => void;
  onExplain: (key: string, request: ExplanationRequest) => void;
};

export function ChatThread({
  messages,
  status,
  error,
  persona,
  openPanels,
  explanations,
  explaining,
  canSave,
  isSaved,
  onTogglePanel,
  onSaveWord,
  onExplain,
}: ChatThreadProps) {
  const busy = status === 'submitted' || status === 'streaming';

  return (
    <main className="flex flex-1 flex-col gap-[34px] pt-[22px] pb-7">
      {messages.map((message, messageIndex) => {
        const text = messageText(message);
        const rateLimited = message.parts.find((part) => part.type === 'data-rateLimited')?.data;

        if (rateLimited) {
          return (
            <div
              key={message.id}
              className="border-line bg-yellow text-on-bright flex flex-col items-start gap-2 rounded-[18px] border-2 p-6 shadow-[4px_4px_0_var(--line)]"
            >
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase">
                {rateLimited.reason === 'global'
                  ? 'tutor is resting'
                  : `${rateLimited.cap} of ${rateLimited.cap} messages`}
              </span>
              <h2 className="text-[26px] font-extrabold tracking-[-0.02em]">
                Das war&apos;s für heute.
              </h2>
              <p className="max-w-[46ch] text-[15px] leading-[1.55]">
                {limitMessage(rateLimited.reason, rateLimited.signedIn)}
              </p>
              {!rateLimited.signedIn && (
                <Link
                  href="/login"
                  className="bg-ink text-paper mt-2 rounded-full px-5 py-2.5 text-[15px] font-bold no-underline transition-transform hover:translate-x-px hover:translate-y-px"
                >
                  Sign in →
                </Link>
              )}
            </div>
          );
        }

        if (message.role === 'user') {
          return (
            <div key={message.id} className="flex justify-end">
              <div className="border-line bg-accent text-on-accent max-w-[82%] rounded-[18px_18px_5px_18px] border-2 px-4 py-[11px] text-[17px] leading-[1.45] whitespace-pre-wrap shadow-[3px_3px_0_var(--line)]">
                {text}
              </div>
            </div>
          );
        }

        const replyGloss = message.parts.find((part) => part.type === 'data-gloss')?.data;
        const correctionPart = message.parts.find(
          (part): part is Extract<typeof part, { type: 'data-correction' }> =>
            part.type === 'data-correction',
        );
        const correction =
          correctionPart && hasCorrectionCard(correctionPart.data)
            ? correctionPart.data
            : undefined;
        const dbIds = message.parts.find((part) => part.type === 'data-messageIds')?.data;
        const storedExplanations = message.parts.find(
          (part) => part.type === 'data-explanations',
        )?.data;
        const priorUserText = messageIndex > 0 ? messageText(messages[messageIndex - 1], ' ') : '';
        const replyKey = `${message.id}-reply`;
        const correctionKey = `${message.id}-corr`;
        const replyOpen = openPanels[replyKey] ?? false;
        const correctionOpen = openPanels[correctionKey] ?? false;
        const inFlight = busy && messageIndex === messages.length - 1;
        const textStreaming = message.parts.some(
          (part) => part.type === 'text' && part.state === 'streaming',
        );
        const checking = inFlight && !correctionPart && priorUserText.trim() !== '';
        const checkedClean =
          !!correctionPart &&
          !correctionPart.data.hasMistake &&
          !correctionPart.data.usedEnglish;

        return (
          <div key={message.id} className="flex max-w-[92%] items-start gap-3">
            <PersonaAvatar persona={persona} size={32} className="mt-[3px]" />

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <div className="flex-1 text-[19px] leading-[1.6]">
                    <GlossedText
                      text={text}
                      words={replyGloss?.words}
                      canSave={canSave}
                      isSaved={isSaved}
                      onSave={(entry) => onSaveWord(entry, 'new_word', text)}
                    />
                    {textStreaming && (
                      <span className="bg-accent ml-[3px] inline-block h-[18px] w-[9px] animate-[blink_1s_step-end_infinite] align-[-3px]" />
                    )}
                  </div>
                  {replyGloss ? (
                    <TranslateButton
                      open={replyOpen}
                      onToggle={() => onTogglePanel(replyKey)}
                      className="mt-[5px]"
                    />
                  ) : (
                    inFlight && (
                      <TranslateButton
                        open={false}
                        pending
                        onToggle={() => {}}
                        className="mt-[5px]"
                      />
                    )
                  )}
                </div>

                {replyGloss && (
                  <TranslationPanel
                    open={replyOpen}
                    translation={replyGloss.translation}
                    explanation={
                      explanations[replyKey] ?? storedExplanations?.reply ?? undefined
                    }
                    explaining={explaining[replyKey] ?? false}
                    onExplain={() =>
                      onExplain(replyKey, {
                        kind: 'reply',
                        messageId: dbIds?.assistant ?? null,
                        text,
                      })
                    }
                  />
                )}
              </div>

              {checking && (
                <span className="text-ink-3 animate-[fade-rise_240ms_ease-out] font-mono text-[10px] tracking-[0.06em]">
                  checking your German…
                </span>
              )}
              {checkedClean && (
                <span className="text-ink-3 animate-[fade-rise_240ms_ease-out] font-mono text-[10px] tracking-[0.06em]">
                  ✓ no corrections
                </span>
              )}

              {correction?.correction && (
                <div className="border-line bg-panel relative animate-[fade-rise_240ms_ease-out] rounded-[14px] border-2 px-4 pt-[18px] pb-3.5 shadow-[3px_3px_0_var(--line)]">
                  <span
                    className={`border-line text-on-bright absolute -top-[11px] left-3.5 rounded-md border-2 px-2 py-px font-mono text-[10px] tracking-[0.08em] uppercase ${
                      correction.hasMistake ? 'bg-orange' : 'bg-yellow'
                    }`}
                  >
                    {correction.hasMistake
                      ? correction.mistakeType
                        ? MISTAKE_TYPE_LABELS[correction.mistakeType]
                        : 'grammar'
                      : 'in German'}
                  </span>

                  <div className="flex items-start gap-3">
                    <GlossedText
                      className="flex-1 text-[18px] leading-[1.6]"
                      text={correction.correction}
                      words={correction.correctionGloss ?? undefined}
                      highlight={changedWordIndices(priorUserText, correction.correction)}
                      canSave={canSave}
                      isSaved={isSaved}
                      onSave={(entry) => onSaveWord(entry, 'mistake', correction.correction ?? '')}
                    />
                    <TranslateButton
                      open={correctionOpen}
                      onToggle={() => onTogglePanel(correctionKey)}
                      className="mt-[3px]"
                    />
                  </div>

                  <div className="mt-3">
                    <TranslationPanel
                      open={correctionOpen}
                      translation={correction.correctionTranslation ?? null}
                      explanation={
                        explanations[correctionKey] ??
                        storedExplanations?.correction ??
                        undefined
                      }
                      explaining={explaining[correctionKey] ?? false}
                      onExplain={() =>
                        onExplain(correctionKey, {
                          kind: 'correction',
                          messageId: dbIds?.user ?? null,
                          text: correction.correction ?? '',
                          original: priorUserText,
                        })
                      }
                    />
                  </div>

                  <p className="text-ink-2 mt-3 font-mono text-[12.5px] leading-[1.6]">
                    {correction.explanation}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {status === 'submitted' && (
        <div className="flex max-w-[92%] items-start gap-3">
          <PersonaAvatar persona={persona} size={32} className="mt-[3px]" />
          <div className="text-[19px] leading-[1.6]">
            <span className="bg-accent inline-block h-[18px] w-[9px] animate-[blink_1s_step-end_infinite] align-[-3px]" />
          </div>
        </div>
      )}

      {error && (
        <p className="font-mono text-[12.5px] text-red-600 dark:text-red-400">
          Etwas ist schiefgelaufen. Bitte versuch es noch einmal.
        </p>
      )}
    </main>
  );
}

export function ChatComposer({
  input,
  busy,
  capped,
  signedIn,
  onInputChange,
  onSend,
}: {
  input: string;
  busy: boolean;
  capped: boolean;
  signedIn: boolean;
  onInputChange: (value: string) => void;
  onSend: (text: string) => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSend(input);
      }}
      className="bg-paper sticky bottom-0 flex flex-col gap-3 pt-3 pb-6"
    >
      <div className="bg-line h-0.5 opacity-50" />
      <div className="flex items-center gap-2.5">
        <input
          value={input}
          onChange={(event) => onInputChange(event.currentTarget.value)}
          disabled={capped}
          placeholder={
            capped
              ? signedIn
                ? 'Back tomorrow'
                : 'Sign in to keep going'
              : 'Schreib auf Deutsch… English words are fine too'
          }
          className="border-line bg-panel text-ink placeholder:text-ink-3 focus:shadow-[3px_3px_0_var(--line)] min-w-0 flex-1 rounded-full border-2 px-[18px] py-3 text-base outline-none transition-shadow duration-150 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || capped || !input.trim()}
          className="border-line bg-ink text-paper hover:bg-accent hover:text-on-accent flex-none cursor-pointer rounded-full border-2 px-[22px] py-3 text-[15px] font-bold transition-colors duration-150 active:translate-x-px active:translate-y-px disabled:opacity-40"
        >
          Senden
        </button>
      </div>
    </form>
  );
}
