import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { ConfirmProvider } from '@/app/components/confirm-modal';
import { useInstallPrompt } from '@/app/hooks/use-install-prompt';

function InstallHarness() {
  const { canInstall, install } = useInstallPrompt();
  return canInstall ? <button onClick={() => void install()}>Install app</button> : null;
}

function renderInstallOption() {
  render(<ConfirmProvider><InstallHarness /></ConfirmProvider>);
}

function stubDisplayMode(matches: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('browser install prompt appears when offered and runs the saved prompt', async () => {
  stubDisplayMode(false);
  renderInstallOption();
  expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt,
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  });
  fireEvent(window, event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
  expect(prompt).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument());
});

test('standalone display mode never exposes the install option', () => {
  stubDisplayMode(true);
  renderInstallOption();
  fireEvent(window, Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  }));
  expect(screen.queryByRole('button', { name: 'Install app' })).not.toBeInTheDocument();
});

test('iOS install option opens home screen instructions', async () => {
  stubDisplayMode(false);
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  renderInstallOption();
  fireEvent.click(await screen.findByRole('button', { name: 'Install app' }));
  expect(await screen.findByText('Tap the Share button, then "Add to Home Screen".')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
});
