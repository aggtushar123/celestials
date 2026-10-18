import { afterEach, describe, expect, it } from 'vitest';
import { useMemo, useState, type ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import authReducer from '../../features/auth/authSlice';
import notificationsReducer from '../../features/notifications/notificationsSlice';
import { NavActionsSlotContext } from '../../layouts/navActionsSlot';
import { resetViewport, setViewport } from '../../test/viewport';
import { PageHeader } from '../ui/PageHeader';
import { ViewTabs } from '../organizations/portfolio/ViewTabs';
import { Tabs } from '../ui/Tabs';
import { Navbar } from './Navbar';

function Shell({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // As DashboardLayout: undefined until the Navbar resolves its title slot.
  const [titleSlot, setTitleSlot] = useState<HTMLElement | null | undefined>(undefined);
  const value = useMemo(() => ({ slot, setSlot, titleSlot, setTitleSlot }), [slot, titleSlot]);
  return (
    <NavActionsSlotContext.Provider value={value}>
      <Navbar />
      <main>{children}</main>
    </NavActionsSlotContext.Provider>
  );
}

function renderAt(url: string) {
  const store = configureStore({ reducer: { auth: authReducer, notifications: notificationsReducer } });
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[url]}>
        <Shell>
          <Routes>
            <Route path="/organizations/list" element={<PageHeader title="Organizations" tabs={<ViewTabs label="Organizations views" base="/organizations" value="list" />} />} />
            <Route path="/organizations/:id" element={<PageHeader back={{ to: '/organizations/list', label: 'Organizations' }} />} />
            <Route path="/accounts/:id" element={<PageHeader back={{ to: '/accounts/list', label: 'Accounts' }} />} />
            <Route path="/pipelines/list" element={<PageHeader title="Pipelines" tabs={<ViewTabs label="Pipelines views" base="/pipelines" value="list" />} />} />
            <Route path="/brain" element={<PageHeader title="Brain" tabs={<Tabs label="Brain" value="/brain" items={[{ key: '/brain', label: 'What changed', to: '/brain' }, { key: '/brain/waiting', label: 'Waiting on you', to: '/brain/waiting' }]} />} />} />
            <Route path="/work/today" element={<PageHeader title="Work" tabs={<Tabs label="Work" value="/work/today" items={[{ key: '/work/today', label: 'Today', to: '/work/today' }, { key: '/work/activity', label: 'Activity', to: '/work/activity' }]} />} />} />
            <Route path="/communications" element={<PageHeader title="Communications" />} />
            <Route path="/segments" element={<PageHeader title="Segments" />} />
            <Route path="/campaigns/:id" element={<PageHeader back={{ to: '/campaigns', label: 'Campaigns' }} />} />
          </Routes>
        </Shell>
      </MemoryRouter>
    </Provider>,
  );
}

