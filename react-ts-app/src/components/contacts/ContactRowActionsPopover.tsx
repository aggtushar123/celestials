import React from 'react';

interface Props {
  onClose: () => void;
  style?: React.CSSProperties;
  onEdit: () => void;
  onDelete: () => void;
}

// A per-row "..." menu with a short Edit/Delete list (Contact has no
// Archive/Churn-equivalent state to manage).
export function ContactRowActionsPopover({ onClose, style, onEdit, onDelete }: Props) {
  return (
    <>
      <div className="fixed inset-0 z-[100]" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div
        className="absolute z-[110] bg-elevated rounded-[6px] shadow-[0_4px_24px_rgba(0,0,0,0.5)] border border-line-strong w-[160px] flex flex-col py-1.5 pointer-events-auto"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onEdit}
          className="text-left px-4 py-2 text-[13px] font-medium text-ink-muted hover:bg-subtle hover:text-accent transition-colors w-full"
        >
          Edit Contact
        </button>
        <button
          onClick={onDelete}
          className="text-left px-4 py-2 text-[13px] font-medium text-ink-muted hover:bg-danger-dim hover:text-danger transition-colors w-full"
        >
          Delete Contact
        </button>
      </div>
    </>
  );
}
