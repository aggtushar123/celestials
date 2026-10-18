import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountTag, AccountText, ListSearch, ListSkeleton, NoMatch, ScopedEmpty, SummaryLine } from './ListParts';

describe('the list parts People, Deals & risks and Files share', () => {
  it('tags a record with its account, truncating a long name', () => {
    render(<AccountTag record={{ account_id: 31, account_name: "EMEA" }} />);
    expect(screen.getByText('EMEA')).toHaveClass('truncate');
    expect(screen.getByText('EMEA').parentElement).toHaveClass('bg-subtle', 'rounded-full', 'max-w-[10rem]');
  });

  it("never tags an organisation's own record (a badge restating the page's record, spec §7)", () => {
    const { container } = render(
      <>
        <AccountTag record={{ account_id: null, account_name: null }} />
        <AccountText record={{ account_id: null }} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('writes a summary as one line, its figures in tabular numerals', () => {
    render(
      <SummaryLine
        parts={[
          { value: '3', label: 'people' },
          { value: '67%', label: 'positive sentiment' },
        ]}
      />,
    );
    expect(document.querySelector('[data-summary]')).toHaveTextContent('3 people · 67% positive sentiment');
    expect(screen.getByText('67%')).toHaveClass('tabular-nums');
    expect(screen.getByText('67%')).not.toHaveClass('font-mono-brand');
  });

  it('shows a named skeleton list while loading', () => {
    render(<ListSkeleton label="Loading people" />);
    expect(screen.getByRole('status', { name: 'Loading people' })).toBeInTheDocument();
  });

  it('offers All when the chosen account has nothing, and says "yet" otherwise', async () => {
    const onShowAll = vi.fn();
    const { unmount } = render(<ScopedEmpty what="people" scope="EMEA" detail="Add the people you work with here." onShowAll={onShowAll} />);
    expect(screen.getByText('No people on EMEA')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all accounts' }));
    expect(onShowAll).toHaveBeenCalledOnce();
    unmount();
    render(<ScopedEmpty what="people" scope={null} detail="Add the people you work with here." onShowAll={onShowAll} />);
    expect(screen.getByText('No people yet')).toBeInTheDocument();
    expect(screen.getByText('Add the people you work with here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all accounts' })).not.toBeInTheDocument();
  });

  it('says nothing matches a search, and clears it', async () => {
    const onClear = vi.fn();
    render(<NoMatch q=" zzz " onClear={onClear} />);
    expect(screen.getByText('Nothing matches “zzz”')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear search for “zzz”' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('sets a summary as a card header meta when asked for a span', () => {
    render(<SummaryLine as="span" parts={[{ value: '3', label: 'people' }]} />);
    expect(document.querySelector('[data-summary]')?.tagName).toBe('SPAN');
  });

  it('labels its search, with a 44px field below sm', async () => {
    const onChange = vi.fn();
    render(<ListSearch label="Search people" value="" onChange={onChange} isSm={false} />);
    const box = screen.getByRole('searchbox', { name: 'Search people' });
    expect(box).toHaveClass('min-h-11', 'sm:min-h-9');
    await userEvent.type(box, 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });
});
