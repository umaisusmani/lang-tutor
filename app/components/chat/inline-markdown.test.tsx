import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InlineMarkdown } from '@/app/components/chat/inline-markdown';

describe('InlineMarkdown', () => {
  it('renders bold and italic without literal asterisks', () => {
    const { container } = render(
      <InlineMarkdown text={'**German:**Der **Kahlschlag** war da.\n\n*Note:* use *machen*.'} />,
    );
    expect(container.querySelectorAll('strong')).toHaveLength(2);
    expect(screen.getByText('German:').tagName).toBe('STRONG');
    expect(container.querySelectorAll('em')).toHaveLength(2);
    expect(container.textContent).not.toContain('*');
  });

  it('renders bullet lines as list items', () => {
    render(<InlineMarkdown text={'- one\n- two'} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('leaves unterminated markers and HTML as plain text', () => {
    const { container } = render(<InlineMarkdown text={'**Kahl <b>x</b>'} />);
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<b>x</b>');
  });
});
