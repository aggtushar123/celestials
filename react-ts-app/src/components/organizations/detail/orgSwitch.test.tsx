import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ACCOUNTS, CONTACTS, FILES } from '../../../features/organizations/testStory';
import { makeDetailStore } from '../../../pages/organizations/testDetail';
import { FilesSection } from './FilesSection';
import { PeopleTab } from './PeopleTab';

// Moving from one organization to the next while the first one's list is
// still on its way: the slower reply never shows under the second.

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** Organization 7's `list` read waits for `release`; organization 8's answers at once. */
function stubSlowFirst(list: string, first: unknown[], second: unknown[]) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
      if (path === `/customers/7/${list}/`) {
        await held;
        return json(first);
      }
      if (path === `/customers/8/${list}/`) return json(second);
      return json([]);
    }),
  );
  return () => act(async () => release());
}

function switching(make: (customerId: number) => ReactElement) {
  const store = makeDetailStore();
  const wrap = (customerId: number) => (
    <Provider store={store}>
      <MemoryRouter>{make(customerId)}</MemoryRouter>
    </Provider>
  );
  const view = render(wrap(7));
  return { store, toSecond: () => view.rerender(wrap(8)) };
}

const ids = (attr: string) => [...document.querySelectorAll(`[${attr}]`)].map((el) => el.getAttribute(attr));

describe('switching organization while a list is loading', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("People: the first organization's people never show under the second", async () => {
    const release = stubSlowFirst('contacts', CONTACTS, [CONTACTS[0]]);
    const { toSecond } = switching((customerId) => (
      <PeopleTab customerId={customerId} account="" accounts={ACCOUNTS} isSm onShowAll={() => {}} />
    ));
    toSecond();
    await waitFor(() => expect(ids('data-person')).toEqual(['51']));
    await release();
    expect(ids('data-person')).toEqual(['51']);
    expect(screen.queryByText('No people yet')).not.toBeInTheDocument();
  });

  it('People: while the second loads it shows loading, not an empty list', async () => {
    const answers: Record<string, (body: unknown) => void> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
        const body = await new Promise<unknown>((resolve) => {
          answers[path] = resolve;
        });
        return json(body);
      }),
    );
    const { toSecond } = switching((customerId) => (
      <PeopleTab customerId={customerId} account="" accounts={ACCOUNTS} isSm onShowAll={() => {}} />
    ));
    toSecond();
    await waitFor(() => expect(answers['/customers/8/contacts/']).toBeDefined());
    await act(async () => answers['/customers/7/contacts/'](CONTACTS));
    expect(screen.getByText('Loading people')).toBeInTheDocument();
    expect(screen.queryByText('No people yet')).not.toBeInTheDocument();
    await act(async () => answers['/customers/8/contacts/']([CONTACTS[1]]));
    await waitFor(() => expect(ids('data-person')).toEqual(['52']));
  });

  it("Files: the first organization's files never show under the second", async () => {
    const release = stubSlowFirst('files', FILES, [FILES[1]]);
    const { toSecond } = switching((customerId) => (
      <FilesSection customerId={customerId} account="" accounts={ACCOUNTS} isSm onShowAll={() => {}} />
    ));
    toSecond();
    await waitFor(() => expect(ids('data-file')).toEqual(['82']));
    await release();
    expect(ids('data-file')).toEqual(['82']);
  });

  it("Files: the first organization's files are gone as soon as the second is chosen", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(String(input)).pathname.replace(/^\/api\/v1/, '');
        if (path === '/customers/7/files/') return json(FILES);
        return new Promise(() => {});
      }),
    );
    const { toSecond } = switching((customerId) => (
      <FilesSection customerId={customerId} account="" accounts={ACCOUNTS} isSm onShowAll={() => {}} />
    ));
    await waitFor(() => expect(ids('data-file')).toEqual(['81', '82']));
    toSecond();
    expect(ids('data-file')).toEqual([]);
    expect(screen.getByText('Loading files')).toBeInTheDocument();
  });
});
