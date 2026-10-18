import { apiFetch, ApiError } from '../../lib/apiClient';

export interface OwnershipTransfer {
  owner: { id: number; name: string };
}

/** POST /auth/organisation/owner/ { user_id }: only the current owner may
 *  call it; the new owner must be another active member. */
export function transferOwnership(userId: number): Promise<OwnershipTransfer> {
  return apiFetch<OwnershipTransfer>('/auth/organisation/owner/', { method: 'POST', body: { user_id: userId } });
}

/** The identity endpoints answer `{ success: false, error: { code, message } }`;
 *  the message is written for people, so it is what the page shows. */
export function ownershipErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: { message?: string } } | null;
    return body?.error?.message ?? err.message;
  }
  return 'Could not transfer ownership.';
}
