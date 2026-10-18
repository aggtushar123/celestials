// One draft's life in the composer (two-way Gmail D3, Decisions 4 to 6, 10):
// the prefill or the stored draft, the person's edits, the 2 s autosave
// (create, then PATCH with `revision`), a Gmail edit that got there first
// (409 DRAFT_CHANGED), the send and its states, and discard. Every write
// goes through one promise chain, so a revision is never sent twice and an
// upload's revision bump never makes a PATCH stale. A plain class with
// subscribe/getState, so its rules are tested without React; the composer
// reads it through useDraftSession. No React here.

import { ApiError } from '../../lib/apiClient';
import { DRAFTS } from '../agents/draftsText';
import { cleanEditable } from './mailEditor';
import type { MailParticipant } from './mailboxSlice';
import {
  confirmMailDraftSent,
  createMailDraft,
  discardMailDraft,
  draftFailure,
  fetchComposePrefill,
  fetchMailDraft,
  joinQuote,
  MAIL_SEND_MAX_BYTES,
  patchMailDraft,
  plainFailure,
  removeDraftAttachment,
  reopenMailDraft,
  sendMailDraft,
  splitQuote,
  uploadDraftAttachment,
  uploadRefusal,
  type ComposePrefill,
  type DraftAttachment,
  type DraftContent,
  type DraftFailure,
  type DraftKind,
  type DraftRecord,
  type DraftSent,
  type MailDraft,
  type Recipient,
} from './mailDrafts';
import { DISCARD_FAILED, DRAFT_OPEN_FAILED, DRAFT_SAVE_FAILED, NO_RECIPIENT, PREFILL_FAILED, SEND_FAILED, UPLOAD_FAILED } from './mailText';

export type ComposeTarget = { kind: 'new' } | { kind: 'reply' | 'reply_all' | 'forward'; messageId: number } | { kind: 'draft'; draftId: number };

export interface DraftFields {
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  /** The editable part, above the quote (Decision 7). */
  body: string;
}

export interface Upload {
  key: number;
  name: string;
  /** 0 to 1. */
  fraction: number;
}

export interface SessionState {
  phase: 'loading' | 'ready' | 'failed' | 'sent' | 'discarded';
  loadError: string | null;
  kind: DraftKind;
  from: MailParticipant | null;
  fields: DraftFields;
  /** Kept as it is and joined back on every save. */
  quote: string;
  /** Moves when the fields are replaced from the server: the editor re-seeds. */
  seed: number;
  /** The server's last word on the draft; null until it is first saved. */
  draft: MailDraft | null;
  /** The prefill's forwarded files, before a draft exists. */
  forwarded: DraftAttachment[];
  /** The prefill's byte numbers (contract §2 amendment), before a draft exists; read through attachmentBytes. */
  prefillBytes: Pick<ComposePrefill, 'total_bytes' | 'max_bytes'> | null;
  record: DraftRecord | null;
  suggested: DraftRecord | null;
  recordChosen: boolean;
  dirty: boolean;
  saving: boolean;
  sending: boolean;
  /** Gmail's newer version, waiting for the person's choice (Decision 6). */
  conflict: MailDraft | null;
  /** The last refusal of a save, upload, send or discard. */
  failure: DraftFailure | null;
  uploads: Upload[];
  sent: DraftSent | null;
}

export const AUTOSAVE_MS = 2000;
/** While a write's answer says Gmail is still saving, the draft is read again this often, this many times at most. */
export const SAVING_POLL_MS = 3000;
const SAVING_TRIES = 5;

/** A send refusal after which the draft on the server moved: read it again. */
const REREAD = new Set(['SEND_UNCONFIRMED', 'SEND_SUPERSEDED', 'ALREADY_SENT', 'DRAFT_GONE']);

/** The attachments' total and the limit, the one place they are worked out:
 *  the draft's numbers once it exists, else the prefill's, else the
 *  forwarded files' sizes and MAIL_SEND_MAX_BYTES. */
export function attachmentBytes(state: Pick<SessionState, 'draft' | 'forwarded' | 'prefillBytes'>): { total: number; max: number } {
  if (state.draft) return { total: state.draft.total_bytes, max: state.draft.max_bytes };
  return {
    total: state.prefillBytes?.total_bytes ?? state.forwarded.reduce((sum, file) => sum + file.size, 0),
    max: state.prefillBytes?.max_bytes ?? MAIL_SEND_MAX_BYTES,
  };
}

