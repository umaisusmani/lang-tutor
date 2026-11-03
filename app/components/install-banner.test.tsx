import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { InstallBanner } from '@/app/components/install-banner';

const prompt = vi.hoisted(() => ({ install: vi.fn(), dismiss: vi.fn(), available: true }));

vi.mock('@/app/hooks/use-install-prompt', () => ({
  useInstallPrompt: () => {
    const [canInstall, setCanInstall] = useState(prompt.available);
    return {
      canInstall,
      install: prompt.install,
      dismiss: () => { prompt.dismiss(); setCanInstall(false); },
    };
  },
}));

afterEach(() => {
  cleanup();
  prompt.available = true;
  prompt.install.mockClear();
  prompt.dismiss.mockClear();
});

test('renders nothing when installation is unavailable', () => {
  prompt.available = false;
  const { container } = render(<InstallBanner />);
  expect(container).toBeEmptyDOMElement();
});

test('tapping the row starts installation', () => {
  render(<InstallBanner />);
  fireEvent.click(screen.getByRole('button', { name: 'Install Starvogel' }));
  expect(prompt.install).toHaveBeenCalledOnce();
  expect(prompt.dismiss).not.toHaveBeenCalled();
});

test('tapping the dismiss control hides the row', () => {
  render(<InstallBanner />);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(prompt.dismiss).toHaveBeenCalledOnce();
  expect(prompt.install).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Install Starvogel' })).not.toBeInTheDocument();
});
