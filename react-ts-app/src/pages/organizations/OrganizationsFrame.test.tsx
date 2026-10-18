import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrganizationsFrame } from './OrganizationsFrame';

describe('OrganizationsFrame', () => {
  it('is the dashboard body, class for class, with the content owning its scroll', () => {
    const { container } = render(<OrganizationsFrame><p>List</p></OrganizationsFrame>);
    expect(container.firstChild).toHaveClass('relative', 'flex-1', 'min-h-0', 'w-full', 'flex', 'gap-3', 'px-4', 'pb-4');
    expect(screen.getByText('List').parentElement).toHaveClass('flex-1', 'min-w-0', 'min-h-0', 'overflow-y-auto', 'flex', 'flex-col');
  });

  it('puts a rail beside the content when given one', () => {
    render(<OrganizationsFrame rail={<aside aria-label="Ask Revenact" />}><p>List</p></OrganizationsFrame>);
    const rail = screen.getByRole('complementary', { name: 'Ask Revenact' });
    expect(screen.getByText('List').parentElement!.nextElementSibling).toBe(rail);
  });

  it('with bleed, keeps the 16px phone gutter inside the scroll column, so a -mx-4 strip reaches the edge without widening it', () => {
    const { container } = render(<OrganizationsFrame bleed><p>Page</p></OrganizationsFrame>);
    expect(container.firstChild).toHaveClass('px-0', 'sm:px-4');
    expect(container.firstChild).not.toHaveClass('sm:px-6');
    expect(container.firstChild).not.toHaveClass('px-4');
    expect(screen.getByText('Page').parentElement).toHaveClass('overflow-y-auto', 'px-4', 'sm:px-0');
  });
});
