import { describe, it, expect } from 'vitest';
import reducer, {
  notificationsReceived,
  notificationAdded,
  notificationRead,
  allRead,
} from './notificationsSlice';
import type { Notification } from './types';

const carl = { id: 2, name: 'Carl' };

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    kind: 'copilot_invite',
    message: 'Carl invited you to a live Copilot session',
    link: '/copilot?session=1',
    actor: carl,
    is_read: false,
    created_at: '2026-09-06T10:00:00Z',
    ...overrides,
  };
}

describe('notificationsSlice', () => {
  it('notificationsReceived replaces the whole list', () => {
    const state = reducer(undefined, notificationsReceived([notification()]));
    expect(state.items).toEqual([notification()]);
  });

  it('notificationAdded prepends a new one, newest first', () => {
    const before = reducer(undefined, notificationsReceived([notification({ id: 1 })]));
    const after = reducer(before, notificationAdded(notification({ id: 2, message: 'Newer' })));
    expect(after.items.map((n) => n.id)).toEqual([2, 1]);
  });

  it('notificationAdded does not duplicate an id already present', () => {
    const before = reducer(undefined, notificationsReceived([notification({ id: 1 })]));
    const after = reducer(before, notificationAdded(notification({ id: 1 })));
    expect(after.items).toHaveLength(1);
  });

  it('notificationRead marks only the matching one read', () => {
    const before = reducer(
      undefined,
      notificationsReceived([notification({ id: 1 }), notification({ id: 2 })])
    );
    const after = reducer(before, notificationRead({ id: 1 }));
    expect(after.items.find((n) => n.id === 1)?.is_read).toBe(true);
    expect(after.items.find((n) => n.id === 2)?.is_read).toBe(false);
  });

  it('allRead marks every notification read', () => {
    const before = reducer(
      undefined,
      notificationsReceived([notification({ id: 1 }), notification({ id: 2 })])
    );
    const after = reducer(before, allRead());
    expect(after.items.every((n) => n.is_read)).toBe(true);
  });
});
