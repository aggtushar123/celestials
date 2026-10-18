// Where the message will be filed (contract decision 25; Decision 8): one
// line. Until the person picks, the server follows the suggestion from the
// recipients, and the line says so. Change opens the record search (the
// Pipelines picker, labelled "File on"); Don't file clears it, and the
// message then sends unfiled. An agent's draft stays on its record.

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import type { DraftRecord } from '../../features/mail/mailDrafts';
import { AGENT_RECORD_FIXED, CANCEL, CHANGE_RECORD, DONT_FILE, filedOn, NOT_FILED, RECORD_PICKER_LABEL, RECORD_SUGGESTED } from '../../features/mail/mailText';
import { ParentPicker } from '../../components/pipelines/portfolio/ParentPicker';
import { QUIET, TYPE } from '../../components/ui';

const same = (a: DraftRecord | null, b: DraftRecord | null) => a !== null && b !== null && a.kind === b.kind && a.id === b.id;

function Dot() {
  return <span aria-hidden="true">·</span>;
}

export function DraftRecordLine({
  record,
  suggested,
  chosen,
  fixed,
  onChange,
}: {
  record: DraftRecord | null;
  suggested: DraftRecord | null;
  chosen: boolean;
  /** An agent's draft: no Change, no Don't file. */
  fixed: boolean;
  onChange: (record: DraftRecord | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  if (picking) {
    return (
      <div className="flex flex-col gap-1">
        <ParentPicker
          label={RECORD_PICKER_LABEL}
          required={false}
          value={null}
          onChange={(choice) => {
            if (!choice) return;
            onChange({ kind: choice.type === 'organisation' ? 'customer' : 'account', id: choice.id, name: choice.name });
            setPicking(false);
          }}
        />
        <button type="button" onClick={() => setPicking(false)} className={`-ml-3 self-start ${QUIET}`}>
          {CANCEL}
        </button>
      </div>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-x-2 ${TYPE.meta}`}>
      <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="text-ink">{record ? filedOn(record.name) : NOT_FILED}</span>
      {!chosen && same(record, suggested) ? (
        <>
          <Dot />
          <span>{RECORD_SUGGESTED}</span>
        </>
      ) : null}
      {fixed ? (
        <>
          <Dot />
          <span>{AGENT_RECORD_FIXED}</span>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setPicking(true)} className={QUIET}>
            {CHANGE_RECORD}
          </button>
          {record ? (
            <button type="button" onClick={() => onChange(null)} className={QUIET}>
              {DONT_FILE}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
