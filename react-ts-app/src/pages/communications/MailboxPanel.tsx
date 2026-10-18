// The mailbox's own left panel: the folders and All mail, two filters, and the
// categories, and Gmail's labels. Folders, flags and labels pick a list; a
// category narrows it.

import { useState } from 'react';
import { AlertCircle, Ban, ChevronDown, ChevronRight, LayoutList, SlidersHorizontal, Star, Tag, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MailCategory, MailFolder, MailLabelEntry, MailSummary } from '../../features/mail/mailboxSlice';
import { LABEL_PENDING } from '../../features/mail/mailText';
import { NUM, Switch, TYPE } from '../../components/ui';
import { LabelDot } from './MailLabels';
import { FOLDER, FOLDER_OFF, FOLDER_ON } from './InboxPanel';
import { CATEGORIES, CATEGORY_DOT, CATEGORY_LABEL } from './mailCategories';

const FOLDERS: { folder: MailFolder; label: string }[] = [
  { folder: 'inbox', label: 'Inbox' },
  { folder: 'drafts', label: 'Drafts' },
  { folder: 'sent', label: 'Sent' },
  { folder: 'done', label: 'Done' },
  { folder: 'muted', label: 'Muted' },
  { folder: 'all', label: 'All mail' },
];

const FLAGS: { folder: MailFolder; label: string; icon: LucideIcon }[] = [
  { folder: 'starred', label: 'Starred', icon: Star },
  { folder: 'important', label: 'Important', icon: AlertCircle },
  { folder: 'spam', label: 'Spam', icon: Ban },
  { folder: 'trash', label: 'Trash', icon: Trash2 },
];

function Group({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`${FOLDER} ${FOLDER_OFF}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{title}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-[var(--dur-fast)] ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
      </button>
      {open ? children : null}
    </section>
  );
}

export function MailboxPanel({
  folder,
  category,
  unread,
  priority,
  label,
  summary,
  labels,
  onFolder,
  onCategory,
  onUnread,
  onPriority,
  onLabel,
}: {
  folder: MailFolder;
  category: MailCategory | null;
  unread: boolean;
  priority: boolean;
  label: number | null;
  summary: MailSummary | null;
  labels: MailLabelEntry[];
  onFolder: (folder: MailFolder) => void;
  onCategory: (category: MailCategory) => void;
  onUnread: (next: boolean) => void;
  onPriority: (next: boolean) => void;
  onLabel: (id: number) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [labelsOpen, setLabelsOpen] = useState(true);

  return (
    <aside aria-label="Mailbox folders and filters" className="flex w-[232px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-line-subtle pr-3 custom-scrollbar">
      <nav aria-label="Folders" className="flex flex-col gap-0.5">
        {FOLDERS.map(({ folder: f, label }) => {
          const active = f === folder && label === null;
          const count = summary?.folders[f as keyof MailSummary['folders']];
          return (
            <button
              key={f}
              type="button"
              onClick={() => onFolder(f)}
              aria-current={active ? 'page' : undefined}
              className={`${FOLDER} ${active ? FOLDER_ON : FOLDER_OFF}`}
            >
              <span className="flex-1 truncate">{label}</span>
              <span className={`${TYPE.meta} ${NUM}`}>{count === undefined ? '' : count}</span>
            </button>
          );
        })}
      </nav>

      {labels.length > 0 ? (
        <Group title="Labels" icon={Tag} open={labelsOpen} onToggle={() => setLabelsOpen((o) => !o)}>
          {labels.map((l) => {
            const active = l.id === label;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onLabel(l.id)}
                aria-current={active ? 'page' : undefined}
                title={l.pending ? LABEL_PENDING : undefined}
                className={`${FOLDER} ${active ? FOLDER_ON : FOLDER_OFF}`}
              >
                <LabelDot label={l} />
                <span className={`flex-1 truncate ${l.pending ? 'text-ink-faint' : ''}`}>{l.name}</span>
                {l.pending ? <span className="sr-only">{LABEL_PENDING}</span> : null}
                {l.unread > 0 ? (
                  <span className={`${TYPE.meta} ${NUM}`}>
                    {l.unread}
                    <span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </Group>
      ) : null}

      <Group title="Filters" icon={SlidersHorizontal} open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)}>
        <Switch checked={priority} onChange={onPriority} className="self-start">
          Priority
        </Switch>
        <Switch checked={unread} onChange={onUnread} className="self-start">
          Unread
        </Switch>
      </Group>

      <Group title="Categories" icon={LayoutList} open={categoriesOpen} onToggle={() => setCategoriesOpen((o) => !o)}>
        {FLAGS.map(({ folder: f, label, icon: Icon }) => {
          const active = f === folder;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onFolder(f)}
              aria-current={active ? 'page' : undefined}
              className={`${FOLDER} ${active ? FOLDER_ON : FOLDER_OFF}`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          );
        })}
        {CATEGORIES.map((c) => {
          const active = c === category;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onCategory(c)}
              aria-pressed={active}
              className={`${FOLDER} ${active ? FOLDER_ON : FOLDER_OFF}`}
            >
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
              <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[c]}`} aria-hidden="true" />
              {CATEGORY_LABEL[c]}
            </button>
          );
        })}
      </Group>
    </aside>
  );
}
