import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AIAttributesPage } from '../pages/settings/AIAttributesPage';
import { AIAttributesPanel } from '../components/shared/AIAttributesPanel';
import { attribute, jsonResponse, makeStore, value, withLatest } from '../test/attributesFixtures';

// End-to-end tier (jsdom, no browser): an admin defines an attribute in
// Settings, then opens a company page where the panel shows the model's
// answer, and overrides it. The network is the only thing mocked.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('AI attributes flow', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('define in settings, read and correct on the company page', { timeout: 20000 }, async () => {
    const defined = attribute({ id: 9, name: 'Primary use case', value_type: 'text', picklist_options: [], refresh: 'manual' });
    const definitions: unknown[] = [];
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const path = url.replace(/^.*\/api\/v1/, '');
      const method = init?.method ?? 'GET';
      if (path === '/attributes/definitions/' && method === 'GET') return jsonResponse(200, [...definitions]);
      if (path === '/attributes/definitions/' && method === 'POST') { definitions.push(defined); return jsonResponse(201, defined); }
      if (path === '/attributes/values/?customer=12') return jsonResponse(200, [withLatest(defined, value({ attribute: 9, value: 'Field service scheduling', reasoning: 'Three tickets describe dispatching crews.' }))]);
      if (path === '/attributes/values/' && method === 'POST') return jsonResponse(201, value({ id: 93, attribute: 9, value: 'Dispatch', origin: 'human', reasoning: '', sources: [], set_by: { id: 1, name: 'Alice' } }));
      throw new Error(`unexpected ${method} ${path}`);
    });

    render(
      <Provider store={makeStore('admin')}>
        <MemoryRouter initialEntries={['/settings/ai/attributes']}>
          {/* Stands in for the sidebar: the flow crosses from Settings to a company page. */}
          <Link to="/organizations/12">Open Pizza Hut</Link>
          <Routes>
            <Route path="/settings/ai/attributes" element={<AIAttributesPage />} />
            <Route path="/organizations/:id" element={<AIAttributesPanel customerId={12} />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await userEvent.click(await screen.findByRole('button', { name: 'New attribute' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Primary use case');
    await userEvent.type(screen.getByLabelText('Question'), 'What does this company mainly use our product for?');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Primary use case')).toBeInTheDocument();

    // Then the organization page, where the answer is read and corrected.
    await userEvent.click(screen.getByRole('link', { name: 'Open Pizza Hut' }));
    expect(await screen.findByText('Field service scheduling')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Why Primary use case: Field service scheduling?' }));
    expect(screen.getByText('Three tickets describe dispatching crews.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Primary use case' }));
    await userEvent.clear(screen.getByLabelText('Primary use case'));
    await userEvent.type(screen.getByLabelText('Primary use case'), 'Dispatch');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Dispatch')).toBeInTheDocument();
    expect(screen.getByText('Set by Alice')).toBeInTheDocument();
  });
});
