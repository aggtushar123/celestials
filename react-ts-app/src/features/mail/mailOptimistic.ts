// What an action does to the screen before the server answers (two-way
// Gmail D2, contract §3): the same changes Gmail will see, applied to a list
// row and to the open conversation, and whether the row leaves the view it
// is listed in. Pure: the slice applies these and keeps the before-values
// so a refusal can put them back (Decision 3).

import type { MailFolder, MailLabel, MailOp, MailThread, MailThreadDetail, ThreadPatch } from './mailboxSlice';

/** The bulk op as the conversation PATCH that means the same (contract §3). */
export function patchOfOp(op: MailOp, labelId: number | null): ThreadPatch {
  switch (op) {
    case 'read':
      return { is_read: true };
    case 'unread':
      return { is_read: false };
    case 'star':
      return { is_starred: true };
    case 'unstar':
      return { is_starred: false };
    case 'archive':
      return { state: 'done' };
    case 'inbox':
    case 'unmute':
      return { state: 'open' };
    case 'mute':
      return { state: 'muted' };
    case 'trash':
      return { trashed: true };
    case 'untrash':
      return { trashed: false };
    case 'spam':
      return { spam: true };
    case 'not_spam':
      return { spam: false };
    case 'label_add':
      return { add_labels: labelId === null ? [] : [labelId] };
    case 'label_remove':
      return { remove_labels: labelId === null ? [] : [labelId] };
  }
}

/** Whether a change takes a conversation out of the view it is listed in. */
export function leavesView({ folder, label }: { folder: MailFolder; label: number | null }, patch: ThreadPatch): boolean {
  if (label !== null && patch.remove_labels?.includes(label)) return true;
  if (patch.trashed !== undefined) return folder === 'trash' ? !patch.trashed : patch.trashed;
  if (patch.spam !== undefined) return folder === 'spam' ? !patch.spam : patch.spam;
  if (patch.state !== undefined) {
    if (folder === 'inbox') return patch.state !== 'open';
    if (folder === 'done' || folder === 'muted') return patch.state !== folder;
    return false;
  }
  return folder === 'starred' && patch.is_starred === false;
}

/** Labels after a change, by name; a label is added only when it is known. */
function labelsAfter(labels: readonly MailLabel[], patch: ThreadPatch, known: readonly MailLabel[]): MailLabel[] {
  const removed = new Set(patch.remove_labels ?? []);
  const kept = labels.filter((label) => !removed.has(label.id));
  for (const id of patch.add_labels ?? []) {
    if (kept.some((label) => label.id === id)) continue;
    const label = known.find((candidate) => candidate.id === id);
    if (label) kept.push({ id: label.id, name: label.name, color: label.color ? { ...label.color } : null, pending: label.pending });
  }
  return kept.sort((a, b) => a.name.localeCompare(b.name));
}

/** A list row after a change. Read and unread apply to every message. */
export function patchRow(row: MailThread, patch: ThreadPatch, known: readonly MailLabel[]): MailThread {
  const next: MailThread = { ...row };
  if (patch.is_read !== undefined) {
    next.is_read = patch.is_read;
    next.unread_count = patch.is_read ? 0 : row.message_count;
  }
  if (patch.is_starred !== undefined) next.is_starred = patch.is_starred;
  if (patch.state !== undefined) next.state = patch.state;
  if (patch.add_labels || patch.remove_labels) next.labels = labelsAfter(row.labels, patch, known);
  return next;
}

/** The open conversation after a change. Starring stars the newest message
 *  only; unstarring unstars them all (contract decision 10). */
export function patchThread(thread: MailThreadDetail, patch: ThreadPatch, known: readonly MailLabel[]): MailThreadDetail {
  const newest = thread.messages.length - 1;
  const labelled = Boolean(patch.add_labels || patch.remove_labels);
  return {
    ...thread,
    labels: labelled ? labelsAfter(thread.labels, patch, known) : thread.labels,
    messages: thread.messages.map((message, index) => {
      const next = { ...message };
      if (patch.is_read !== undefined) next.is_read = patch.is_read;
      if (patch.is_starred !== undefined) next.is_starred = patch.is_starred ? index === newest || message.is_starred : false;
      if (patch.state !== undefined) next.state = patch.state;
      if (labelled) next.labels = labelsAfter(message.labels, patch, known);
      return next;
    }),
  };
}

export type LabelState = 'all' | 'some' | 'none';

/** A label on every one of these, some of them, or none: the label menu's box. */
export function labelState(holders: readonly { labels: readonly MailLabel[] }[], id: number): LabelState {
  const having = holders.filter((holder) => holder.labels.some((label) => label.id === id)).length;
  if (having === 0) return 'none';
  return having === holders.length ? 'all' : 'some';
}
