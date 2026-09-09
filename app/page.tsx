'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  const busy = status === 'submitted' || status === 'streaming';

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
        <div className="mx-auto flex max-w-2xl items-baseline gap-2">
          <h1 className="text-sm font-semibold">Lang Tutor</h1>
          <span className="text-xs text-zinc-500">Deutsch üben</span>
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
