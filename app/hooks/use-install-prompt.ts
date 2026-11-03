'use client';

import { useEffect, useState } from 'react';

import { useConfirm } from '@/app/components/confirm-modal';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallMode = 'hidden' | 'browser' | 'ios';

// Route navigation can remount the header without starting a new page load.
let dismissedThisPageLoad = false;

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function useInstallPrompt() {
  const confirm = useConfirm();
  const [mode, setMode] = useState<InstallMode>('hidden');
  const [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(dismissedThisPageLoad);

  useEffect(() => {
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const phone = window.matchMedia?.('(max-width: 640px)');
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const installed = () => {
      setPromptEvent(null);
      setMode('hidden');
    };
    const onDisplayModeChange = () => {
      if (isStandalone()) installed();
    };
    const onPhoneChange = () => {
      if (!phone?.matches || isStandalone()) {
        setMode('hidden');
        return;
      }
      setMode(promptEvent ? 'browser' : ios ? 'ios' : 'hidden');
    };
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      if (isStandalone()) return;
      setPromptEvent(event as InstallEvent);
      setMode(phone?.matches ? 'browser' : 'hidden');
    };

    if (ios) {
      queueMicrotask(onPhoneChange);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', installed);
    displayMode?.addEventListener?.('change', onDisplayModeChange);
    phone?.addEventListener?.('change', onPhoneChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', installed);
      displayMode?.removeEventListener?.('change', onDisplayModeChange);
      phone?.removeEventListener?.('change', onPhoneChange);
    };
  }, [promptEvent]);

  async function install() {
    if (dismissed || !window.matchMedia?.('(max-width: 640px)').matches) return;
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

  function dismiss() {
    dismissedThisPageLoad = true;
    setDismissed(true);
  }

  return { canInstall: !dismissed && mode !== 'hidden', install, dismiss };
}
