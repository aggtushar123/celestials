export const ASK_PREFERENCE_KEY = 'revenact_dashboard_ask';
/** Organizations' rail keeps its own choice: hiding it there says nothing
 *  about the Dashboard, and the reverse. */
export const ORGANIZATIONS_ASK_KEY = 'revenact_organizations_ask';
/** Contacts' rail keeps its own choice too. */
export const CONTACTS_ASK_KEY = 'revenact_contacts_ask';
/** Accounts' rail keeps its own choice too. */
export const ACCOUNTS_ASK_KEY = 'revenact_accounts_ask';
/** Pipelines' rail keeps its own choice too. */
export const PIPELINES_ASK_KEY = 'revenact_pipelines_ask';
/** The Brain's rail keeps its own choice too. */
export const BRAIN_ASK_KEY = 'revenact_brain_ask';

/** The person's own open/closed choice for a rail, or null before one. A
 *  private window or blocked storage reads as "no choice", so the default
 *  (open from xl) applies. */
export function readAskPreference(key = ASK_PREFERENCE_KEY): boolean | null {
  try {
    const value = localStorage.getItem(key);
    return value === 'open' ? true : value === 'closed' ? false : null;
  } catch {
    return null;
  }
}

export function writeAskPreference(open: boolean, key = ASK_PREFERENCE_KEY): void {
  try {
    localStorage.setItem(key, open ? 'open' : 'closed');
  } catch {
    /* forgotten next visit; the default applies */
  }
}
