// The mailbox's categories: their labels and dots. Its own file so fast
// refresh works for the components that share them.

import type { MailCategory } from '../../features/mail/mailboxSlice';

export const CATEGORY_LABEL: Record<MailCategory, string> = {
  general: 'General',
  financial: 'Financial',
  newsletters: 'Newsletters',
  notifications: 'Notifications',
  promotions: 'Promotions',
  social: 'Social',
};

/** The dot beside a category, semantic tokens only. */
export const CATEGORY_DOT: Record<MailCategory, string> = {
  general: 'bg-ink-faint',
  financial: 'bg-info',
  newsletters: 'bg-danger',
  notifications: 'bg-success',
  promotions: 'bg-warning',
  social: 'bg-accent',
};

export const CATEGORIES: MailCategory[] = ['financial', 'newsletters', 'notifications', 'promotions', 'social'];
