import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Menu } from './Menu';

function renderMenu({ portal = false } = {}) {
  const onArchive = vi.fn();
  const onChurn = vi.fn();
  render(
    <>
      <Menu
        portal={portal}
        label="More actions for Pizza Hut"
        trigger="More"
        triggerClassName=""
        items={[
          { key: 'archive', label: 'Archive', onSelect: onArchive },
          { key: 'churn', label: 'Churn', onSelect: onChurn, danger: true },
        ]}
      />
      <p>Outside</p>
    </>,
  );
  return { onArchive, onChurn, button: screen.getByRole('button', { name: 'More actions for Pizza Hut' }) };
}

describe('Menu', () => {
  it('opens with the first item focused; arrows, Home and End move and wrap', async () => {
    const { button } = renderMenu();
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'More actions for Pizza Hut' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Churn' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Churn' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the button', async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('runs the chosen item, closes, and focuses the button', async () => {
    const { button, onChurn } = renderMenu();
    await userEvent.click(button);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Churn' }));
    expect(onChurn).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it('closes on a press outside, and opens from the keyboard with ArrowDown', async () => {
    const { button } = renderMenu();
    await userEvent.click(button);
    await userEvent.click(screen.getByText('Outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    button.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
  });

  describe('in a portal (for menus inside a clipping box)', () => {
    afterEach(() => vi.restoreAllMocks());

    const place = (trigger: Partial<DOMRect>, menuHeight = 120) => {
      vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0, width: 44, height: 44, x: 0, y: 0, toJSON: () => ({}), ...trigger } as DOMRect);
      vi.spyOn(HTMLUListElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: menuHeight, left: 0, right: 176, width: 176, height: menuHeight, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    };

    it('renders the menu at the end of the page, under the button, with the same keys', async () => {
      place({ top: 100, bottom: 144, left: 300, right: 344 });
      const { button, onChurn } = renderMenu({ portal: true });
      await userEvent.click(button);
      const menu = screen.getByRole('menu', { name: 'More actions for Pizza Hut' });
      expect(button.parentElement!.contains(menu)).toBe(false);
      expect(menu.parentElement).toBe(document.body);
      expect(menu).toHaveAttribute('data-side', 'bottom');
      expect(menu.style.position).toBe('fixed');
      expect(menu.style.top).toBe('148px');
      expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
      await userEvent.keyboard('{End}');
      expect(screen.getByRole('menuitem', { name: 'Churn' })).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      expect(onChurn).toHaveBeenCalledOnce();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(button).toHaveFocus();
    });

    it('opens upward when there is no room below', async () => {
      place({ top: window.innerHeight - 50, bottom: window.innerHeight - 6, left: 300, right: 344 });
      const { button } = renderMenu({ portal: true });
      await userEvent.click(button);
      expect(screen.getByRole('menu')).toHaveAttribute('data-side', 'top');
    });

    it('closes on Escape (focus back on the button) and on a press outside', async () => {
      place({ top: 100, bottom: 144, left: 300, right: 344 });
      const { button } = renderMenu({ portal: true });
      await userEvent.click(button);
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(button).toHaveFocus();
      await userEvent.click(button);
      await userEvent.click(screen.getByText('Outside'));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('hands Tab back to the button rather than to the end of the page', async () => {
      place({ top: 100, bottom: 144, left: 300, right: 344 });
      const { button } = renderMenu({ portal: true });
      await userEvent.click(button);
      await userEvent.tab();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(button).toHaveFocus();
    });

    it('focuses the first item only once the menu is placed and visible (a hidden item cannot take focus)', async () => {
      place({ top: 100, bottom: 144, left: 300, right: 344 });
      const seen: string[] = [];
      const focus = HTMLElement.prototype.focus;
      vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
        if (this.getAttribute('role') === 'menuitem') seen.push(this.closest('ul')!.style.visibility);
        focus.call(this, options);
      });
      const { button } = renderMenu({ portal: true });
      await userEvent.click(button);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen).not.toContain('hidden');
      expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
    });

    it('closes on Escape by itself, even when a parent stops key events from bubbling', async () => {
      place({ top: 100, bottom: 144, left: 300, right: 344 });
      render(
        <span onKeyDown={(event) => event.stopPropagation()}>
          <Menu label="Card actions" trigger="More" triggerClassName="" portal items={[{ key: 'a', label: 'Open', onSelect: () => {} }]} />
        </span>,
      );
      const button = screen.getByRole('button', { name: 'Card actions' });
      await userEvent.click(button);
      expect(screen.getByRole('menu').parentElement).toBe(document.body);
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(button).toHaveFocus();
    });

    it('closes when the wheel zooms or pans whatever it sits on', async () => {
      place({ top: 100, bottom: 144, left: 300, right: 344 });
      const { button } = renderMenu({ portal: true });
      await userEvent.click(button);
      expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus();
      fireEvent.wheel(screen.getByText('Outside'), { deltaY: 40 });
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      // Focus was in the menu: it goes back to the button, not to the page.
      expect(button).toHaveFocus();
    });

    it('stays inside the viewport from side to side', async () => {
      // An end-aligned menu (176 wide) under a button 20px from the left edge would start off-screen.
      place({ top: 100, bottom: 144, left: 20, right: 64 });
      const { button } = renderMenu({ portal: true });
      await userEvent.click(button);
      const menu = screen.getByRole('menu');
      expect(parseFloat(menu.style.left)).toBeGreaterThanOrEqual(4);
      expect(menu.style.right).toBe('');
    });
  });

  it('portals by default and floats on the overlay surface (UI foundations spec §4.1)', async () => {
    render(<Menu label="More actions" trigger="More" triggerClassName="" items={[{ key: 'open', label: 'Open', onSelect: () => {} }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByRole('menu', { name: 'More actions' });
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass('rounded-xl', 'border-line', 'bg-elevated', 'shadow-lg');
    expect(menu.className).not.toMatch(/shadow-md/);
  });

  it('sets a destructive item in the readable danger ink', async () => {
    render(<Menu label="Actions" trigger="More" triggerClassName="" items={[{ key: 'churn', label: 'Churn', onSelect: () => {}, danger: true }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menuitem', { name: 'Churn' })).toHaveClass('text-danger-ink');
  });
});