export class DraftSession {
  private state: SessionState;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  /** Writes queued or running on the chain. */
  private queued = 0;
  /** Local changes made, and the count the last save carried. */
  private edits = 0;
  private saved = 0;
  private recordTouched = false;
  /** Record picks made; a save's answer keeps a pick made while it was in flight. */
  private recordEdits = 0;
  private sourceId: number | null;
  private started = false;
  private uploadKey = 0;
  /** Numbers the reads and the resolves: an answer from an older one is dropped. */
  private readRun = 0;
  private resolveRun = 0;
  private disposed = false;
  /** The read-again while Gmail is saving: its timer, its run (a stopped run's answer is dropped) and its reads. */
  private watchTimer: ReturnType<typeof setTimeout> | null = null;
  private watchRun = 0;
  private watchTries = 0;
  private readonly target: ComposeTarget;
  private readonly autosaveMs: number;
  private readonly savingPollMs: number;

  constructor(target: ComposeTarget, autosaveMs = AUTOSAVE_MS, savingPollMs = SAVING_POLL_MS) {
    this.target = target;
    this.autosaveMs = autosaveMs;
    this.savingPollMs = savingPollMs;
    this.sourceId = target.kind === 'new' || target.kind === 'draft' ? null : target.messageId;
    this.state = {
      phase: 'loading',
      loadError: null,
      kind: target.kind === 'draft' ? 'new' : target.kind,
      from: null,
      fields: { to: [], cc: [], bcc: [], subject: '', body: '' },
      quote: '',
      seed: 0,
      draft: null,
      forwarded: [],
      prefillBytes: null,
      record: null,
      suggested: null,
      recordChosen: false,
      dirty: false,
      saving: false,
      sending: false,
      conflict: null,
      failure: null,
      uploads: [],
      sent: null,
    };
  }

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  protected set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  /** Reads the prefill or the draft. A second call is a no-op (StrictMode). */
  async start(): Promise<void> {
    // StrictMode disposes and mounts again: the session lives on.
    this.disposed = false;
    if (this.started) return;
    this.started = true;
    try {
      if (this.target.kind === 'draft') {
        this.adopt(await fetchMailDraft(this.target.draftId));
        return;
      }
      const prefill = await fetchComposePrefill(this.target.kind, this.sourceId);
      const { body, quote } = splitQuote(prefill.html);
      this.set({
        phase: 'ready',
        kind: prefill.kind,
        from: prefill.from,
        fields: { to: prefill.to, cc: prefill.cc, bcc: prefill.bcc, subject: prefill.subject, body },
        quote,
        seed: this.state.seed + 1,
        forwarded: prefill.forwarded,
        prefillBytes: { total_bytes: prefill.total_bytes, max_bytes: prefill.max_bytes },
        record: prefill.record,
        suggested: prefill.suggested_record,
      });
    } catch (err) {
      this.set({ phase: 'failed', loadError: draftFailure(err, this.target.kind === 'draft' ? DRAFT_OPEN_FAILED : PREFILL_FAILED).text });
    }
  }

  /** Try again after a failed start. */
  restart(): Promise<void> {
    this.started = false;
    this.set({ phase: 'loading', loadError: null });
    return this.start();
  }

  /** The server's draft becomes the screen: fields, quote, record. */
  protected adopt(draft: MailDraft) {
    const { body, quote } = splitQuote(draft.html);
    this.sourceId = draft.source?.message_id ?? null;
    this.recordTouched = false;
    this.saved = this.edits;
    this.set({
      phase: 'ready',
      kind: draft.kind,
      from: draft.from,
      fields: { to: draft.to, cc: draft.cc, bcc: draft.bcc, subject: draft.subject, body },
      quote,
      seed: this.state.seed + 1,
      draft,
      forwarded: [],
      record: draft.record,
      suggested: draft.suggested_record,
      recordChosen: draft.record_chosen,
      dirty: false,
      conflict: null,
    });
  }

