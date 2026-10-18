import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditNodePane } from './EditNodePane';
import type { ScenarioNodeData } from './types';

// Integration tier: the real pane, saving exactly the node data
// revenact-backend's services/scenarios/engine.py reads at run time (see
// docs/API_CONTRACTS.md's `scenarios` section). The fetch boundary is
// mocked for the AI attribute list the condition picker offers.

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function node(action: string, data: Partial<ScenarioNodeData> = {}) {
  return { id: 'n1', type: 'operator' as const, data: { action, label: action, ...data } };
}

function open(action: string, data: Partial<ScenarioNodeData> = {}) {
  const onSave = vi.fn();
  render(<EditNodePane node={node(action, data)} isOpen onClose={vi.fn()} onSave={onSave} />);
  return onSave;
}

async function save() {
  await userEvent.click(screen.getByRole('button', { name: 'Save and close' }));
}

describe('EditNodePane conditions', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(200, []));
  });

  it('saves a field clause with the wider attribute and operator set', { timeout: 15000 }, async () => {
    const onSave = open('Condition');
    await userEvent.selectOptions(screen.getByLabelText('Attribute'), 'renewal_days');
    await userEvent.selectOptions(screen.getByLabelText('Operator'), 'less_than');
    await userEvent.type(screen.getByLabelText('Value'), '30');
    await save();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionKind: 'field',
        conditionAttribute: 'renewal_days',
        conditionOperator: 'less_than',
        conditionValue: '30',
      })
    );
  });

  it('offers the organisation’s own AI attributes as condition attributes', { timeout: 15000 }, async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, [
        { id: 3, name: 'Product tier', api_name: 'product_tier', prompt: '?', value_type: 'picklist', picklist_options: ['SMB', 'Enterprise'], applies_to_customer: true, applies_to_account: false, refresh: 'manual', created_at: '', updated_at: '' },
      ])
    );
    const onSave = open('Condition');
    expect(await screen.findByRole('option', { name: 'Product tier (AI)' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Attribute'), 'attr:product_tier');
    await userEvent.type(screen.getByLabelText('Value'), 'Enterprise');
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ conditionAttribute: 'attr:product_tier' }));
  });

  it('hides the value box for the operators that take no value', { timeout: 15000 }, async () => {
    const onSave = open('Condition');
    await userEvent.selectOptions(screen.getByLabelText('Operator'), 'is_empty');
    expect(screen.queryByLabelText('Value')).not.toBeInTheDocument();
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ conditionOperator: 'is_empty' }));
  });

  it('switches to a phrase and saves it with its threshold', { timeout: 15000 }, async () => {
    const onSave = open('Condition');
    await userEvent.click(screen.getByRole('radio', { name: /what they have been saying/i }));
    expect(screen.queryByLabelText('Attribute')).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Phrase'), 'asking about pricing');
    await userEvent.clear(screen.getByLabelText('Match strength'));
    await userEvent.type(screen.getByLabelText('Match strength'), '0.7');
    await save();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionKind: 'semantic',
        conditionPhrase: 'asking about pricing',
        conditionThreshold: '0.7',
      })
    );
  });

  it('reopens a saved phrase clause as a phrase', { timeout: 15000 }, async () => {
    open('Filter', { conditionKind: 'semantic', conditionPhrase: 'unhappy with support' });
    expect(screen.getByLabelText('Phrase')).toHaveValue('unhappy with support');
  });
});

describe('EditNodePane routing', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(
      jsonResponse(200, [
        { id: 5, name: 'Dana', email: 'dana@acme.io', function: 'cs', function_display: 'Customer Success' },
        { id: 6, name: 'Eve', email: 'eve@acme.io', function: 'cs', function_display: 'Customer Success' },
      ].reduce((acc, row) => ({ ...acc, results: [...acc.results, row] }), { results: [] as unknown[] }))
    );
  });

  it('assigns to a named person', { timeout: 15000 }, async () => {
    const onSave = open('Assign Owner');
    await userEvent.click(await screen.findByRole('radio', { name: /a specific person/i }));
    await userEvent.selectOptions(screen.getByLabelText('Person'), '6');
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ assignTo: 6, assignRule: '' }));
  });

  it('assigns to whoever in a function carries the least', { timeout: 15000 }, async () => {
    const onSave = open('Assign Owner');
    await userEvent.click(await screen.findByRole('radio', { name: /whoever has the fewest/i }));
    await userEvent.selectOptions(screen.getByLabelText('Function'), 'cs');
    await save();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ assignRule: 'least_loaded', assignFunction: 'cs' })
    );
  });

  it('notifies the owner, their manager or a named person', { timeout: 15000 }, async () => {
    const onSave = open('Notify');
    await userEvent.type(screen.getByLabelText('Message'), 'Look at this.');
    await userEvent.selectOptions(screen.getByLabelText('Who'), 'manager');
    await save();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ notifyWho: 'manager', notifyMessage: 'Look at this.' })
    );
  });

  it('asks for the person when notifying someone named', { timeout: 15000 }, async () => {
    const onSave = open('Notify');
    await userEvent.selectOptions(screen.getByLabelText('Who'), 'user');
    await userEvent.selectOptions(await screen.findByLabelText('Person'), '5');
    await userEvent.type(screen.getByLabelText('Message'), 'Yours.');
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ notifyWho: 'user', notifyUser: 5 }));
  });
});

describe('EditNodePane triggers', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(200, []));
  });

  it('starts a scenario when an interaction is classified', { timeout: 15000 }, async () => {
    const onSave = open('On Event');
    await userEvent.click(screen.getByRole('radio', { name: /classified/i }));
    await save();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ eventTrigger: 'interaction_classified' }));
  });
});
