import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManageFieldsPanel } from './ManageFieldsPanel';
import type { CustomObjectDefinition } from './types';

// Integration tier (see the `testing` skill): no store/router needed —
// this component talks to apiFetch directly and reports changes via
// its own onFieldAdded/onFieldDeleted callbacks, same "self-contained,
// controlled by its own props" shape as CustomObjectsTab.tsx's own.

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function definition(overrides: Partial<CustomObjectDefinition> = {}): CustomObjectDefinition {
  return {
    id: 4,
    name: 'Salesforce.com',
    api_name: 'salesforce_com',
    applies_to_customer: true,
    applies_to_account: true,
    fields: [],
    records_count: 0,
    created_at: '2026-09-06T00:00:00Z',
    ...overrides,
  };
}

describe('ManageFieldsPanel', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('a non-admin sees the real field list but no mutation controls', () => {
    render(
      <ManageFieldsPanel
        definition={definition({
          fields: [
            { id: 1, name: 'Product', api_name: 'product', field_type: 'text', field_type_display: 'Text', is_required: true, picklist_options: [], order: 1, created_at: '2026-09-06T00:00:00Z' },
          ],
        })}
        isAdmin={false}
        onFieldAdded={() => {}}
        onFieldDeleted={() => {}}
      />
    );

    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add field/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete field/ })).not.toBeInTheDocument();
  });

  it('an admin can add a field and it reports back via onFieldAdded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(201, {
            id: 9,
            name: 'Quantity',
            api_name: 'quantity',
            field_type: 'number',
            field_type_display: 'Number',
            is_required: false,
            picklist_options: [],
            order: 1,
            created_at: '2026-09-06T00:00:00Z',
          })
        )
      )
    );
    const onFieldAdded = vi.fn();
    const user = userEvent.setup();

    render(
      <ManageFieldsPanel definition={definition()} isAdmin onFieldAdded={onFieldAdded} onFieldDeleted={() => {}} />
    );

    await user.click(screen.getByRole('button', { name: /Add field/ }));
    await user.type(screen.getByPlaceholderText('Field name'), 'Quantity');
    await user.selectOptions(screen.getByRole('combobox'), 'number');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    // A controlled component — it reports the new field via the
    // callback rather than holding its own copy; the caller is the one
    // that re-renders with an updated `definition.fields` (see
    // CustomObjectRecordsPage.tsx's own onFieldAdded).
    await vi.waitFor(() => expect(onFieldAdded).toHaveBeenCalledWith(expect.objectContaining({ id: 9, api_name: 'quantity' })));
    expect(screen.queryByPlaceholderText('Field name')).not.toBeInTheDocument();
  });

  it('a picklist field shows its own comma-separated options input', async () => {
    const user = userEvent.setup();
    render(
      <ManageFieldsPanel definition={definition()} isAdmin onFieldAdded={() => {}} onFieldDeleted={() => {}} />
    );

    await user.click(screen.getByRole('button', { name: /Add field/ }));
    expect(screen.queryByPlaceholderText(/Options, comma-separated/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox'), 'picklist');

    expect(screen.getByPlaceholderText(/Options, comma-separated/)).toBeInTheDocument();
  });

  it('an admin can delete a field and it reports back via onFieldDeleted', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(204, null))));
    const onFieldDeleted = vi.fn();
    const user = userEvent.setup();

    render(
      <ManageFieldsPanel
        definition={definition({
          fields: [
            { id: 1, name: 'Product', api_name: 'product', field_type: 'text', field_type_display: 'Text', is_required: false, picklist_options: [], order: 1, created_at: '2026-09-06T00:00:00Z' },
          ],
        })}
        isAdmin
        onFieldAdded={() => {}}
        onFieldDeleted={onFieldDeleted}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Delete field Product' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onFieldDeleted).toHaveBeenCalledWith(1);
  });
});
