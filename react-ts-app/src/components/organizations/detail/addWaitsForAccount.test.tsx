import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ORGANIZATION_LISTS, postBodies, stubOrganizationPage } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { CallsSection } from './CallsSection';
import { DealsTab } from './DealsTab';
import { FilesSection } from './FilesSection';
import { PeopleTab } from './PeopleTab';

// ?account=31 while the organization's accounts have not loaded (or failed):
// nothing can be added until the chosen account is known, and the page says
// why, rather than saving on the organization instead.

const REASON = 'Waiting for the chosen account. Choose All to add on the organization.';

function renderWith(node: ReactElement) {
  const spy = stubOrganizationPage({ lists: ORGANIZATION_LISTS });
  render(
    <Provider store={makeDetailStore()}>
      <MemoryRouter>{node}</MemoryRouter>
    </Provider>,
  );
  return spy;
}

function expectPaused(name: string | RegExp) {
  const button = screen.getByRole('button', { name });
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription(REASON);
  expect(screen.getByText(REASON)).toBeVisible();
}

describe('adding waits for the chosen account', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('People', async () => {
    renderWith(<PeopleTab customerId={7} account="31" accounts={[]} isSm onShowAll={() => {}} />);
    expectPaused('Add contact');
  });

  it('Deals & risks', () => {
    renderWith(<DealsTab customerId={7} account="31" accounts={[]} isSm onShowAll={() => {}} />);
    expectPaused('Add opportunity');
  });

  it('Files: the button and a drop both wait', async () => {
    const spy = renderWith(<FilesSection customerId={7} account="31" accounts={[]} isSm onShowAll={() => {}} />);
    expectPaused('Upload file');
    const file = new File(['x'], 'Notes.txt', { type: 'text/plain' });
    fireEvent.drop(screen.getByRole('region', { name: 'Files' }), { dataTransfer: { files: [file] } });
    await waitFor(() => expect(document.querySelectorAll('[data-file]')).toHaveLength(1));
    expect(postBodies(spy, '/customers/7/files/')).toEqual([]);
  });

  it('Calls', () => {
    renderWith(
      <CallsSection customerId={7} account="31" accounts={[]} isSm active version={0} onLogged={() => {}} onShowAll={() => {}} />,
    );
    expectPaused('Log a call');
  });

  it('All and the organization itself add as before', () => {
    renderWith(<PeopleTab customerId={7} account="none" accounts={[]} isSm onShowAll={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add contact' })).toBeEnabled();
    expect(screen.queryByText(REASON)).not.toBeInTheDocument();
  });
});
