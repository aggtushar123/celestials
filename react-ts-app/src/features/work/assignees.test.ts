import { describe, expect, it } from 'vitest';
import { assigneeOptions } from './assignees';
import { ASSIGNEES, CARL, ERIN_GONE } from './testWorkFixtures';

describe('assigneeOptions (spec §1.5: others are disabled with "Can\'t open this account")', () => {
  it('lists everyone, disabling who can’t open the record, in the record’s own word', () => {
    expect(assigneeOptions(ASSIGNEES, 'customer')).toEqual([
      { id: 1, label: 'Alice', disabled: false },
      { id: 3, label: 'Carl CSM', disabled: false },
      { id: 4, label: "Dana CSM · Can't open this organisation", disabled: true },
      { id: 2, label: 'Mona Manager', disabled: false },
    ]);
    expect(assigneeOptions(ASSIGNEES, 'account')[2].label).toBe("Dana CSM · Can't open this account");
  });

  it('keeps a current assignee the list no longer holds, disabled', () => {
    expect(assigneeOptions(ASSIGNEES, 'customer', ERIN_GONE)[0]).toEqual({ id: 5, label: 'Erin Former (no longer active)', disabled: true });
    expect(assigneeOptions([], 'customer', CARL)).toEqual([{ id: 3, label: 'Carl CSM', disabled: true }]);
    expect(assigneeOptions(ASSIGNEES, 'customer', CARL)).toHaveLength(4);
  });
});
