// The skills the Copilot offers. Shared by the home page and the sidebar;
// kept apart from the components so fast refresh works. Titles are the keys
// `onSelectSkill` is called with, so they must not change casually.

import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  FileText,
  Flag,
  Gauge,
  MessageSquareText,
  Package,
  Rocket,
  Users,
} from 'lucide-react';

export type Category = 'Account' | 'CSM' | 'Portfolio' | 'Product';

export interface Skill {
  title: string;
  desc: string;
  category: Category;
  icon: typeof FileText;
}

export const SKILLS: Skill[] = [
  { title: 'Internal Business Review', desc: 'The account in one page: health, usage, open items, what to decide.', category: 'Account', icon: FileText },
  { title: 'Quick Start Brief', desc: 'A compact, high-signal overview to get up to speed on an account fast.', category: 'Account', icon: Rocket },
  { title: 'Overview of strategy to de-risk', desc: 'Root cause of the risk on an account and a high-level path back.', category: 'Account', icon: Flag },
  { title: 'Prep weekly customer sync', desc: 'Open items, who owns each, and what to raise this week.', category: 'Account', icon: CalendarCheck },
  { title: 'One liner update', desc: 'The recent activity on an account, in a sentence you can forward.', category: 'Account', icon: MessageSquareText },
  { title: 'Onboarding Status Report', desc: 'Where onboarding stands, what is blocked, and by whom.', category: 'Account', icon: ClipboardList },
  { title: 'CSM performance review', desc: 'The high-impact interactions between a CSM and their customers.', category: 'CSM', icon: Users },
  { title: 'Onboarding Accounts Status...', desc: 'The top accounts by MRR that are still onboarding, and how it is going.', category: 'Portfolio', icon: Gauge },
  { title: 'Deep dive on product...', desc: 'Every feature request and piece of product feedback, analysed.', category: 'Product', icon: Package },
  { title: 'Features most requested by...', desc: 'The product asks that come up most, and from whom.', category: 'Product', icon: BarChart3 },
];
