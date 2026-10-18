import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrainFrame } from './BrainFrame';

describe('BrainFrame (brain UI spec §1.4)', () => {
  it('scrolls one full-width column with a 16px gutter and no centred column', () => {
    render(
      <BrainFrame>
        <p>Body</p>
      </BrainFrame>,
    );
    const column = document.querySelector('[data-brain-frame]') as HTMLElement;
    expect(column).toHaveClass('h-full', 'overflow-y-auto');
    const stack = screen.getByText('Body').parentElement as HTMLElement;
    expect(stack).toHaveClass('flex', 'flex-col', 'gap-4', 'px-4', 'pb-6');
    expect(stack).toHaveClass('@container');
    for (const element of [column, stack]) expect(element.className).not.toMatch(/\bmx-auto\b|\bmax-w-/);
  });

  it('draws the rail beside the column when one is given, and nothing there otherwise', () => {
    const { rerender } = render(
      <BrainFrame>
        <p>Body</p>
      </BrainFrame>,
    );
    expect(screen.queryByRole('complementary')).toBeNull();
    rerender(
      <BrainFrame rail={<aside aria-label="Ask">rail</aside>}>
        <p>Body</p>
      </BrainFrame>,
    );
    const column = document.querySelector('[data-brain-frame]') as HTMLElement;
    expect(column.nextElementSibling).toBe(screen.getByRole('complementary', { name: 'Ask' }));
  });

  it("passes a page's own frame straight through inside the layout's, so the column and the rail are drawn once", () => {
    render(
      <BrainFrame rail={<aside aria-label="Ask">rail</aside>}>
        <BrainFrame>
          <p>Body</p>
        </BrainFrame>
      </BrainFrame>,
    );
    expect(document.querySelectorAll('[data-brain-frame]')).toHaveLength(1);
    expect(screen.getByText('Body').parentElement).toHaveClass('@container');
  });

  it('starts another page at the top of the shared column, and keeps the place within one', () => {
    const { rerender } = render(
      <BrainFrame scrollKey="/brain">
        <p>Body</p>
      </BrainFrame>,
    );
    const column = document.querySelector('[data-brain-frame]') as HTMLElement;
    column.scrollTop = 600;
    rerender(
      <BrainFrame scrollKey="/brain">
        <p>Body again</p>
      </BrainFrame>,
    );
    expect(column.scrollTop).toBe(600);
    rerender(
      <BrainFrame scrollKey="/brain/waiting">
        <p>Body</p>
      </BrainFrame>,
    );
    expect(column.scrollTop).toBe(0);
  });

  it('keeps the 16px gutter right of and below the rail from sm, and never on the phone sheet', () => {
    render(
      <BrainFrame rail={<aside aria-label="Ask">rail</aside>}>
        <p>Body</p>
      </BrainFrame>,
    );
    const frame = (document.querySelector('[data-brain-frame]') as HTMLElement).parentElement as HTMLElement;
    expect(frame).toHaveClass('sm:[&>:not([data-brain-frame])]:mr-4', 'sm:[&>:not([data-brain-frame])]:mb-4');
    expect(frame.className).not.toMatch(/(^|\s)\[&>/);
  });
});
