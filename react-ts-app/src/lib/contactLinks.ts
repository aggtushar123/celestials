/** A `mailto:` for an address, or null when it must be shown as text: an
 *  address with `?`, `&` or `#` could carry its own mailto query (cc=, bcc=,
 *  body=). Only the local part (before the last `@`) is encoded; the domain
 *  never is, and the visible text stays the raw address. */
export function mailtoHref(email: string): string | null {
  if (!email || /[?&#]/.test(email)) return null;
  const at = email.lastIndexOf('@');
  if (at === -1) return `mailto:${encodeURIComponent(email)}`;
  return `mailto:${encodeURIComponent(email.slice(0, at))}@${email.slice(at + 1)}`;
}

/** A `tel:` keeping only digits and the plus, or null when none are left. */
export function telHref(phone: string): string | null {
  const dialled = phone.replace(/[^\d+]/g, '');
  return dialled ? `tel:${dialled}` : null;
}
