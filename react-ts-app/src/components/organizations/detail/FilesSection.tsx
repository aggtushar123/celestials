import { useId, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { UploadCloud } from 'lucide-react';
import { useAppDispatch, useAppSelector, useCapability } from '../../../hooks';
import type { Account } from '../../../features/customers/customersSlice';
import { canDeleteFile, FILE_ACCEPT } from '../../../features/files/fileFormat';
import { deleteFile, downloadAttachment, fetchFiles, uploadFile, type Attachment, type FileParent } from '../../../features/files/filesSlice';
import { awaitingAccount, byAccount, chosenAccount, scopeLabel } from '../../../features/organizations/accountScope';
import { resolveScope, scopeSlot, type ScopeProps } from '../../../features/organizations/detailScope';
import { ConfirmDialog } from '../ConfirmDialog';
import { BUTTON, CardHeader, ErrorState as UiErrorState, INPUT, ListCard, LoadingState, TYPE } from '../../ui';
import { FileItem } from './FileItem';
import { AccountNames } from './accountNames';
import { AddPaused, ScopedEmpty } from './ListParts';

/** The page's own account as a file parent, built once: on the account page
 *  it is both what's read and, absent an account chip, where uploads land. */
function pageAccountTarget(kind: 'organization' | 'account', scopeId: number): FileParent | null {
  return kind === 'account' ? { entityType: 'account', customerId: null, accountId: scopeId } : null;
}

type FilesSectionProps = ScopeProps & {
  /** The chip: '' All, 'none' the organization itself, or an account id. Always '' on an account's page. */
  account: string;
  accounts: Account[];
  isSm: boolean;
  onShowAll: () => void;
};

/** Files (spec 2026-09-27 §4; account spec §2.9): the organization's own
 *  files and every visible account's, each tagged and narrowed by the account
 *  chip, or one account's own. Uploading (the button or a drop) attaches to
 *  the chosen account, or the page's account. Downloads go through the
 *  session: the API never exposes a URL a plain link could open. */
export function FilesSection(props: FilesSectionProps) {
  const { account, accounts, onShowAll } = props;
  const scope = resolveScope(props);
  const kind = scope.kind;
  const scopeId = scope.id;
  const pageAccountName = scope.kind === 'account' ? scope.name : null;
  const dispatch = useAppDispatch();
  const { items, isLoading, error, uploading, uploadError, scope: slot } = useAppSelector((state) => state.files);
  const me = useAppSelector((state) => state.auth.user);
  const isAdmin = useCapability('manage_org_settings');
  // The shared slot holds this page's files (not another's).
  const loaded = slot === scopeSlot({ kind, id: scopeId });
  const [attempt, setAttempt] = useState(0);
  const [description, setDescription] = useState('');
  const [dragging, setDragging] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const pausedId = useId();

  const target = chosenAccount(accounts, account);
  const paused = awaitingAccount(accounts, account);
  const parent: FileParent =
    pageAccountTarget(kind, scopeId) ?? (target ? { entityType: 'account', customerId: scopeId, accountId: target.id } : { entityType: 'organization', customerId: scopeId });

  // Before paint, as People does.
  useLayoutEffect(() => {
    void dispatch(fetchFiles(pageAccountTarget(kind, scopeId) ?? { entityType: 'organization', customerId: scopeId }));
  }, [dispatch, kind, scopeId, attempt]);

  const shown = byAccount(items, account);
  const failed = error !== null && !isLoading;

  async function send(files: FileList | File[]) {
    if (paused) return;
    for (const file of Array.from(files)) {
      await dispatch(uploadFile({ ...parent, file, description: description.trim() || undefined }));
    }
    setDescription('');
    if (input.current) input.current.value = '';
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) void send(event.dataTransfer.files);
  }

  async function download(file: Attachment) {
    setDownloadError(null);
    try {
      await downloadAttachment(file);
    } catch {
      setDownloadError(`Could not download ${file.name}.`);
    }
  }

  let state: ReactNode;
  if (failed) state = <UiErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (!loaded) state = <LoadingState label="Loading files" />;
  else if (shown.length === 0) {
    state = (
      <ScopedEmpty
        what="files"
        scope={scopeLabel(accounts, account)}
        detail="Contracts, decks and transcripts the team keeps here. Drop files on this section or use Upload file."
        onShowAll={onShowAll}
      />
    );
  }

  return (
    <AccountNames.Provider value={accounts}>
      <section
        aria-labelledby={headingId}
        className="rounded-xl"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <ListCard
          className={dragging ? 'bg-subtle ring-2 ring-accent' : ''}
          label="Files"
          header={
            <>
              <CardHeader
                id={headingId}
                title="Files"
                action={
                  <>
                    <input
                      ref={input}
                      type="file"
                      multiple
                      accept={FILE_ACCEPT}
                      tabIndex={-1}
                      aria-label="Choose files"
                      className="sr-only"
                      onChange={(event) => {
                        if (event.target.files) void send(event.target.files);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => input.current?.click()}
                      disabled={uploading || paused}
                      aria-describedby={paused ? pausedId : undefined}
                      className={`${BUTTON} justify-center`}
                    >
                      <UploadCloud className="h-4 w-4" aria-hidden="true" />
                      {uploading ? 'Uploading…' : 'Upload file'}
                    </button>
                  </>
                }
              />
              <div className="flex flex-col gap-1.5 border-b border-line-subtle px-4 py-3">
                <label htmlFor={descriptionId} className={TYPE.label}>
                  Description (optional)
                </label>
                <input id={descriptionId} value={description} onChange={(event) => setDescription(event.target.value)} className={INPUT} />
                <p className={TYPE.meta}>
                  {/* A truthy check, not `??`: an account's own page names it ''
                   *  until its row lands, and `''` is not "no name" the way
                   *  `undefined` is. */}
                  Up to 25 MB each. New files go on {pageAccountName || target?.name || 'the organization'}.
                </p>
                {paused ? <AddPaused id={pausedId} /> : null}
                {uploadError || downloadError ? (
                  <p role="alert" className="text-[13px] leading-5 text-danger-ink">
                    {downloadError ?? uploadError}
                  </p>
                ) : null}
              </div>
            </>
          }
          state={state}
        >
          {shown.map((file) => (
            <FileItem
              key={file.id}
              file={file}
              canDelete={canDeleteFile(file, me?.id ?? null, isAdmin)}
              onDownload={() => void download(file)}
              onDelete={() => setDeleting(file)}
            />
          ))}
        </ListCard>
        {deleting ? (
          <ConfirmDialog
            title={`Delete ${deleting.name}?`}
            message="This can't be undone."
            confirmLabel="Delete"
            danger
            onConfirm={async () => {
              await dispatch(deleteFile(deleting.id)).unwrap();
            }}
            onClose={() => setDeleting(null)}
          />
        ) : null}
      </section>
    </AccountNames.Provider>
  );
}
