'use client';

import type { ChatStatus } from 'ai';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { Button } from '@/app/components/button';
import { GlossedText } from '@/app/components/glossed-text';
import { Pill } from '@/app/components/pill';
import { PersonaAvatar } from '@/app/components/persona-avatar';
import { notifyError } from '@/app/components/toaster';
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
import type { Correction } from '@/lib/tutor';
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

function messageText(message: LangTutorUIMessage, separator = '\n'): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(separator);
}

export function ChatWelcome({
  level,
  remaining,
  signedIn,
  starters,
  disabled,
  persona,
  onSend,
}: {
  level: CefrLevel;
  remaining: number | null;
  signedIn: boolean;
  starters: Starter[];
  disabled: boolean;
  persona: PersonaProfile;
  onSend: (text: string) => void;
}) {
  return (
    <main className="flex min-h-full flex-col justify-start gap-[26px] py-6 md:justify-center md:py-10">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <PersonaAvatar persona={persona} size={48} />
          <div className="flex flex-col">
            <span className="font-display text-[22px] tracking-[0.04em]">{persona.name}</span>
            <span className="text-ink-3 font-mono text-[11px]">
              {[persona.age, persona.city].filter((value) => value != null).join(' · ')}
            </span>
          </div>
        </div>
        <span className="font-display text-ink-3 text-[13px] tracking-[0.12em] uppercase">
          level {level}
          {remaining !== null && ` · ${remaining} ${signedIn ? 'messages left' : 'free messages'}`}
        </span>
        <h1 className="font-display text-[52px] leading-none font-black tracking-[0.02em]">
          Sag einfach <span className="text-accent">etwas</span>.
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
            disabled={disabled}
            onClick={() => onSend(de)}
            className="border-line bg-panel hover:shadow-[3px_3px_0_var(--line)] flex cursor-pointer flex-col gap-[3px] rounded-[14px] border-2 px-4 py-3.5 text-left transition-transform hover:-translate-x-px hover:-translate-y-px"
          >
            <span className="text-ink text-[17px]">{de}</span>
            <span className="text-ink-3 font-mono text-[11px]">{en}</span>
          </button>
        ))}
      </div>
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
  onSaveGrammarNote: (note: string, exampleSentence: string) => Promise<{ ok: boolean }>;
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
  onSaveGrammarNote,
  onExplain,
}: ChatThreadProps) {
  const busy = status === 'submitted' || status === 'streaming';

  return (
    <main className="flex min-h-full flex-col gap-[34px] px-2 pt-[22px] pb-7">
      <p className="sr-only" role="status">
        {busy ? 'The tutor is replying.' : messages.length > 0 ? 'Reply complete.' : ''}
      </p>
      {messages.map((message, messageIndex) => {
        const text = messageText(message);
        const rateLimited = message.parts.find((part) => part.type === 'data-rateLimited')?.data;

        if (rateLimited) {
          return <p key={message.id} className="text-ink-3 text-sm" role="status">This message was not sent.</p>;
        }

        if (message.role === 'user') {
          return (
            <div key={message.id} className="flex justify-end">
              <div className="border-line bg-accent text-on-accent max-w-[82%] animate-[fade-from-right_180ms_ease-out] rounded-[18px_18px_5px_18px] border-2 px-4 py-[11px] text-[17px] leading-[1.45] break-words whitespace-pre-wrap shadow-[3px_3px_0_var(--line)]">
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
        const correctionFailed = message.parts.some(
          (part) => part.type === 'data-correctionCheck' && part.data.status === 'failed',
        );
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
        const checking =
          inFlight && !correctionPart && !correctionFailed && priorUserText.trim() !== '';
        const checkedClean =
          !!correctionPart &&
          !correctionPart.data.hasMistake &&
          !correctionPart.data.usedEnglish;

        return (
          <div key={message.id} className="flex max-w-[92%] animate-[fade-rise_180ms_ease-out] items-start gap-3">
            <PersonaAvatar persona={persona} size={32} className="mt-[3px]" />

            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:gap-3">
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
                  <div className="flex flex-none items-start gap-1.5">
                    {replyGloss ? (
                      <TranslateButton
                        open={replyOpen}
                        onToggle={() => onTogglePanel(replyKey)}
                        className="sm:mt-[5px]"
                      />
                    ) : (
                      inFlight && (
                        <TranslateButton
                          open={false}
                          pending
                          onToggle={() => {}}
                          className="sm:mt-[5px]"
                        />
                      )
                    )}
                  </div>
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
              {correctionFailed && (
                <span className="font-mono text-[11px] text-red-600 dark:text-red-400">
                  Couldn&apos;t check your German this time.
                </span>
              )}

              {correction?.correction && (
                <CorrectionCard
                  correction={correction}
                  priorUserText={priorUserText}
                  translationOpen={correctionOpen}
                  explanation={explanations[correctionKey] ?? storedExplanations?.correction ?? undefined}
                  explaining={explaining[correctionKey] ?? false}
                  canSave={canSave}
                  isSaved={isSaved}
                  onToggleTranslation={() => onTogglePanel(correctionKey)}
                  onSaveWord={onSaveWord}
                  onSaveGrammarNote={onSaveGrammarNote}
                  onExplain={() => onExplain(correctionKey, {
                    kind: 'correction',
                    messageId: dbIds?.user ?? null,
                    text: correction.correction ?? '',
                    original: priorUserText,
                  })}
                />
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
        <p role="alert" className="font-mono text-[12.5px] text-red-600 dark:text-red-400">
          Something went wrong. Please try again.
        </p>
      )}
    </main>
  );
}

function CorrectionCard({
  correction,
  priorUserText,
  translationOpen,
  explanation,
  explaining,
  canSave,
  isSaved,
  onToggleTranslation,
  onSaveWord,
  onSaveGrammarNote,
  onExplain,
}: {
  correction: Correction;
  priorUserText: string;
  translationOpen: boolean;
  explanation: string | undefined;
  explaining: boolean;
  canSave: boolean;
  isSaved: (lemma: string) => boolean;
  onToggleTranslation: () => void;
  onSaveWord: ChatThreadProps['onSaveWord'];
  onSaveGrammarNote: ChatThreadProps['onSaveGrammarNote'];
  onExplain: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(correction.explanation ?? '');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteError, setNoteError] = useState(false);
  async function saveNote() {
    if (savingNote || !noteDraft.trim()) return;
    setSavingNote(true);
    let ok = false;
    try {
      ({ ok } = await onSaveGrammarNote(noteDraft, correction.correction ?? ''));
    } catch {
      // A rejected action is handled like an unsuccessful save.
    }
    setSavingNote(false);
    if (ok) {
      setNoteSaved(true);
      setEditingNote(false);
      setNoteError(false);
    } else {
      setNoteError(true);
      notifyError("Couldn't save this note. Please try again.", 'save-grammar-note');
    }
  }
  const corrected = correction.correction ?? '';
  const changed = changedWordIndices(priorUserText, corrected);
  const count = changed.size;
  const summary = count === 0
    ? '1 correction'
    : `${count} ${count === 1 ? 'word' : 'words'} ${correction.hasMistake ? 'fixed' : 'in German'}`;

  return (
    <div className="border-line bg-panel relative animate-[fade-rise_240ms_ease-out] rounded-[14px] border-2 px-4 shadow-[3px_3px_0_var(--line)]">
      <span
        className={`border-line text-on-bright font-display absolute -top-[11px] left-3.5 rounded-md border-2 px-2 py-px text-[13px] tracking-[0.1em] uppercase ${
          correction.hasMistake ? 'bg-orange' : 'bg-yellow'
        }`}
      >
        {correction.hasMistake
          ? correction.mistakeType
            ? MISTAKE_TYPE_LABELS[correction.mistakeType]
            : 'grammar'
          : 'in German'}
      </span>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Hide correction' : 'Show correction'}
        onClick={() => setOpen((current) => !current)}
        className="text-ink-3 hover:text-ink absolute top-0 right-0 z-10 flex min-h-11 min-w-11 cursor-pointer items-center justify-center text-base"
      >
        <span aria-hidden="true" className={`inline-block transition-transform duration-[160ms] ease-out ${open ? '' : '-rotate-90'}`}>▾</span>
      </button>
      {!open && <div className="text-ink-2 flex min-h-11 animate-[fade-rise_160ms_ease-out] items-center pr-10 font-mono text-[11px]">{summary}</div>}
      <div className="gloss-panel" data-open={open} inert={!open}>
        <div className="pt-[18px] pb-3.5">
          <div className="flex flex-col items-start gap-2 pr-8 sm:flex-row sm:items-start sm:gap-3">
            <GlossedText
              className="flex-1 text-[18px] leading-[1.6]"
              text={corrected}
              words={correction.correctionGloss ?? undefined}
              highlight={changed}
              canSave={canSave}
              isSaved={isSaved}
              onSave={(entry) => onSaveWord(entry, 'mistake', corrected)}
            />
            <div className="flex flex-none items-start gap-1.5">
              <TranslateButton
                open={translationOpen}
                onToggle={onToggleTranslation}
                className="sm:mt-[3px]"
              />
            </div>
          </div>

          <div className="mt-3">
            <TranslationPanel
              open={translationOpen}
              translation={correction.correctionTranslation ?? null}
              explanation={explanation}
              explaining={explaining}
              onExplain={onExplain}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-start gap-2">
            <p className="text-explain-ink min-w-[180px] flex-1 font-mono text-[12.5px] leading-[1.6]">
              {correction.explanation}
            </p>
            {canSave && correction.explanation && !editingNote && (
              noteSaved ? <span className="text-ink-3 font-mono text-[11px]">✓ saved as note</span>
                : <Pill hitArea onClick={() => setEditingNote(true)}>+ save as note</Pill>
            )}
          </div>
          {canSave && correction.explanation && editingNote && !noteSaved && (
            <div className="mt-2 flex flex-col gap-2">
              <textarea aria-label="Grammar note" value={noteDraft} maxLength={500} rows={3}
                onChange={(event) => setNoteDraft(event.target.value)}
                className="border-hair bg-panel text-ink focus:border-line w-full resize-y rounded-xl border-2 px-3 py-2.5 text-sm outline-none" />
              {noteError && <span role="alert" className="text-ink-2 text-sm">Couldn&apos;t save this note. Please try again.</span>}
              <div className="flex gap-2">
                <Pill hitArea disabled={savingNote || !noteDraft.trim()} onClick={() => void saveNote()}>{savingNote ? 'saving…' : 'Save'}</Pill>
                <Pill hitArea disabled={savingNote} onClick={() => { setEditingNote(false); setNoteError(false); }}>Cancel</Pill>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatComposer({
  input,
  busy,
  capped,
  hideInput = false,
  quotaNotice,
  onInputChange,
  onSend,
}: {
  input: string;
  busy: boolean;
  capped: boolean;
  /** Once the daily cap is hit, the notice becomes a full takeover card that
   * replaces the input row entirely, rather than sitting disabled above it. */
  hideInput?: boolean;
  quotaNotice: ReactNode;
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
      {quotaNotice}
      {!hideInput && (
        <>
          <div className="bg-line h-0.5 opacity-50" />
          <div className="flex items-center gap-2.5">
            <input
              value={input}
              onChange={(event) => onInputChange(event.currentTarget.value)}
              disabled={capped}
              aria-label="Message in German"
              placeholder="Schreib auf Deutsch… English words are fine too"
              className="border-line bg-panel text-ink placeholder:text-ink-3 focus:shadow-[3px_3px_0_var(--line)] min-w-0 flex-1 rounded-full border-2 px-[18px] py-3 text-base outline-none transition-shadow duration-150 disabled:opacity-60"
            />
            <Button
              variant="dark"
              type="submit"
              disabled={busy || capped || !input.trim()}
              className="flex-none px-[22px] py-3 text-xl active:translate-x-px active:translate-y-px"
            >
              Senden
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