  /** A save's answer: the server's numbers and record, the screen's words
   *  untouched. A record picked while the save was in flight stays on screen
   *  until the next save carries it. */
  protected took(draft: MailDraft, recordAt: number) {
    const keep = this.recordEdits !== recordAt;
    this.set({ draft, record: keep ? this.state.record : draft.record, suggested: draft.suggested_record, recordChosen: keep || draft.record_chosen });
  }

  /** A change on screen; saved 2 s after the last one. */
  edit(patch: Partial<DraftFields>) {
    if (this.state.phase !== 'ready' || this.isLocked()) return;
    this.edits += 1;
    this.set({ fields: { ...this.state.fields, ...patch }, dirty: true, failure: null });
    this.schedule();
  }

  /** A sent draft, or one being sent, is read-only: no edit, file or discard reaches it. */
  protected isLocked(): boolean {
    const { draft } = this.state;
    return this.state.sending || draft?.status === 'sent' || Boolean(draft?.sending);
  }

  /** The person picks the record, or clears it (Decision 8). An agent's draft keeps its own. */
  setRecord(record: DraftRecord | null) {
    if (this.state.phase !== 'ready' || this.isLocked() || this.state.draft?.agent) return;
    this.recordTouched = true;
    this.recordEdits += 1;
    this.edits += 1;
    this.set({ record, recordChosen: true, dirty: true, failure: null });
    this.schedule();
  }

  /** Attaches one file (Decision 9): checked first, then the draft is made
   *  if there is none yet, then uploaded through the chain with progress. */
  async upload(file: File): Promise<void> {
    if (this.state.phase !== 'ready' || this.isLocked()) return;
    const draft = this.state.draft;
    const { total, max } = attachmentBytes(this.state);
    const refusal = uploadRefusal(file, total, max);
    if (refusal) {
      this.set({ failure: plainFailure(refusal) });
      return;
    }
    const key = ++this.uploadKey;
    this.set({ uploads: [...this.state.uploads, { key, name: file.name, fraction: 0 }], failure: null });
    // A file is a change: the first one makes the draft.
    if (!draft) this.edits += 1;
    this.cancelTimer();
    await this.save();
    await this.enqueue(async () => {
      const current = this.state.draft;
      if (!current) return; // the save failed and said why
      try {
        const answer = await uploadDraftAttachment(current.id, file, (fraction) => this.set({ uploads: this.state.uploads.map((u) => (u.key === key ? { ...u, fraction } : u)) }));
        const latest = this.state.draft ?? current;
        // The answer has no gmail field: the write set it saving, so the re-read settles it.
        this.set({ draft: { ...latest, attachments: [...latest.attachments, answer.attachment], revision: answer.revision, total_bytes: answer.total_bytes, gmail: { ...latest.gmail, state: 'saving' } } });
      } catch (err) {
        this.set({ failure: draftFailure(err, UPLOAD_FAILED) });
      }
    });
    this.set({ uploads: this.state.uploads.filter((u) => u.key !== key) });
  }

  /** Removes a part: from the prefill's forwarded list before a draft exists, on the server after. */
  async removeAttachment(id: number): Promise<void> {
    if (this.state.phase !== 'ready' || this.isLocked()) return;
    if (!this.state.draft) {
      const gone = this.state.forwarded.find((file) => file.id === id);
      if (!gone) return;
      this.edits += 1;
      const { prefillBytes } = this.state;
      this.set({
        forwarded: this.state.forwarded.filter((file) => file.id !== id),
        // The prefill's total counted this file: attachmentBytes stays the one place the numbers are read.
        prefillBytes: prefillBytes ? { ...prefillBytes, total_bytes: Math.max(0, attachmentBytes(this.state).total - gone.size) } : null,
        dirty: true,
      });
      this.schedule();
      return;
    }
    await this.enqueue(async () => {
      const current = this.state.draft;
      if (!current) return;
      try {
        const answer = await removeDraftAttachment(current.id, id);
        const latest = this.state.draft ?? current;
        this.set({ draft: { ...latest, attachments: latest.attachments.filter((a) => a.id !== id), revision: answer.revision, total_bytes: answer.total_bytes, gmail: { ...latest.gmail, state: 'saving' } }, failure: null });
      } catch (err) {
        this.set({ failure: draftFailure(err, UPLOAD_FAILED) });
      }
    });
  }

