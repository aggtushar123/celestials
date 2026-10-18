// The sandboxed reader's document (contract §6, Decision 2). The server has
// already sanitised the HTML with nh3 at store; this decides only what the
// browser may fetch for it. A CSP <meta> covers every way HTML fetches
// (img, srcset, background=, style url(), @import, fonts), which a src
// rewrite would miss. "Show images" swaps the policy; nothing else changes.

/** Until Show images: inline styles only, no network at all. */
export const CSP_BLOCKED = "default-src 'none'; style-src 'unsafe-inline'; img-src cid: data:; font-src data:";

/** After Show images: https images too; still no scripts, frames, fonts or connections. */
export const CSP_IMAGES = "default-src 'none'; style-src 'unsafe-inline'; img-src https: cid: data:; font-src data:";

// "//cdn" resolves to https in the frame; nh3 re-serialises quoted url() in
// style attributes as url(&quot;https:...) or url(&#39;https:...).
const REMOTE =
  /<img\b[^>]*\bsrc\s*=\s*["']?\s*(?:https:|\/\/)|\bbackground\s*=\s*["']?\s*https:|url\(\s*(?:["']|&quot;|&#0*39;|&apos;)?\s*https:/i;

/** Whether the mail asks for an https image, so "Show images" means something. */
export function hasRemoteContent(html: string): boolean {
  return REMOTE.test(html);
}

/** The frame's whole document. Painted on the system Canvas colours with a
 *  light colour scheme, so mail written for a white page reads in dark mode. */
export function mailSrcDoc(html: string, showImages: boolean): string {
  const csp = showImages ? CSP_IMAGES : CSP_BLOCKED;
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<meta name="referrer" content="no-referrer">',
    '<meta name="color-scheme" content="light">',
    '<base target="_blank">',
    '<style>:root{color-scheme:light}body{margin:0;padding:12px;background:Canvas;color:CanvasText;font:13px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}</style>',
    `</head><body>${html}</body></html>`,
  ].join('');
}
