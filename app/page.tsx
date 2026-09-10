'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';

import { CEFR_LEVELS, DEFAULT_CEFR_LEVEL, isCefrLevel, type CefrLevel } from '@/lib/prompts';

const LEVEL_COOKIE = 'cefr_level';

// Reads the cookie the API route also reads, so the dropdown reflects
// whatever was set on a previous visit instead of always resetting to A2.
function readLevelCookie(): CefrLevel {
  if (typeof document === 'undefined') return DEFAULT_CEFR_LEVEL;
  const match = document.cookie.match(/(?:^|; )cefr_level=([^;]+)/);
  const value = match ? decodeURIComponent(match[1]) : undefined;
  return isCefrLevel(value) ? value : DEFAULT_CEFR_LEVEL;
}

function writeLevelCookie(level: CefrLevel) {
  // One year, available on every path, since /api/chat needs to read it too.
  document.cookie = `${LEVEL_COOKIE}=${level}; path=/; max-age=31536000; SameSite=Lax`;
}

export default function Chat() {
  const [input, setInput] = useState('');
  const [level, setLevel] = useState<CefrLevel>(DEFAULT_CEFR_LEVEL);
  const { messages, sendMessage, status, error } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Cookie isn't available during server render, so sync from it after
  // mount rather than trying to read it as initial state.
  useEffect(() => {
    setLevel(readLevelCookie());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const busy = status === 'submitted' || status === 'streaming';

  function handleLevelChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    if (!isCefrLevel(next)) return;
    setLevel(next);
    writeLevelCookie(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput('');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold">Lang Tutor</h1>
            <span className="text-xs text-zinc-500">Deutsch üben</span>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            Level
            <select
              value={level}
              onChange={handleLevelChange}
              className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {messages.length === 0 && (
          <p className="mt-16 text-center text-sm text-zinc-500">
            Sag einfach Hallo — schreib etwas auf Deutsch, um anzufangen.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
            >
              <div
                className={
                  message.role === 'user'
                    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2 text-sm whitespace-pre-wrap text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-2 text-sm whitespace-pre-wrap dark:border-zinc-800 dark:bg-zinc-900'
                }
              >
                {message.parts.map((part, i) =>
                  part.type === 'text' ? <span key={`${message.id}-${i}`}>{part.text}</span> : null,
                )}
              </div>
            </div>
          ))}

          {status === 'submitted' && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                …
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Etwas ist schiefgelaufen. Bitte versuch es noch einmal.
            </p>
          )}
        </div>

        <div ref={bottomRef} />
      </main>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 border-t border-zinc-200 bg-zinc-50/80 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80"
      >
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="Schreib auf Deutsch…"
            className="flex-1 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Senden
          </button>
        </div>
      </form>
    </div>
  );
}
