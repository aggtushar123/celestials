import { describe, it, expect } from 'vitest';
import reducer, {
  sessionSnapshotReceived,
  sessionPushReceived,
  myInvitesReceived,
  inviteRemoved,
} from './copilotSessionsSlice';
import type { CopilotSession, SessionInvite } from './types';

const carl = { id: 1, name: 'Carl' };
const priya = { id: 2, name: 'Priya' };

function session(overrides: Partial<CopilotSession> = {}): CopilotSession {
  return {
    id: 9,
    conversation_id: 42,
    owner: carl,
    customer_id: 7,
    customer_name: 'Pizza Hut',
    account_id: null,
    account_name: null,
    status: 'live',
    participants: [{ user: carl, joined_at: '2026-09-05T10:14:02Z', left_at: null }],
    events: [
      {
        id: 1,
        kind: 'made_live',
        actor: carl,
        message: null,
        payload: {},
        created_at: '2026-09-05T10:14:02Z',
      },
    ],
    created_at: '2026-09-05T10:14:02Z',
    closed_at: null,
    ...overrides,
  };
}

describe('copilotSessionsSlice', () => {
  it('sessionSnapshotReceived stores a brand-new session keyed by conversation_id', () => {
    const state = reducer(undefined, sessionSnapshotReceived(session()));
    expect(state.byId[42]).toEqual(session());
  });

  it('a later snapshot with new events appends rather than replacing the event list', () => {
    const before = reducer(undefined, sessionSnapshotReceived(session()));
    const redirected = {
      id: 2,
      kind: 'redirected' as const,
      actor: priya,
      message: { id: 100, role: 'user' as const, created_at: 't2' },
      payload: {},
      created_at: 't2',
    };

    const after = reducer(
      before,
      sessionSnapshotReceived(
        session({
          events: [redirected],
          participants: [
            { user: carl, joined_at: '2026-09-05T10:14:02Z', left_at: null },
            { user: priya, joined_at: 't2', left_at: null },
          ],
        })
      )
    );

    expect(after.byId[42].events.map((e) => e.id)).toEqual([1, 2]);
    expect(after.byId[42].participants).toHaveLength(2);
  });

  it('re-receiving the same event by id is not duplicated', () => {
    const before = reducer(undefined, sessionSnapshotReceived(session()));
    const after = reducer(before, sessionSnapshotReceived(session()));
    expect(after.byId[42].events).toHaveLength(1);
  });

  it('a poll response with a fresher status/participants still merges cleanly', () => {
    const before = reducer(undefined, sessionSnapshotReceived(session({ status: 'live' })));
    const after = reducer(before, sessionSnapshotReceived(session({ status: 'awaiting_handoff', events: [] })));

    expect(after.byId[42].status).toBe('awaiting_handoff');
    // No new events this tick — the one from before is still there.
    expect(after.byId[42].events).toHaveLength(1);
  });

  it('myInvitesReceived replaces the whole list', () => {
    const invite: SessionInvite = {
      id: 5,
      status: 'pending',
      invited_by: carl,
      conversation_id: 42,
      conversation_title: 'Renewal risk',
      account_label: 'Pizza Hut',
      created_at: 't1',
    };
    const state = reducer(undefined, myInvitesReceived([invite]));
    expect(state.myInvites).toEqual([invite]);
  });

  it('inviteRemoved drops one invite by id without touching the rest', () => {
    const invites: SessionInvite[] = [
      {
        id: 5,
        status: 'pending',
        invited_by: carl,
        conversation_id: 42,
        conversation_title: 'A',
        account_label: null,
        created_at: 't1',
      },
      {
        id: 6,
        status: 'pending',
        invited_by: carl,
        conversation_id: 43,
        conversation_title: 'B',
        account_label: null,
        created_at: 't1',
      },
    ];
    const before = reducer(undefined, myInvitesReceived(invites));
    const after = reducer(before, inviteRemoved({ inviteId: 5 }));
    expect(after.myInvites.map((i) => i.id)).toEqual([6]);
  });

  describe('privacy payloads: a push carries no names or notes', () => {
    const handedOff = (note: string | null) => ({
      id: 3,
      kind: 'handed_off' as const,
      actor: carl,
      message: null,
      payload: { to_user_id: 2, to_user_name: 'Priya', note },
      created_at: 't3',
    });

    it('a push after a poll keeps the names and the note the poll already has', () => {
      const polled = reducer(
        undefined,
        sessionSnapshotReceived(
          session({ account_id: 4, account_name: 'Pizza Hut EU', events: [handedOff('Renewal is yours now.')] })
        )
      );
      const pushed = reducer(
        polled,
        sessionPushReceived(
          session({
            customer_name: null,
            account_id: 4,
            account_name: null,
            status: 'awaiting_handoff',
            events: [handedOff(null)],
          })
        )
      );

      expect(pushed.byId[42].customer_name).toBe('Pizza Hut');
      expect(pushed.byId[42].account_name).toBe('Pizza Hut EU');
      expect(pushed.byId[42].events[0].payload.note).toBe('Renewal is yours now.');
      // Everything else in the push still lands.
      expect(pushed.byId[42].status).toBe('awaiting_handoff');
    });

    it('a new event first seen in a push keeps its null note until a poll fills it in', () => {
      const pushed = reducer(
        undefined,
        sessionPushReceived(session({ customer_name: null, events: [handedOff(null)] }))
      );
      expect(pushed.byId[42].customer_name).toBeNull();
      expect(pushed.byId[42].events[0].payload.note).toBeNull();

      const polled = reducer(pushed, sessionSnapshotReceived(session({ events: [handedOff('Renewal is yours now.')] })));
      expect(polled.byId[42].customer_name).toBe('Pizza Hut');
      expect(polled.byId[42].events).toHaveLength(1);
      expect(polled.byId[42].events[0].payload.note).toBe('Renewal is yours now.');
    });

    it('a poll is authoritative: its null replaces a name the viewer may no longer see', () => {
      const before = reducer(undefined, sessionSnapshotReceived(session()));
      const after = reducer(before, sessionSnapshotReceived(session({ customer_name: null })));
      expect(after.byId[42].customer_name).toBeNull();
    });
  });
});
