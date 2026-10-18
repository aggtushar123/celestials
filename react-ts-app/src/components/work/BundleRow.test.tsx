import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { B_CAMPAIGN, B_DEPT, B_PIZZA, B_TICKET, B_UNASSIGNED, bundleItem } from '../../features/agents/testBundleFixtures';
import { BundleRow } from './BundleRow';

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{`${pathname}${search}`}</p>;
}

function renderRow(ui: React.ReactNode, url = '/work?queue=mine') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <ul>{ui}</ul>
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BundleRow (frontend Decision 4)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the title, the reason, the step kinds and the meta line, and Review opens the panel keeping the queue', async () => {
    renderRow(<BundleRow item={bundleItem(B_PIZZA)} group="decide" />, '/work?queue=mine&kind=bundle');
    expect(screen.getByRole('heading', { name: B_PIZZA.title })).toBeInTheDocument();
    expect(screen.getByText(B_PIZZA.reason)).toBeInTheDocument();
    expect(screen.getByText('Create a task · File a note · Change lifecycle stage')).toBeInTheDocument();
    expect(screen.getByText('3 steps')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pizza Hut' })).toHaveAttribute('href', '/organizations/7');
    await userEvent.click(screen.getByRole('link', { name: `Review ${B_PIZZA.title}` }));
    expect(screen.getByTestId('where')).toHaveTextContent('/work?queue=mine&kind=bundle&bundle=12');
  });

  it('says who it is for on a team queue, and the whole company with no owner', () => {
    renderRow(<BundleRow item={bundleItem(B_CAMPAIGN, true)} group="decide" />, '/work?queue=company');
    expect(screen.getByText('For the whole company')).toBeInTheDocument();
  });
});

it('shows a message bundle with its channel and source (Decision 4)', () => {
  renderRow(<BundleRow item={bundleItem(B_TICKET)} group="decide" />);
  const row = screen.getByRole('article', { name: B_TICKET.title });
  expect(row.closest('li')?.querySelector('[data-channel="zendesk"]')).not.toBeNull();
  expect(within(row).getByText('Zendesk')).toBeInTheDocument();
});

it('says where a queue row waits from its routed_to and department (Decision 5)', () => {
  renderRow(<BundleRow item={bundleItem(B_DEPT, true)} group="decide" />);
  const row = screen.getByRole('article', { name: B_DEPT.title });
  expect(within(row).getByText('For Customer Success')).toBeInTheDocument();
  expect(within(row).queryByText('For the whole company')).not.toBeInTheDocument();
});

it('says Unassigned on an Unassigned queue row', () => {
  renderRow(<BundleRow item={bundleItem(B_UNASSIGNED, true)} group="decide" />);
  expect(within(screen.getByRole('article', { name: B_UNASSIGNED.title })).getByText('Unassigned')).toBeInTheDocument();
});
