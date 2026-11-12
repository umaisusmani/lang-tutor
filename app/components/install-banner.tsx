'use client';

import { Button } from '@/app/components/button';
import { Pill } from '@/app/components/pill';
import { activeLanguage } from '@/lib/languages';
import { useInstallPrompt } from '@/app/hooks/use-install-prompt';

export function InstallBanner() {
  const { canInstall, install, dismiss } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <div className="border-line bg-panel fixed bottom-20 left-3 z-20 flex items-center rounded-full border-2 p-1 shadow-[3px_3px_0_var(--line)] animate-[fade-rise_160ms_ease-out] sm:hidden">
      <Button
        type="button"
        variant="secondary"
        onClick={() => void install()}
        className="gap-2 !border-0 !bg-transparent !px-1.5 !py-0 !text-[13px] !shadow-none"
      >
        <span aria-hidden className="bg-yellow border-line flex h-8 w-8 items-center justify-center rounded-[10px] border-2 font-display text-xl leading-none text-on-bright">S</span>
        Install {activeLanguage.appName}
      </Button>
      <Pill type="button" hitArea aria-label="Dismiss" onClick={dismiss} className="text-ink">×</Pill>
    </div>
  );
}
