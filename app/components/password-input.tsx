'use client';

import { useState } from 'react';

/** A password field with a "Show"/"Hide" toggle, otherwise a plain uncontrolled input. */
export function PasswordInput({
  id,
  name,
  autoComplete,
  required,
  minLength,
  maxLength,
  className,
}: {
  id: string;
  name: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  className: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={shown ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className={`${className} pr-16`}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="text-ink-2 hover:text-ink absolute inset-y-0 right-3 min-h-11 min-w-11 cursor-pointer font-mono text-[11px] font-bold tracking-[0.04em] uppercase"
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
