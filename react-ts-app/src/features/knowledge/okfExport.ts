import { apiFetchBlob } from '../../lib/apiClient';
import { saveUrl } from '../mail/mailAttachments';

/** The workspace's knowledge as an Open Knowledge Format v0.2 bundle
 *  (revenact-backend GET /api/v1/knowledge/okf/): metrics with their attested
 *  computations, customers and what people know about them, zipped. Only for
 *  someone who may see every account; the server refuses anyone else. */
export const OKF_FILENAME = 'revenact-knowledge-okf.zip';

export async function downloadOkfBundle(): Promise<void> {
  const blob = await apiFetchBlob('/knowledge/okf/');
  const url = URL.createObjectURL(blob);
  try {
    saveUrl(url, OKF_FILENAME);
  } finally {
    URL.revokeObjectURL(url);
  }
}
