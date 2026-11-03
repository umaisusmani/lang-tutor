'use client';

import { useEffect, useState } from 'react';

import { useConfirm } from '@/app/components/confirm-modal';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallMode = 'hidden' | 'browser' | 'ios';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useInstallPrompt() {
  const confirm = useConfirm();
  const [mode, setMode] = useState<InstallMode>('hidden');
  const [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const installed = () => {
      setPromptEvent(null);
      setMode('hidden');
    };
    const onDisplayModeChange = () => {
      if (isStandalone()) installed();
    };
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      if (isStandalone()) return;
      setPromptEvent(event as InstallEvent);
      setMode('browser');
    };

    if (!isStandalone() && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
      queueMicrotask(() => { if (!isStandalone()) setMode('ios'); });
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', installed);
    displayMode?.addEventListener?.('change', onDisplayModeChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', installed);
      displayMode?.removeEventListener?.('change', onDisplayModeChange);
    };
  }, []);

  async function install() {
    if (isStandalone()) {
      setMode('hidden');
      return;
    }
    if (mode === 'ios') {
      await confirm({
        title: 'Install Starvogel',
        description: 'Tap the Share button, then "Add to Home Screen".',
        confirmLabel: 'Got it',
        cancelLabel: 'Close',
      });
      return;
    }
    if (mode === 'browser' && promptEvent) {
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setPromptEvent(null);
      setMode('hidden');
    }
  }

  return { canInstall: mode !== 'hidden', install };
}
