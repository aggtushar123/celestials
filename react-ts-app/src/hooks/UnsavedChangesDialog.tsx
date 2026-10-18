import { ConfirmDialog } from '../components/organizations/ConfirmDialog';

/** The stay/leave prompt for `useUnsavedGuard`'s `pending` (an in-app link
 *  or `beforeunload`), or for an explicit close while dirty (X, Cancel,
 *  Escape) — the same wording either way, so a builder renders one of
 *  these instead of two copies of the same `ConfirmDialog`. `subject` is
 *  the one noun that differs per surface ("segment", "map", ...). */
export function UnsavedChangesDialog({ subject, onConfirm, onClose }: { subject: string; onConfirm: () => Promise<void>; onClose: () => void }) {
  return (
    <ConfirmDialog
      title="Leave without saving?"
      message={`Your changes to this ${subject} will be lost.`}
      confirmLabel="Leave"
      danger
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
