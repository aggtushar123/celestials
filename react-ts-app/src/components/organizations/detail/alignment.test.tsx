import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { Customer, Headline } from '../../../features/customers/customersSlice';
import { pizzaHut } from '../../../features/organizations/testPortfolio';
import { pizzaHutCustomer, stubOrganizationPage } from '../../../features/organizations/testStory';
import { makeDetailStore, renderOrganizationPage } from '../../../pages/organizations/testDetail';
import { resetViewport } from '../../../test/viewport';
import { ContactsTab } from '../../shared/ContactsTab';
import { CallSenseTab } from '../activity/CallSenseTab';
import { HeadlinesTab } from '../activity/HeadlinesTab';
import { CompanyViewTab } from '../CompanyViewTab';
import { AccountDetails } from '../portfolio/AccountDetails';
import { CustomerFacts } from './CustomerFacts';
import { DetailsTab } from './DetailsTab';
import { FilesCallsTab } from './FilesCallsTab';

// jsdom has no layout, so the alignment pass (2026-09-27) is pinned by class:
// on the organization page every tab's content spans the page column, and
// every other route keeps what it had.

function renderWithStore(ui: ReactNode) {
  return render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  );
}

const INSET = ['max-w-7xl', 'mx-auto', 'p-6', 'overflow-y-auto', 'h-full'];

const headline: Headline = {
  id: 1,
  kind: 'headline',
  kind_display: 'Headline',
  title: 'Renewal on track',
  content: 'The renewal is moving.',
  status: 'open',
  status_display: 'Open',
  period_start: '2026-08-01',
  period_end: '2026-09-01',
  time_period_label: '',
  data_sources: ['notes'],
  data_sources_display: 'Notes',
  group: 'September 2026',
  generated_at: null,
  created_at: '2026-09-01T00:00:00Z',
};