describe('PageHeader in the Navbar bar (UI foundations spec §6.1, Records)', () => {
  afterEach(() => resetViewport());

  it("puts the page's title and List | Board in the bar; on a phone the tabs take the bar's own second row", async () => {
    setViewport(390);
    renderAt('/organizations/list?health=poor');
    const header = document.querySelector('header')!;
    expect(header).toHaveAttribute('data-page-header');
    expect(header).toHaveClass('border-b', 'border-transparent', 'data-[scrolled]:border-line-subtle');
    expect(await within(header).findByRole('heading', { level: 1, name: 'Organizations' })).toHaveClass('truncate');
    const nav = within(header).getByRole('navigation', { name: 'Organizations views' });
    const row = nav.parentElement!;
    expect(row).toHaveClass('max-sm:order-last', 'max-sm:basis-full');
    // Every wrapper between the header and the tab row dissolves on a phone (#128's fix 1).
    expect(row.parentElement!.closest(':not(.max-sm\\:contents)')).toBe(header);
    expect(within(nav).getByRole('link', { name: 'Board' })).toHaveAttribute('href', '/organizations/board?health=poor');
    expect(within(header).getByTestId('nav-tools')).toHaveClass('ml-auto', 'shrink-0');
    expect(screen.getByRole('main').querySelector('[data-page-header]')).toBeNull();
  });

  it('leads back to the list from a record page, in the bar, with no h1 there', async () => {
    renderAt('/organizations/19');
    const header = document.querySelector('header')!;
    const back = await within(header).findByRole('link', { name: 'Organizations' });
    expect(back).toHaveAttribute('href', '/organizations/list');
    expect(back.closest('nav')).toHaveAccessibleName('Breadcrumb');
    expect(within(header).queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('leads back to Accounts from an account page, in the bar', async () => {
    renderAt('/accounts/17');
    const header = document.querySelector('header')!;
    const back = await within(header).findByRole('link', { name: 'Accounts' });
    expect(back).toHaveAttribute('href', '/accounts/list');
    expect(back.closest('nav')).toHaveAccessibleName('Breadcrumb');
    expect(screen.getByRole('main').querySelector('[data-page-header]')).toBeNull();
  });
});

describe('PageHeader in the bar on the Ops routes (UI foundations spec §6.1, Ops)', () => {
  afterEach(() => resetViewport());

  it.each([
    ['/pipelines/list', 'Pipelines', 'Pipelines views'],
    ['/brain', 'Brain', 'Brain'],
    ['/work/today', 'Work', 'Work'],
  ])('on %s puts "%s" and its tabs in the bar; on a phone the tabs take the second row', async (url, title, tabs) => {
    setViewport(390);
    renderAt(url);
    const header = document.querySelector('header')!;
    expect(header).toHaveAttribute('data-page-header');
    expect(await within(header).findByRole('heading', { level: 1, name: title })).toHaveClass('truncate', 'text-[15px]');
    const nav = within(header).getByRole('navigation', { name: tabs });
    const row = nav.parentElement!;
    expect(row).toHaveClass('max-sm:order-last', 'max-sm:basis-full');
    expect(row.parentElement!.closest(':not(.max-sm\\:contents)')).toBe(header);
    expect(within(header).getByTestId('nav-tools')).toHaveClass('ml-auto', 'shrink-0');
  });

  it('keeps Opportunities | Risks out of the top bar on Pipelines: the page toolbar owns it', async () => {
    renderAt('/pipelines/list');
    const header = document.querySelector('header')!;
    expect(await within(header).findByRole('navigation', { name: 'Pipelines views' })).toBeInTheDocument();
    expect(within(header).queryByRole('navigation', { name: 'Opportunities or risks' })).toBeNull();
    expect(within(header).queryByRole('group', { name: 'Opportunities or risks' })).toBeNull();
  });

  it('gives Communications the same bar: its title, the actions slot and no avatar', async () => {
    setViewport(1440);
    renderAt('/communications');
    const header = document.querySelector('header')!;
    expect(header).toHaveAttribute('data-page-header');
    expect(await within(header).findByRole('heading', { level: 1, name: 'Communications' })).toBeInTheDocument();
    expect(header.querySelector('[data-nav-actions-slot]')).not.toBeNull();
  });
});

describe('PageHeader in the bar on the Impact routes (UI foundations spec §6.1, Impact)', () => {
  afterEach(() => resetViewport());

  it('puts a list page’s title in the bar at the content’s left edge', async () => {
    setViewport(1440);
    renderAt('/segments');
    const header = document.querySelector('header')!;
    expect(header).toHaveAttribute('data-page-header');
    expect(await within(header).findByRole('heading', { level: 1, name: 'Segments' })).toHaveClass('truncate', 'text-[15px]');
  });

  it('leads back from a record page on a phone with a 44px chevron', async () => {
    setViewport(390);
    renderAt('/campaigns/abc');
    const header = document.querySelector('header')!;
    const back = await within(header).findByRole('link', { name: 'Campaigns' });
    expect(back).toHaveAttribute('href', '/campaigns');
    expect(back).toHaveClass('max-sm:min-w-11');
  });
});
