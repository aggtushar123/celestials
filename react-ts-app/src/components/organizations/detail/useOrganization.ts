import type { Customer } from '../../../features/customers/customersSlice';
import { fetchPortfolio } from '../../../features/organizations/portfolioApi';
import type { PortfolioRow } from '../../../features/organizations/portfolioTypes';
import { useDetailRecord, type DetailSource } from './useDetailRecord';

export interface OrganizationState {
  /** The List's row for this organization; null until it lands, or when not
   *  found. The last one that landed stays while a reload runs or fails. */
  row: PortfolioRow | null;
  /** GET /customers/{id}/: the health breakdown and the edit form's record. */
  customer: Customer | null;
  /** The row for the current id and version has not landed (or failed) yet. */
  loading: boolean;
  /** Not a number, or the portfolio has no such row for this viewer. */
  notFound: boolean;
  error: string | null;
  customerError: string | null;
  retry: () => void;
}

const ORGANIZATION_SOURCE: DetailSource<PortfolioRow, null> = {
  readRow: (id) =>
    fetchPortfolio(new URLSearchParams({ ids: String(id), include_churned: '1', limit: '1' }).toString()).then((data) => ({
      row: data.results.find((row) => row.id === id) ?? null,
      extra: null,
    })),
  recordPath: (id) => `/customers/${id}/`,
  rowError: 'Could not load this organization.',
  recordError: 'Could not load the health breakdown.',
};

/** The header's two reads (spec §2 "Header"), fired together: the portfolio
 *  row by `ids` (archived and churned rows included) and the customer. A new
 *  `version` (after an edit, churn or archive) reloads both while the old row
 *  stays on screen; a row for another id never shows. */
export function useOrganization(id: number | null, version: number): OrganizationState {
  const state = useDetailRecord<PortfolioRow, null, Customer>(id, version, ORGANIZATION_SOURCE);
  return {
    row: state.row,
    customer: state.record,
    loading: state.loading,
    notFound: state.notFound,
    error: state.error,
    customerError: state.recordError,
    retry: state.retry,
  };
}
