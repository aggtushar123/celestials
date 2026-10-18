import type { MessageSource } from './types';

/** Where a citation links: the company it was filed on. */
export function hrefOf(source: MessageSource): string {
  return source.company_type === 'customer' ? `/organizations/${source.company_id}` : `/accounts/${source.company_id}`;
}
