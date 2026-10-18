import { useState } from 'react';
import { Download } from 'lucide-react';
import { BUTTON, useToast } from '../ui';
import { useCapability } from '../../hooks';
import { downloadOkfBundle } from '../../features/knowledge/okfExport';
import { OKF_SAY } from '../../features/knowledge/okfText';


/** Downloads the workspace's OKF bundle. Shown only to someone who may see
 *  every account, the same rule the server enforces. */
export function OkfExportButton() {
  const canExport = useCapability('view_all_accounts');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!canExport) return null;

  const run = async () => {
    setBusy(true);
    try {
      await downloadOkfBundle();
      toast({ message: OKF_SAY.DONE });
    } catch {
      toast({ message: OKF_SAY.FAILED });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={BUTTON} onClick={run} disabled={busy} aria-busy={busy} title={OKF_SAY.HINT}>
      <Download size={16} aria-hidden="true" />
      {busy ? OKF_SAY.BUSY : OKF_SAY.LABEL}
    </button>
  );
}
