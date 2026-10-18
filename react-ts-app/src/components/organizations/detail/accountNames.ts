import { createContext } from 'react';
import type { Account } from '../../../features/customers/customersSlice';

/** The organization's accounts, for the list items' account tags: a tag is
 *  named from here by `account_id`, so renaming an account from the chips
 *  shows on every item at once. Empty outside a list tab. */
export const AccountNames = createContext<Account[]>([]);

/** Whether list and story items show their account tag. On an account's page
 *  every record is that account's, so the tag would only repeat the page's
 *  name: that page provides false. */
export const ShowAccountTags = createContext(true);
