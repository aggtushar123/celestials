import type { Option, PortfolioPage, PortfolioRowBase } from '../organizations/portfolioTypes';

// Mirrors revenact-backend's GET /api/v1/accounts/portfolio/ (backend #74,
// docs/API_CONTRACTS.md -> accounts_portfolio). Money is Account.arr as
// stored, already in the workspace's currency.

export interface AccountPortfolioDetails {
  commercial: { arr: number | null; renewal_date: string | null };
  voice: { nps_score: number | null; csat_score: number | null; ai_pulse_reason: string };
  profile: {
    revenact_id: number;
    domain: string;
    industry: string;
    email: string;
    phone: string;
    address: string;
    /** The linked organisations the viewer may open, lowest id first. */
    organisations: { id: number; name: string }[];
  };
  history: {
    created_at: string;
    updated_at: string;
    pulse_recorded_on: string | null;
    csm_pulse_modified_at: string | null;
  };
}

export interface AccountPortfolioRow extends PortfolioRowBase {
  /** The first linked organisation the viewer may open, or null when they
   *  may open none (a hidden one is never named or counted). */
  organisation: { id: number; name: string } | null;
  /** How many more openable organisations it is linked to ("+N"). */
  extra_organisations: number;
  details: AccountPortfolioDetails;
}

export interface AccountFilterOptions {
  organisations: Option[];
  owners: Option[];
  lifecycles: Option[];
}

export type AccountPortfolioResponse = PortfolioPage<AccountPortfolioRow, AccountFilterOptions>;

/** No archive: accounts have neither archive nor churn fields. */
export type AccountBulkAction = 'set_owner' | 'set_lifecycle';

export interface AccountBulkRequest {
  ids: number[];
  action: AccountBulkAction;
  /** A user id, or null to unassign, for set_owner; any stage (Churn
   *  included) for set_lifecycle. */
  value: number | string | null;
}
