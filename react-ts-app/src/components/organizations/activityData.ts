// --- Activity Feed Data ---

export interface EmailItem {
  id: number;
  orgId: number;
  subject: string;
  senderName: string;
  senderAvatar: string;
  recipientName: string;
  body: string;
  date: string;
  time: string;
  group: string;
  links: number;
  watchers: number;
  isStarred: boolean;
}

export interface TaskItem {
  id: number;
  orgId: number;
  title: string;
  assignee: string;
  assigneeAvatar: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in-progress' | 'completed';
  group: string;
}

export interface NoteItem {
  id: number;
  orgId: number;
  title: string;
  content: string;
  author: string;
  authorAvatar: string;
  date: string;
  group: string;
  tags: string[];
}

export interface TicketItem {
  id: number;
  orgId: number;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignee: string;
  date: string;
  group: string;
  ticketId: string;
}

export interface CalendarEventItem {
  id: number;
  orgId: number;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  date: string;
  group: string;
  attendees: string[];
  type: 'meeting' | 'call' | 'review' | 'demo';
}

export interface ActivityItem {
  id: number;
  orgId: number;
  type: string;
  date: string;
  group: string;
  links: number;
  watchers: number;
}

// --- Emails Data ---
