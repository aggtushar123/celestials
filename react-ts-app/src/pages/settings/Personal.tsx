import type { ReactElement } from 'react';

/** The You pages (Account, Personalization, Your skills & tasks, About),
 *  written for account settings' centred column: the same column, inside the
 *  Settings frame (owner, 2026-10-17). */
export function Personal({ children }: { children: ReactElement }) {
  return <div className="mx-auto w-full max-w-4xl p-4 pb-10 md:p-6">{children}</div>;
}
