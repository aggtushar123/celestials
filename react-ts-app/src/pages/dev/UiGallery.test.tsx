import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import App from '../../App';
import { store } from '../../store';
import { resetViewport, setViewport } from '../../test/viewport';
import { UiGallery } from './UiGallery';

const SECTIONS = ['Type and figures', 'Buttons', 'Card', 'Lists', 'Table', 'Tiles', 'Badges', 'Controls', 'Toolbar', 'States', 'Settings frame'];

describe('the /__ui gallery (UI foundations spec §1, §9.3)', () => {
  afterEach(() => {
    resetViewport();
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('shows every primitive section, with no card inside a card', () => {
    const error = vi.spyOn(console, 'error');
    setViewport(1440);
    render(
      <MemoryRouter>
        <UiGallery />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'UI primitives' })).toBeInTheDocument();
    for (const title of SECTIONS) expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    expect(error).not.toHaveBeenCalledWith('Card inside Card');
  });

  it('shows the states: loading, empty, error, disabled and pressed', () => {
    setViewport(1440);
    render(
      <MemoryRouter>
        <UiGallery />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('status').some((node) => node.getAttribute('aria-busy') === 'true')).toBe(true);
    expect(screen.getByText('No organizations yet')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load organizations.');
    expect(screen.getAllByRole('button', { name: 'Save' }).some((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('switch', { name: 'Disabled switch' })).toBeDisabled();
  });

  it('is live: a tab, a segment and a filter tile all answer', async () => {
    setViewport(1440);
    render(
      <MemoryRouter>
        <UiGallery />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Lists' }));
    expect(screen.getByRole('tab', { name: 'Lists' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(within(screen.getByRole('group', { name: 'Scope' })).getByRole('button', { name: 'Company' }));
    expect(within(screen.getByRole('group', { name: 'Scope' })).getByRole('button', { name: 'Company' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /^At risk/ }));
    expect(screen.getByRole('button', { name: /^At risk/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('is routed at /__ui in development, outside the signed-in shell', async () => {
    setViewport(1440);
    window.history.pushState({}, '', '/__ui');
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'UI primitives' })).toBeInTheDocument();
  });
});
