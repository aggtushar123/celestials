import { createContext, useContext, type ReactNode } from 'react';
import type { CurrencyCode } from '../../../features/auth/authSlice';
import type { GroupOption } from '../../../features/organizations/portfolioGroups';
import type { PortfolioNoun, RenewalWindow } from '../../../features/organizations/portfolioLabels';
import type { ParamSpec, PortfolioParams } from '../../../features/organizations/portfolioParams';
import type { LifecycleValue, PortfolioPage, PortfolioRowBase } from '../../../features/organizations/portfolioTypes';
import type { AppDispatch } from '../../../store';
import { ORGANIZATION_KIND } from './organizationKind';

/** What a kind's opened-row panels are given (Organizations' six, Accounts' four). */
export interface DetailsProps<R extends PortfolioRowBase = PortfolioRowBase> {
  row: R;
  /** The response's currency (the workspace's). */
  currency: CurrencyCode;
  id?: string;
  today?: string;
  onEdit?: (id: number) => void;
  /** One column at every width (the Board's side panel). */
  stacked?: boolean;
}

/** One part of the line under a row's name. `field` marks it for the
 *  kind's field-coverage test. */
export interface SubtitlePart {
  text: string;
  field?: string;
}

/** What one page's portfolio is (spec 2026-09-29, Decisions: "Each page
 *  supplies its own fields, filters and actions"): the endpoint, the URL's
 *  parameters, its words, links and row line, its panels, how a Board move
 *  saves. Members are methods on purpose: method parameters are bivariant,
 *  so an account kind can stand where PortfolioKind<PortfolioRowBase> is
 *  expected. */
export interface PortfolioKind<R extends PortfolioRowBase = PortfolioRowBase> {
  noun: PortfolioNoun;
  /** data-field on a row's name link (the coverage test's id). */
  nameField: string;
  params: ParamSpec;
  sortOptions: { value: string; label: string }[];
  /** The List's Group choices. */
  groupOptions: GroupOption[];
  /** The Board's (no "None"). */
  boardGroupOptions: GroupOption[];
  /** The Filters panel's kind-only sections. */
  filters: { product: boolean; organisation: boolean; churned: boolean };
  /** The Renewing tile's window before one is picked. */
  renewalWindow: RenewalWindow;
  /** data-field on "AI n · CSM n", when the kind's registry names it. */
  pulseValueField?: string;
  /** A move to Churn opens the kind's churn form instead of saving
   *  (Organizations' ChurnOrganizationModal). */
  churnByModal: boolean;
  fetch(query: string): Promise<PortfolioPage<R>>;
  /** The query for M in "N of M", or null with no filter active. */
  totalQuery(params: PortfolioParams): string | null;
  /** Whether this view lists churned records (else the Board's Churn
   *  column is drop-only). */
  churnVisible(params: PortfolioParams): boolean;
  /** Saves one record's stage (a Board move). Rejects with the reason. */
  saveStage(row: R, to: LifecycleValue, dispatch: AppDispatch): Promise<unknown>;
  /** Whether a Board column's "+" adds to this stage. */
  addsTo(stage: LifecycleValue): boolean;
  /** Whether this page can edit or move the record (Edit details, Move to…). */
  editable(row: R): boolean;
  href(row: R): string;
  /** Router state the record's page reads, if any. */
  linkState(row: R): unknown;
  subtitle(row: R): SubtitlePart[];
  /** The Board card's line under the name. */
  cardSubtitle(row: R): string;
  /** A badge beside the name ("Archived", "Churned"), or null. */
  status(row: R): string | null;
  renderDetails(props: DetailsProps<R>): ReactNode;
}

/** The kind the portfolio components show. Organizations is the default,
 *  so its pages and every component rendered on its own read as before; the
 *  Accounts pages provide ACCOUNT_KIND around themselves. */
export const PortfolioKindContext = createContext<PortfolioKind>(ORGANIZATION_KIND);

export function usePortfolioKind(): PortfolioKind {
  return useContext(PortfolioKindContext);
}

/** "Carl CSM · Live · Touched 33d ago": the parts as one line of text. */
export function subtitleText(parts: SubtitlePart[]): string {
  return parts.map((part) => part.text).join(' · ');
}
