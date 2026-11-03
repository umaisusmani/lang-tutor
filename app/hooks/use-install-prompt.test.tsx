import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { ConfirmProvider } from '@/app/components/confirm-modal';
import { useInstallPrompt } from '@/app/hooks/use-install-prompt';

function InstallHarness() {
  const { canInstall, install, dismiss } = useInstallPrompt();
  return canInstall ? <><button onClick={() => void install()}>Install app</button><button onClick={dismiss}>Dismiss</button></> : null;
}

function renderInstallOption() {
  render(<ConfirmProvider><InstallHarness /></ConfirmProvider>);
}

function stubMedia({ standalone = false, phone = true } = {}) {
  const listeners = new Set<() => void>();
  const phoneQuery = {
    matches: phone,
    addEventListener: (_type: string, listener: () => void) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
  };
  vi.stubGlobal('matchMedia', (query: string) => query === '(max-width: 640px)'
    ? phoneQuery
    : { matches: standalone, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  return {
    setPhone(matches: boolean) {
      act(() => {
        phoneQuery.matches = matches;
        listeners.forEach((listener) => listener());
      });
    },
  };
}

function offerBrowserInstall() {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  fireEvent(window, event);
  return { event, prompt };
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('browser install prompt appears when offered and runs the saved prompt', async () => {
  stubMedia();
  renderInstallOption();
  expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  const { event, prompt } = offerBrowserInstall();
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
  expect(prompt).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument());
});

test('standalone display mode never exposes the install option', () => {
  stubMedia({ standalone: true });
  renderInstallOption();
  offerBrowserInstall();
  expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
});

test('browser prompt stays hidden on desktop and follows phone viewport changes', () => {
  const media = stubMedia({ phone: false });
  renderInstallOption();
  const { event } = offerBrowserInstall();
  expect(event.defaultPrevented).toBe(true);
  expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  media.setPhone(true);
  expect(screen.getByRole('button', { name: 'Install app' })).toBeInTheDocument();
  media.setPhone(false);
  expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
});

test('iOS prompt stays hidden on desktop', async () => {
  stubMedia({ phone: false });
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
  renderInstallOption();
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
});

test('iOS install option opens home screen instructions', async () => {
  stubMedia();
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  renderInstallOption();
  fireEvent.click(await screen.findByRole('button', { name: 'Install app' }));
  expect(await screen.findByText('Tap the Share button, then "Add to Home Screen".')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
});

test('dismissal hides the prompt through viewport changes and header remounts', () => {
  const media = stubMedia();
  const view = render(<ConfirmProvider><InstallHarness /></ConfirmProvider>);
  const { prompt } = offerBrowserInstall();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  media.setPhone(false);
  media.setPhone(true);
  offerBrowserInstall();
  expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  view.unmount();
  renderInstallOption();
  offerBrowserInstall();
  expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  expect(prompt).not.toHaveBeenCalled();
});
