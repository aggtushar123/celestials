import {
  parseAccountPageParams,
  toAccountPageSearch,
  withAccountPagePatch,
  type AccountPageParams,
} from '../../../features/accounts/accountPageParams';
import { usePageParams, type PageParamsCodec } from '../../organizations/detail/usePageParams';

const ACCOUNT_PAGE_CODEC: PageParamsCodec<AccountPageParams> = {
  parse: parseAccountPageParams,
  toSearch: toAccountPageSearch,
  withPatch: withAccountPagePatch,
};

/** The account page's URL state, as useDetailParams is the organization
 *  page's (usePageParams). */
export function useAccountPageParams() {
  return usePageParams(ACCOUNT_PAGE_CODEC);
}
