// The compose editor's plumbing (two-way Gmail D3, Decision 1): the
// browser's editing commands, called from one place, and what the editor
// may hand the server (contract §11: p, br, strong/b, em/i, ul, ol, li,
// a[href], blockquote; plus the signature block the server placed). The
// server sanitises again (nh3); this keeps the editor honest. No React here.

export type EditCommand = 'bold' | 'italic' | 'insertUnorderedList' | 'insertOrderedList' | 'createLink' | 'insertText' | 'insertHTML';

/** One editing command on the current selection. `document.execCommand` is
 *  deprecated but unremoved, and the only way to edit rich text without a
 *  library; this is the one caller, so replacing it touches one function. */
export function runCommand(command: EditCommand, value?: string): boolean {
  const exec = (document as Partial<Pick<Document, 'execCommand'>>).execCommand;
  return typeof exec === 'function' ? exec.call(document, command, false, value) : false;
}

const KEEP = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'DIV']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IMG', 'PICTURE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'VIDEO', 'AUDIO', 'TEMPLATE', 'TITLE', 'META', 'LINK']);
const XHTML = 'http://www.w3.org/1999/xhtml';

/** A web (http, https) or email (mailto) address, with https:// added when
 *  no scheme was typed; null for anything else. A control character inside
 *  (tab and newline included) refuses it: the browser drops tab and newline
 *  before it reads the scheme, so `java<tab>script:` would run as a script
 *  while it parses here as an https address with a user name. */
export function safeHref(raw: string): string | null {
  const text = raw.trim();
  // eslint-disable-next-line no-control-regex -- control characters are what this refuses
  if (!text || /[\u0000-\u001f\u007f]/.test(text)) return null;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(text)) return text;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clean(parent: ParentNode) {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const element = node as Element;
    // svg and math go whole: their tag names are lower case and their
    // children (style, a) are not the HTML ones the lists below mean.
    if (element.namespaceURI !== XHTML || DROP.has(element.tagName.toUpperCase())) {
      element.remove();
      continue;
    }
    clean(element);
    if (!KEEP.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    for (const attr of [...element.attributes]) {
      const keep = (element.tagName === 'A' && attr.name === 'href' && safeHref(attr.value) !== null) || (element.tagName === 'DIV' && attr.name === 'data-revenact-signature');
      if (!keep) element.removeAttribute(attr.name);
    }
  }
}

/** The editor's HTML reduced to the tags it makes: unknown elements give up
 *  their children, media and scripts go, and only a safe `href` and the
 *  signature marker survive as attributes. */
export function cleanEditable(html: string): string {
  const box = document.createElement('template');
  box.innerHTML = html;
  clean(box.content);
  const out = document.createElement('div');
  out.append(box.content.cloneNode(true));
  return out.innerHTML;
}
