import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { fetchChanged } from '../../features/brain/brainApi';
import { SCOPE_STORAGE_KEY } from '../../features/brain/brainScope';
import { SAY } from '../../features/brain/brainText';
import { stubBrain } from '../../features/brain/testBrain';
import { Where } from '../../pages/organizations/testList';
import { useBrainScope } from './useBrainScope';

function Probe() {
  const brain = useBrainScope();
  return (
    <>
      <p data-testid="scope">{brain.scope ?? 'none'}</p>
      <p data-testid="notice">{brain.notice ?? ''}</p>
      <p data-testid="error">{brain.error ?? ''}</p>
      <button type="button" onClick={() => brain.choose('me')}>Choose me</button>
      <button type="button" onClick={() => brain.retry()}>Retry</button>
      <button type="button" onClick={() => fetchChanged('team').catch((err: unknown) => brain.refused(err))}>Read team</button>
      <Where />
    </>
  );
}

const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><Probe /></MemoryRouter>);
const text = (id: string) => screen.getByTestId(id).textContent;

describe('useBrainScope (spec §2.2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('has no scope until the URL names an offered one, then the server default', async () => {
    stubBrain();
    renderAt('/brain');
    expect(text('scope')).toBe('none');
    await waitFor(() => expect(text('scope')).toBe('company'));
    expect(text('where')).toBe('/brain?scope=company');
  });

  it('uses the remembered choice, and remembers a new one', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'team');
    stubBrain();
    renderAt('/brain');
    await waitFor(() => expect(text('where')).toBe('/brain?scope=team'));
    await userEvent.click(screen.getByRole('button', { name: 'Choose me' }));
    expect(text('where')).toBe('/brain?scope=me');
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBe('me');
  });

  it('does not remember a scope opened from a link (Decision 3)', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'me');
    stubBrain();
    renderAt('/brain?scope=team');
    await waitFor(() => expect(text('scope')).toBe('team'));
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBe('me');
  });

  it('drops a remembered scope no longer offered, quietly', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'company');
    stubBrain({ offered: ['me'] });
    renderAt('/brain');
    await waitFor(() => expect(text('scope')).toBe('me'));
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBeNull();
    expect(text('notice')).toBe('');
  });

  it('moves a link to a scope not offered to the default, with the notice (Decision 4)', async () => {
    stubBrain({ offered: ['me', 'team'] });
    renderAt('/brain?scope=company');
    await waitFor(() => expect(text('where')).toBe('/brain?scope=team'));
    expect(text('notice')).toBe(SAY.LOST_ACCESS);
    await userEvent.click(screen.getByRole('button', { name: 'Choose me' }));
    expect(text('notice')).toBe('');
  });

  it('after a 403 SCOPE_NOT_ALLOWED forgets the scope, re-reads the scopes and moves to the new default', async () => {
    localStorage.setItem(SCOPE_STORAGE_KEY, 'team');
    const { spy, revoke } = stubBrain({ offered: ['me', 'team'] });
    renderAt('/brain');
    await waitFor(() => expect(text('scope')).toBe('team'));
    revoke('team');
    await userEvent.click(screen.getByRole('button', { name: 'Read team' }));
    await waitFor(() => expect(text('where')).toBe('/brain?scope=me'));
    expect(text('notice')).toBe(SAY.LOST_ACCESS);
    expect(localStorage.getItem(SCOPE_STORAGE_KEY)).toBeNull();
    expect(spy.mock.calls.filter(([u]) => String(u).endsWith('/brain/scopes/'))).toHaveLength(2);
  });

  it('says it could not load the views, and tries again', async () => {
    stubBrain({ failScopes: 1 });
    renderAt('/brain');
    await waitFor(() => expect(text('error')).toBe(SAY.LOAD_SCOPES));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(text('scope')).toBe('company'));
    expect(text('error')).toBe('');
  });

  it('keeps the other query parameters when it settles or changes the scope (Doing plan Decision 2)', async () => {
    stubBrain();
    renderAt('/brain/doing?section=plans');
    await waitFor(() => expect(text('where')).toBe('/brain/doing?section=plans&scope=company'));
    await userEvent.click(screen.getByRole('button', { name: 'Choose me' }));
    expect(text('where')).toBe('/brain/doing?section=plans&scope=me');
  });
});
