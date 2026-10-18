// Mock activity data for Account entities.
// Uses the same data shapes as activityData.ts but keyed with accountId stored in orgId field.
// Account IDs here match ACCOUNTS_DATA ids: 'acc-1', 'acc-2', 'acc-3'.
// We store them as numeric stubs 101, 102, 103 mapped from account id string in ActivityFeed.


// Map from account string id → numeric stub used as orgId in these records
export const ACCOUNT_ID_MAP: Record<string, number> = {
  'acc-1': 101,
  'acc-2': 102,
  'acc-3': 103,
};
