// Which theme the document wears. Two exceptions to the setting: the hosted
// survey form (surveys spec §2.4) and the campaign unsubscribe page
// (campaigns spec §2.4), both opened by a customer from an email, are light
// only, whatever the device or a signed-in teammate's setting says.
export type ThemeSetting = 'light' | 'dark' | 'system';

/** Pages that are always light: /s/<token> and /u/<token>. */
export const LIGHT_ONLY = /^\/(s|u)\//;

export function themeIsDark(theme: ThemeSetting, prefersDark: boolean, pathname: string): boolean {
  if (LIGHT_ONLY.test(pathname)) return false;
  return theme === 'dark' || (theme === 'system' && prefersDark);
}
