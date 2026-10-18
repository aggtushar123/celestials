import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizationPage } from '../testDetail';
import { stubOrganizationPageAsk } from './testOrganizationsAsk';

// Integration tier: the List, the Board and every organisation's page share
// one scroll column in OrganizationsAskLayout's frame, so a scroll offset
// must not carry from one page into another.
const scroller = () => screen.getByTestId('where').closest('.overflow-y-auto') as HTMLElement;
const where = () => screen.getByTestId('where');

async function scrolledThenGo(from: string, to: string) {
  stubOrganizationPageAsk();
  renderOrganizationPage(from, { ask: true, goTo: to });
  await screen.findByRole('heading', { level: 1, name: 'Pizza Hut' });
  scroller().scrollTop = 600;
  await userEvent.click(screen.getByRole('link', { name: `Go to ${to}` }));
  await vi.waitFor(() => expect(where()).toHaveTextContent(to));
}

describe('the Organizations scroll column across routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it('starts another organisation at the top', async () => {
    await scrolledThenGo('/organizations/7', '/organizations/9');
    expect(scroller().scrollTop).toBe(0);
  });

  it('starts the List at the top when leaving an organisation for it', async () => {
    await scrolledThenGo('/organizations/7', '/organizations/list');
    expect(scroller().scrollTop).toBe(0);
  });

  it('keeps its place on a tab or query change within the same organisation', async () => {
    await scrolledThenGo('/organizations/7', '/organizations/7?tab=people');
    expect(scroller().scrollTop).toBe(600);
  });
});