  protected schedule() {
    this.stopWatch();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save();
    }, this.autosaveMs);
  }

  protected cancelTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Runs `work` after every write already queued, whatever they answered.
   *  A write stops the read-again; the last one to finish may start it. */
  protected enqueue<T>(work: () => Promise<T>): Promise<T> {
    this.stopWatch();
    this.queued += 1;
    const run = this.chain.then(work, work).finally(() => {
      this.queued -= 1;
      this.watchSaving();
    });
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** After the last write, while its answer says Gmail is still saving and
   *  nothing else is waiting, the draft is read again (at most 5 times). */
  protected watchSaving() {
    if (this.disposed || this.queued > 0 || this.timer || this.edits !== this.saved) return;
    const { phase, conflict, sending, draft } = this.state;
    if (phase !== 'ready' || conflict || sending || draft?.gmail.state !== 'saving') return;
    this.stopWatch();
    this.watchTries = 0;
    this.nextWatch(this.watchRun);
  }

  protected stopWatch() {
    if (this.watchTimer) clearTimeout(this.watchTimer);
    this.watchTimer = null;
    this.watchRun += 1;
  }

  private nextWatch(run: number) {
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      void this.readGmailState(run);
    }, this.savingPollMs);
  }

  /** Takes only `gmail` and `sync_issue` from the read: never the content or
   *  the revision, so it cannot overwrite what is on screen. */
  private async readGmailState(run: number) {
    const id = this.state.draft?.id;
    if (!id) return;
    this.watchTries += 1;
    let fresh: MailDraft | null = null;
    try {
      fresh = await fetchMailDraft(id);
    } catch {
      // Counts as a read; the next one tries again.
    }
    if (run !== this.watchRun) return;
    const current = this.state.draft;
    if (fresh && current?.id === fresh.id) this.set({ draft: { ...current, gmail: fresh.gmail, sync_issue: fresh.sync_issue } });
    if (this.state.draft?.gmail.state === 'saving' && this.watchTries < SAVING_TRIES) this.nextWatch(run);
  }

  protected content(): DraftContent {
    const { to, cc, bcc, subject, body } = this.state.fields;
    const out: DraftContent = { to, cc, bcc, subject, html: joinQuote(cleanEditable(body), this.state.quote) };
    if (!this.state.draft && this.state.kind === 'forward') out.forwarded = this.state.forwarded.map((file) => file.id);
    if (this.recordTouched) out.record = this.state.record ? { kind: this.state.record.kind, id: this.state.record.id } : null;
    return out;
  }

  /** Saves when anything changed since the last save; resolves either way. */
  protected save(): Promise<void> {
    return this.enqueue(async () => {
      if (this.state.phase !== 'ready' || this.state.conflict || this.edits === this.saved) return;
      const at = this.edits;
      const recordAt = this.recordEdits;
      this.set({ saving: true });
      try {
        const current = this.state.draft;
        const draft = current
          ? await patchMailDraft(current.id, { ...this.content(), revision: current.revision })
          : await createMailDraft({ kind: this.state.kind, ...(this.sourceId !== null ? { source_message_id: this.sourceId } : {}), ...this.content() });
        this.saved = at;
        this.took(draft, recordAt);
        this.set({ saving: false, dirty: this.edits !== this.saved, failure: null });
      } catch (err) {
        const failure = draftFailure(err, DRAFT_SAVE_FAILED);
        if (failure.code === 'DRAFT_CHANGED' && failure.draft) this.set({ saving: false, conflict: failure.draft });
        else this.set({ saving: false, failure });
      }
    });
  }

  /** Saves now (Back, unmount, before a send or an upload). */
  flush(): Promise<void> {
    this.cancelTimer();
    return this.save();
  }

  /** Saves what is unsaved; true when closing loses nothing (Decision 5).
   *  Never while a Gmail change waits for a choice: the screen's edits are
   *  not saved until Keep mine, so the banner is the prompt. */
  async close(): Promise<boolean> {
    await this.flush();
    if (this.state.conflict) return false;
    return this.state.phase !== 'ready' || this.state.draft !== null || this.edits === 0;
  }

  /** Gmail's version replaces the screen (Decision 6). */
  takeGmail() {
    const theirs = this.state.conflict;
    if (theirs) this.adopt(theirs);
  }

  /** The screen's content is saved over Gmail's version (Decision 6). */
  keepMine() {
    const theirs = this.state.conflict;
    if (!theirs) return;
    this.set({ conflict: null, draft: theirs });
    // A save even when nothing changed since the refused one.
    this.edits += 1;
    void this.save();
  }

  /** The draft as the server has it now: after a refused or unconfirmed send, and each minute while one is pending. */
  async reread(): Promise<void> {
    const id = this.state.draft?.id;
    if (!id) return;
    const run = ++this.readRun;
    try {
      const draft = await fetchMailDraft(id);
      if (run !== this.readRun) return;
      this.set({ draft });
    } catch {
      // The line on screen stays; the next read tries again.
    }
  }

  /** Sends what is on screen (Decision 10); true when it went. */
  async send(): Promise<boolean> {
    if (this.state.phase !== 'ready' || this.state.sending || this.state.conflict) return false;
    const { to, cc, bcc } = this.state.fields;
    if (to.length + cc.length + bcc.length === 0) {
      this.set({ failure: { ...plainFailure(NO_RECIPIENT), fields: { to: NO_RECIPIENT } } });
      return false;
    }
    this.cancelTimer();
    this.set({ sending: true, failure: null });
    // The draft must exist, even when nothing was typed (a forward sent as
    // it came); an edit made after this save rides with the send.
    if (!this.state.draft) this.edits += 1;
    await this.save();
    return this.enqueue(async () => {
      const draft = this.state.draft;
      if (!draft || this.state.conflict) {
        this.set({ sending: false });
        return false;
      }
      try {
        const answer = await sendMailDraft(draft.id, { ...this.content(), revision: draft.revision });
        this.saved = this.edits;
        this.set({ sending: false, phase: 'sent', sent: answer, draft: answer.draft });
        return true;
      } catch (err) {
        const failure = draftFailure(err, SEND_FAILED);
        if (failure.code === 'DRAFT_CHANGED' && failure.draft) {
          this.set({ sending: false, conflict: failure.draft });
          return false;
        }
        this.set({ sending: false, failure });
        if (failure.code !== null && REREAD.has(failure.code)) await this.reread();
        return false;
      }
    });
  }

  /** It was sent / Reopen draft, for an unconfirmed send (contract §4). */
  async resolve(verb: 'confirm' | 'reopen'): Promise<void> {
    const id = this.state.draft?.id;
    if (!id) return;
    // A read in flight is now older than this answer; a newer resolve beats this one.
    this.readRun += 1;
    const run = ++this.resolveRun;
    try {
      const draft = verb === 'confirm' ? await confirmMailDraftSent(id) : await reopenMailDraft(id);
      if (run !== this.resolveRun) return;
      this.readRun += 1;
      if (verb === 'reopen') this.adopt(draft);
      else this.set({ draft });
      this.set({ failure: null });
    } catch (err) {
      if (run !== this.resolveRun) return;
      this.set({ failure: draftFailure(err, verb === 'confirm' ? DRAFTS.CONFIRM_FAILED : DRAFTS.REOPEN_FAILED) });
    }
  }

  /** Discards the draft only (contract decision 12); nothing to call before it exists. */
  discard(): Promise<boolean> {
    // Nothing to discard while loading (start() would flip it back), and nothing once sent.
    if (this.state.phase === 'loading' || this.isLocked()) return Promise.resolve(false);
    this.cancelTimer();
    return this.enqueue(async () => {
      const draft = this.state.draft;
      if (draft) {
        try {
          await discardMailDraft(draft.id);
        } catch (err) {
          // Gone already counts as discarded.
          if (!(err instanceof ApiError && err.status === 404)) {
            this.set({ failure: draftFailure(err, DISCARD_FAILED) });
            return false;
          }
        }
      }
      this.saved = this.edits;
      this.set({ phase: 'discarded' });
      return true;
    });
  }

  /** Unmounted without Back (a folder change): what is unsaved is saved, and the read-again stops. */
  dispose() {
    this.disposed = true;
    this.stopWatch();
    void this.flush();
  }
}
