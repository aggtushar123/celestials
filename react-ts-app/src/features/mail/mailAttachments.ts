// Opening a mail attachment (two-way Gmail D2, contract §6, Decisions 9
// and 10). The API authenticates with a bearer token, so no plain link or
// <img src> can reach a file: it is fetched with the session into a blob.
// Only images and PDFs the server marked for preview are shown, re-typed to
// their own type; anything else is saved.

import { apiFetchBlob } from '../../lib/apiClient';
import type { MailAttachmentMeta } from './mailboxSlice';
import { ATTACHMENT_NO_URL } from './mailText';

/** What the viewer may show (contract decision 27). Never SVG, never HTML. */
export const PREVIEW_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf']);

const INLINE_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/** A larger inline image stays unresolved rather than becoming a huge data: URL. */
export const INLINE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Saves a URL the page already holds (a blob: URL) under a file name. */
export function saveUrl(url: string, name: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  saveUrl(url, name);
  URL.revokeObjectURL(url);
}

/** Fetches the file. A preview comes back as a blob: URL and its type for
 *  the viewer (the caller revokes it); anything else is saved, and null
 *  comes back. A refusal throws the server's ApiError. */
export async function openAttachment(file: Pick<MailAttachmentMeta, 'filename' | 'preview' | 'download_url'>): Promise<{ url: string; type: string } | null> {
  if (!file.download_url) throw new Error(ATTACHMENT_NO_URL);
  const blob = await apiFetchBlob(file.preview ? file.download_url : `${file.download_url}?download=1`);
  const type = blob.type.split(';')[0].trim().toLowerCase();
  if (file.preview && PREVIEW_TYPES.has(type)) return { url: URL.createObjectURL(new Blob([blob], { type })), type };
  saveBlob(blob, file.filename);
  return null;
}

// Each inline part once per tab: every download of a filed message's
// attachment is audited (contract decision 31). The promise is kept while
// the fetch is in flight, so a second resolve (StrictMode, a re-read thread)
// waits for it instead of downloading again; a failure is forgotten.
const inlined = new Map<number, Promise<string>>();

function inlinePart(part: MailAttachmentMeta, downloadUrl: string): Promise<string> {
  let url = inlined.get(part.id);
  if (!url) {
    url = apiFetchBlob(downloadUrl).then((blob) => dataUrlOf(new Blob([blob], { type: part.mime_type })));
    inlined.set(part.id, url);
    url.catch(() => inlined.delete(part.id));
  }
  return url;
}

function dataUrlOf(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const cidOf = (contentId: string) => contentId.trim().replace(/^<|>$/g, '');
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The HTML with every `cid:` image one of its inline parts answers written
 *  as a data: URL, which the frame's CSP allows (Decision 10). Parts that
 *  fail, are too large or are not images are left as they are. */
export async function resolveInlineImages(html: string, attachments: readonly MailAttachmentMeta[]): Promise<string> {
  let out = html;
  for (const part of attachments) {
    const cid = cidOf(part.content_id);
    if (!part.is_inline || !cid || !part.download_url || !INLINE_IMAGE_TYPES.has(part.mime_type) || part.size > INLINE_IMAGE_MAX_BYTES) continue;
    const pattern = new RegExp(`cid:${escapeRegExp(cid)}(?=["'\\s>])`, 'gi');
    if (!pattern.test(out)) continue;
    let url: string;
    try {
      url = await inlinePart(part, part.download_url);
    } catch {
      continue;
    }
    out = out.replace(pattern, url);
  }
  return out;
}

/** Test-only: forget the inline cache between tests. */
export function forgetInlineImages(): void {
  inlined.clear();
}
