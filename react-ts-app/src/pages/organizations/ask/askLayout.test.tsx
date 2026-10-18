import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetViewport } from '../../../test/viewport';
import { renderOrganizations } from '../testList';
import { stubOrganizationsAsk } from './testOrganizationsAsk';

// Integration tier: the rail wins its 320px (plan pre-flight 11–13).
const column = (key: string) => document.querySelector(`[data-column="${key}"]`) as HTMLElement;
const askRail = () => screen.getByRole('complementary', { name: 'Ask Revenact' });

describe('the Ask rail beside the list and the board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetViewport();
  });

  it("narrows the board's columns while the rail is open", async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/board', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    expect(column('live')).toHaveClass('w-64');
    await userEvent.click(screen.getByRole('button', { name: 'Hide Copilot' }));
    await waitFor(() => expect(column('live')).toHaveClass('w-72'));
  });

  it('keeps the side panel beside the rail from xl', async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/board', { ask: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    expect(screen.getByRole('complementary', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(askRail()).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();
  });

  it('below xl the rail wins: opening it closes the side panel, and a card then opens as the sheet', async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/board', { ask: true, width: 1100 });
    await userEvent.click(await screen.findByRole('button', { name: 'Open Pizza Hut' }));
    // The rail is closed below xl by default: the side panel, as before.
    expect(screen.getByRole('complementary', { name: 'Pizza Hut' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show Copilot' }));
    expect(await screen.findByRole('complementary', { name: 'Ask Revenact' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Pizza Hut' })).not.toBeInTheDocument();
    // The card's focus outlived its panel.
    expect(within(askRail()).getByText('Organizations · 1 account')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open Pizza Hut' }));
    expect(await screen.findByRole('dialog', { name: 'Pizza Hut' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Pizza Hut' })).not.toBeInTheDocument();
  });

  it('wraps list rows and tiles to the content column, not the window', async () => {
    stubOrganizationsAsk();
    renderOrganizations('/organizations/list', { ask: true });
    await screen.findByRole('link', { name: 'Pizza Hut' });
    const header = document.querySelector('[data-row-id="7"] [data-part="header"]') as HTMLElement;
    expect(header.closest('[class~="@container"]')).not.toBeNull();
    const tiles = document.querySelector('[class*="@min-[50rem]:grid-cols-4"]') as HTMLElement;
    expect(tiles.closest('[class~="@container"]')).not.toBeNull();
  });
});
