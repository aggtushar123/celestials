import { Archive, UserX } from 'lucide-react';
import type { Option } from '../../../features/organizations/portfolioTypes';
import { usePortfolioKind } from './portfolioKind';
import { SelectionActionsBar, type BulkReport } from './SelectionActionsBar';
import { BUTTON } from './styles';
import { DANGER } from '../../ui';

export type { BulkReport } from './SelectionActionsBar';

/** The Organizations and Accounts selection bar (spec §1): Change owner and
 *  Set lifecycle, Export, and Organizations' Archive and Churn. Churn is
 *  offered for one account at a time: the backend refuses churn in bulk,
 *  and each churn records its own date and reason in the existing modal. */
export function SelectionBar({
  count,
  owners,
  lifecycles,
  activity,
  loading = false,
  report,
  onSetOwner,
  onSetLifecycle,
  onExport,
  onArchive,
  onChurn,
  keepChurn = false,
  onClose,
}: {
  count: number;
  /** Who the selection can be given to; `unassigned` is sent as null. */
  owners: Option[];
  /** Stages the selection can be moved to (churn is never offered). */
  lifecycles: Option[];
  activity: 'applying' | 'exporting' | null;
  loading?: boolean;
  report: BulkReport | null;
  onSetOwner: (userId: number | null) => void;
  onSetLifecycle: (stage: string) => void;
  onExport: () => void;
  /** Absent (Accounts): no Archive button. */
  onArchive?: () => void;
  /** Absent (Accounts): no Churn button. */
  onChurn?: () => void;
  /** Offer Churn among the stages (Accounts, where it is only a stage). */
  keepChurn?: boolean;
  onClose: () => void;
}) {
  const kind = usePortfolioKind();
  return (
    <SelectionActionsBar
      count={count}
      noun={kind.noun}
      choices={[
        { key: 'owner', label: 'Change owner', options: owners },
        { key: 'lifecycle', label: 'Set lifecycle', options: lifecycles.filter((stage) => keepChurn || stage.value !== 'churn') },
      ]}
      activity={activity}
      loading={loading}
      report={report}
      onApply={(key, value) => {
        if (key === 'owner') onSetOwner(value === 'unassigned' ? null : Number(value));
        else onSetLifecycle(value);
      }}
      onExport={onExport}
      extra={(disabled) => (
        <>
          {onArchive ? (
            <button type="button" onClick={onArchive} disabled={disabled} className={BUTTON}>
              <Archive className="w-4 h-4" aria-hidden="true" />
              Archive
            </button>
          ) : null}
          {count === 1 && onChurn ? (
            <button type="button" onClick={onChurn} disabled={disabled} className={DANGER}>
              <UserX className="w-4 h-4" aria-hidden="true" />
              Churn
            </button>
          ) : null}
        </>
      )}
      onClose={onClose}
    />
  );
}
