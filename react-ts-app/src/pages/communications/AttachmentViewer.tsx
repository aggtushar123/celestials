// An attachment shown in place (contract decision 27, Decision 9): an image
// or a PDF the server marked for preview, from a blob the session fetched.
// A modal dialog: focus starts on Close, Tab stays inside, Escape or the
// backdrop closes it, and focus goes back to the chip that opened it. It is
// portalled to the body: the glass mailbox section would clip a fixed overlay.

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { trapTab } from '../../lib/focusTrap';
import { PDF_UNSHOWN } from '../../features/mail/mailText';
import { BUTTON, ICON_BUTTON, OVERLAY, TYPE } from '../../components/ui';

export function AttachmentViewer({ name, url, type, onDownload, onClose }: { name: string; url: string; type: string; onDownload: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    if (event.key === 'Tab' && ref.current) trapTab(event.nativeEvent, ref.current);
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-scrim p-4" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={name} onKeyDown={onKeyDown} onClick={(event) => event.stopPropagation()} className={`flex max-h-[90dvh] w-full max-w-3xl flex-col ${OVERLAY}`}>
        <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-2">
          <h2 className={`min-w-0 flex-1 truncate ${TYPE.title}`}>{name}</h2>
          <button type="button" onClick={onDownload} className={BUTTON}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Download
          </button>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {type === 'application/pdf' ? (
            <object data={url} type="application/pdf" aria-label={name} className="h-[75dvh] w-full">
              <p className={TYPE.bodyMuted}>{PDF_UNSHOWN}</p>
            </object>
          ) : (
            <img src={url} alt={name} className="mx-auto max-h-[75dvh] w-auto max-w-full object-contain" />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
