// A message's HTML in a frame that runs nothing and reaches nothing
// (Decisions 2 and 3): no allow-scripts, no allow-same-origin; links open
// in a new tab. Remote images wait for "Show images", per message. The app
// cannot measure the document without same-origin, so the frame fills the
// reading pane and scrolls inside.
// D2: cid: images come from the message's inline parts as data: URLs.

import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { QUIET, TYPE } from '../../components/ui';
import { IMAGES_HIDDEN } from '../../features/mail/mailText';
import type { MailAttachmentMeta } from '../../features/mail/mailboxSlice';
import { resolveInlineImages } from '../../features/mail/mailAttachments';
import { hasRemoteContent, mailSrcDoc } from './mailHtml';

const NO_PARTS: MailAttachmentMeta[] = [];

export function MailHtmlBody({ html, title, attachments = NO_PARTS }: { html: string; title: string; attachments?: MailAttachmentMeta[] }) {
  const [showImages, setShowImages] = useState(false);
  const [inlined, setInlined] = useState<{ from: string; html: string } | null>(null);

  useEffect(() => {
    if (!attachments.some((part) => part.is_inline)) return;
    let live = true;
    void resolveInlineImages(html, attachments).then((out) => {
      if (live && out !== html) setInlined({ from: html, html: out });
    });
    return () => {
      live = false;
    };
  }, [html, attachments]);

  const body = inlined?.from === html ? inlined.html : html;
  const blocked = hasRemoteContent(body) && !showImages;
  return (
    <div className="flex h-full min-h-80 flex-col gap-2">
      {blocked ? (
        <div className="flex flex-wrap items-center gap-2">
          <ImageOff className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <p className={`flex-1 ${TYPE.bodyMuted}`}>{IMAGES_HIDDEN}</p>
          <button type="button" onClick={() => setShowImages(true)} className={QUIET}>
            Show images
          </button>
        </div>
      ) : null}
      <iframe
        title={`Message: ${title}`}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        srcDoc={mailSrcDoc(body, showImages)}
        className="w-full min-h-0 flex-1 rounded-lg border border-line-subtle"
      />
    </div>
  );
}