describe('alignment on the organization page', () => {
  beforeEach(() => {
    stubOrganizationPage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  describe('People renders flush, other routes keep their inset', () => {
    it('ContactsTab: embedded has no scroll area, padding or max width; the default is unchanged', () => {
      const { container, unmount } = renderWithStore(<ContactsTab contacts={[]} isLoading={false} error={null} customerId={7} embedded />);
      const root = container.firstElementChild as HTMLElement;
      for (const cls of INSET) expect(root).not.toHaveClass(cls);
      for (const child of root.children) expect(child).not.toHaveClass('max-w-7xl', 'mx-auto');
      expect(root.children[0]).toHaveClass('w-full');
      expect(root.children[1]).toHaveClass('w-full');
      unmount();

      const plain = renderWithStore(<ContactsTab contacts={[]} isLoading={false} error={null} customerId={7} />).container
        .firstElementChild as HTMLElement;
      expect(plain).toHaveClass('h-full', 'overflow-y-auto', 'p-6', 'pt-2');
      expect(plain.children[0]).toHaveClass('max-w-7xl', 'mx-auto');
      expect(plain.children[1]).toHaveClass('max-w-7xl', 'mx-auto');
    });
  });

  describe('Knowledge', () => {
    it('embedded: the cards span the column, the owner is a divided row, and the pickers share a grid', () => {
      const { container } = renderWithStore(<CompanyViewTab customerId={7} customerName="Pizza Hut" embedded />);
      const root = container.firstElementChild as HTMLElement;
      expect(root).not.toHaveClass('max-w-5xl');
      expect(root).not.toHaveClass('mx-auto');
      const owner = container.querySelector('[data-owner-tile]')!;
      expect(owner).toHaveAttribute('data-owner-tile', 'row');
      expect(owner).toHaveClass('border-t');
      expect(owner).not.toHaveClass('border', 'rounded-lg', 'bg-accent-dim/40');
      expect(container.querySelector('[data-owners]')).toHaveClass('sm:grid-cols-2', 'lg:grid-cols-3');
    });

    it('the account page keeps its centred column, with the owner as a row and the same picker grid', () => {
      const { container } = renderWithStore(<CompanyViewTab customerId={7} customerName="Pizza Hut" />);
      expect(container.firstElementChild).toHaveClass('max-w-5xl', 'mx-auto');
      expect(container.querySelector('[data-owner-tile]')).toHaveAttribute('data-owner-tile', 'row');
      expect(container.querySelector('[data-owners]')).toHaveClass('sm:grid-cols-2', 'lg:grid-cols-3');
    });

    it('Knowledge has one Headlines heading: the page\'s, with Regenerate kept in the card', async () => {
      const { KnowledgeTab } = await import('./KnowledgeTab');
      const page = renderWithStore(<KnowledgeTab customerId={7} customerName="Pizza Hut" />);
      expect(screen.getByRole('region', { name: 'Headlines' })).toBeInTheDocument();
      page.unmount();
      const { unmount } = render(<HeadlinesTab headlines={[headline]} isLoading={false} error={null} onRegenerate={async () => {}} embedded />);
      expect(screen.queryByRole('heading', { name: 'Account Headlines' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Regenerate/ })).toBeInTheDocument();
      unmount();
      render(<HeadlinesTab headlines={[headline]} isLoading={false} error={null} />);
      expect(screen.getByRole('heading', { name: 'Headlines' })).toBeInTheDocument();
    });

    it('HeadlinesTab: embedded is a card with no scroll area; the default keeps its own', () => {
      const { container, unmount } = render(<HeadlinesTab headlines={[headline]} isLoading={false} error={null} embedded />);
      expect(container.firstElementChild).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
      expect(container.firstElementChild).not.toHaveClass('overflow-y-auto', 'flex-1', 'p-6', 'md:p-8');
      unmount();
      const plain = render(<HeadlinesTab headlines={[headline]} isLoading={false} error={null} />).container;
      expect(plain.firstElementChild).toHaveClass('flex-1', 'overflow-y-auto');
      expect(plain.firstElementChild?.firstElementChild).toHaveClass('rounded-xl', 'border-line', 'bg-surface');
    });
  });

  describe('Files', () => {
    it('has one Files and one Calls heading, and no scroll area or rail inside either', () => {
      renderWithStore(<FilesCallsTab customerId={7} account="" accounts={[]} isSm active onCallLogged={() => {}} onShowAll={() => {}} />);
      expect(screen.getAllByRole('heading', { name: 'Files' })).toHaveLength(1);
      expect(screen.getAllByRole('heading', { name: 'Calls' })).toHaveLength(1);
      for (const name of ['Files', 'Calls']) {
        const section = screen.getByRole('region', { name });
        expect(section.querySelector('.overflow-y-auto, .overflow-auto, [data-calls-list]')).toBeNull();
        expect(section).not.toHaveClass('max-w-7xl', 'mx-auto', 'px-6', 'px-8');
      }
    });

    it('CallSenseTab keeps its own scroll by default (the account page feed)', () => {
      const { container } = renderWithStore(<CallSenseTab entityType="organization" entityId={7} />);
      expect(container.firstElementChild).toHaveClass('flex-1', 'overflow-hidden');
      expect(container.querySelector('[data-calls-list]')).toHaveClass('flex-1', 'overflow-y-auto');
    });
  });

  describe('Details', () => {
    const customer = {
      ...pizzaHutCustomer,
      csat_breakdown: {
        responses: 1240,
        bands: [
          { key: 'very_satisfied', label: 'Very Satisfied', count: 1000, share: 80.6 },
          { key: 'satisfied', label: 'Satisfied', count: 200, share: 16.1 },
          { key: 'neutral', label: 'Neutral', count: 40, share: 3.2 },
          { key: 'dissatisfied', label: 'Dissatisfied', count: 0, share: 0 },
          { key: 'very_dissatisfied', label: 'Very Dissatisfied', count: 0, share: 0 },
        ],
      },
    } as Customer;

    it('every CSAT row shares one template with a fixed, right-aligned count column', () => {
      render(<CustomerFacts customer={customer} error={null} stacked={false} onRetry={() => {}} />);
      const rows = within(screen.getByRole('list', { name: 'CSAT responses by band' })).getAllByRole('listitem');
      expect(new Set(rows.map((row) => row.className)).size).toBe(1);
      expect(rows[0]).toHaveClass('grid-cols-[minmax(0,8rem)_minmax(0,1fr)_7rem]');
      for (const count of document.querySelectorAll('[data-count]')) {
        expect(count).toHaveClass('text-right', 'tabular-nums');
      }
    });

    it('contact and CSAT follow the panels: halves at md, a third and two thirds at xl; stacked on phones', () => {
      const { unmount } = render(<CustomerFacts customer={customer} error={null} stacked={false} onRetry={() => {}} />);
      expect(document.querySelector('[data-facts]')).toHaveClass('md:grid-cols-2', 'xl:grid-cols-3');
      expect(document.querySelector('[data-csat]')).toHaveClass('xl:col-span-2');
      unmount();
      render(<CustomerFacts customer={customer} error={null} stacked onRetry={() => {}} />);
      expect(document.querySelector('[data-facts]')).not.toHaveClass('md:grid-cols-2');
      expect(document.querySelector('[data-csat]')).not.toHaveClass('xl:col-span-2');
    });

    it('panel labels are never truncated: the label column fits them and long values wrap', () => {
      render(<AccountDetails row={pizzaHut} today="2026-09-27" />);
      const lists = document.querySelectorAll('[data-panel] dl');
      expect(lists.length).toBeGreaterThan(0);
      for (const dl of lists) expect(dl).toHaveClass('grid-cols-[fit-content(60%)_minmax(0,1fr)]');
      for (const dt of document.querySelectorAll('[data-panel] dt')) expect(dt).not.toHaveClass('truncate');
      for (const dd of document.querySelectorAll('[data-panel] dd')) expect(dd).toHaveClass('break-words');
    });

    it('Edit details sits on the heading row, above the panels', () => {
      const accounts = { items: [], loading: false, error: null, onRetry: () => {}, onAdd: () => {}, onEdit: () => {} };
      renderWithStore(
        <DetailsTab
          row={pizzaHut}
          customerId={7}
          isSm
          accounts={accounts}
          customer={pizzaHutCustomer}
          customerError={null}
          onRetryCustomer={() => {}}
          onEdit={() => {}}
        />,
      );
      const edit = screen.getByRole('button', { name: 'Edit details' });
      const headingRow = document.querySelector('[data-part="details-heading"]')!;
      expect(headingRow).toContainElement(edit);
      expect(within(headingRow as HTMLElement).getByRole('heading', { name: 'Organization details' })).toBeInTheDocument();
      expect(edit.compareDocumentPosition(document.querySelector('[data-panel="commercial"]')!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(screen.getAllByRole('button', { name: 'Edit details' })).toHaveLength(1);
    });
  });

  it('the page uses the full width inside a 16px gutter, capped only past about 1920px', async () => {
    renderOrganizationPage();
    await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
    const column = document.querySelector('[data-part="column"]')!;
    expect(column).not.toHaveClass('max-w-6xl');
    expect(column).toHaveClass('w-full', 'max-w-[1800px]', 'mx-auto');
    expect(column.parentElement).toHaveClass('px-4', 'sm:px-0');
    expect(column.parentElement!.parentElement).toHaveClass('px-0', 'sm:px-4');
  });
});
