import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiClient';
import type { User } from '../auth/authSlice';

// The organisation's members, fetched once per page load and shared by
// every @mention composer and picker — the same GET /auth/members/ the
// hand-off modal and the account forms already use.
let cache: Promise<User[]> | null = null;

export function loadMembers(): Promise<User[]> {
  if (!cache) {
    cache = apiFetch<User[]>('/auth/members/').catch(() => {
      cache = null;
      return [] as User[];
    });
  }
  return cache;
}

/** Test seam: forget the cached list. */
export function resetMembersCache() {
  cache = null;
}

export function useMembers(): User[] {
  const [members, setMembers] = useState<User[]>([]);
  useEffect(() => {
    let alive = true;
    loadMembers().then((rows) => {
      if (alive) setMembers(rows);
    });
    return () => {
      alive = false;
    };
  }, []);
  return members;
}
