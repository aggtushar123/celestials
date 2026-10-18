import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Routes } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { settingsRoutes } from '../pages/settings/routes';
import { WORKSPACE_SETTINGS_NAV } from '../pages/settings/workspaceSettingsNav';
import { makeRulesStore } from '../pages/rules/testPages';
import { SlotHost } from '../test/SlotHost';
import { resetViewport, setViewport } from '../test/viewport';

// Every settings route, through the real route tree and the real Navbar:
// on a phone the layout draws "Settings" into the framed bar once, as text,
// so a page never misses its bar and never shows a second h1 (UI foundations
// spec §6.1, §6.3); from md the nav carries it and the bar has no title
// (settings production spec §4.1, §10.2). Each page is stubbed: this is about the bar.
const PATHS = WORKSPACE_SETTINGS_NAV.flatMap((group) => group.items.flatMap((item) => (item.tabs ? item.tabs.map((tab) => tab.path) : [item.path])));

function renderSettings(url: string, width = 375) {
  setViewport(width);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));
  render(
    <Provider store={makeRulesStore('admin')}>
      <MemoryRouter initialEntries={[url]}>
        <SlotHost bare={false}>
          <Navbar />
          <Routes>{settingsRoutes(() => <p>Page body</p>)}</Routes>
        </SlotHost>
      </MemoryRouter>
    </Provider>,
  );
}

describe('settings routes title the bar (UI foundations spec §6.1)', () => {
  afterEach(() => {
    cleanup();
    resetViewport();
    vi.unstubAllGlobals();
  });

  it('covers all twenty-four pages and tabs (the four You pages since 2026-10-17)', () => {
    expect(PATHS).toHaveLength(24);
  });

  it.each(PATHS)('%s: on a phone, "Settings" in the framed bar as text, at the content edge, and no h1 in the bar', async (path) => {
    renderSettings(path);
    const header = document.querySelector('header')!;
    expect(header).toHaveAttribute('data-page-header');
    const slot = header.querySelector<HTMLElement>('[data-nav-title-slot]')!;
    const title = await within(slot).findByText('Settings');
    expect(title.tagName).toBe('P');
    expect(within(header).queryByRole('heading')).toBeNull();
  });

  it.each(PATHS)('%s: from md, no Settings title in the bar', async (path) => {
    renderSettings(path, 1440);
    const header = document.querySelector('header')!;
    expect(await within(document.body).findByText('Page body')).toBeInTheDocument();
    expect(within(header).queryByText('Settings')).toBeNull();
  });
});
