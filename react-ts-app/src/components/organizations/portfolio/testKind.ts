// Test-only: a made-up third kind ("widgets") over Organizations' rows and
// endpoint, so a test can prove a shared component reads the kind it is
// given rather than anything Organizations-specific.
import { createElement } from 'react';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { ORGANIZATION_KIND } from './organizationKind';
import type { PortfolioKind } from './portfolioKind';

export const WIDGET_KIND: PortfolioKind<PortfolioRow> = {
  ...ORGANIZATION_KIND,
  noun: { one: 'widget', many: 'widgets' },
  nameField: 'widget',
  params: { ...ORGANIZATION_KIND.params, product: false, churned: false, organisation: true },
  sortOptions: [
    { value: 'arr', label: 'ARR' },
    { value: 'name', label: 'Name' },
  ],
  filters: { product: false, organisation: true, churned: false },
  renewalWindow: '90',
  pulseValueField: 'aiPulseValue csmPulseScore',
  churnByModal: false,
  totalQuery: (params) => (params.search || params.organisation?.length ? 'limit=1' : null),
  churnVisible: () => true,
  addsTo: () => true,
  // Initech (id 2) stands in for a record this page cannot save.
  editable: (row) => row.id !== 2,
  href: (row) => `/widgets/${row.id}`,
  linkState: (row) => ({ widget: row.id }),
  subtitle: (row) => [{ text: `Shelf ${row.id}` }, { text: row.lifecycle.label, field: 'lifecycleStage' }],
  cardSubtitle: (row) => `Shelf ${row.id}`,
  status: () => null,
  renderDetails: ({ row, currency, onEdit, stacked }) =>
    createElement(
      'div',
      { 'data-testid': 'widget-details' },
      `Widget ${row.name} in ${currency}${stacked ? ', stacked' : ''}`,
      onEdit ? createElement('button', { type: 'button', onClick: () => onEdit(row.id) }, 'Edit widget') : null,
    ),
};
