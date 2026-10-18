import { describe, expect, it } from 'vitest';
import { CSP_BLOCKED, CSP_IMAGES, hasRemoteContent, mailSrcDoc } from './mailHtml';

describe('mailHtml (Decision 2, contract §6)', () => {
  it('blocks every fetch until Show images, then lets https images in and nothing else', () => {
    expect(CSP_BLOCKED).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src cid: data:; font-src data:");
    expect(CSP_IMAGES).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src https: cid: data:; font-src data:");
    expect(CSP_BLOCKED).not.toMatch(/script-src|connect-src|frame-src/);
  });

  it('puts the policy first in the head and the mail in the body', () => {
    const doc = mailSrcDoc('<p>Hi</p>', false);
    expect(doc.indexOf(`content="${CSP_BLOCKED}"`)).toBeGreaterThan(-1);
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<body>'));
    expect(doc).toContain('<base target="_blank">');
    expect(doc).toContain('<body><p>Hi</p></body>');
    expect(mailSrcDoc('<p>Hi</p>', true)).toContain(`content="${CSP_IMAGES}"`);
  });

  it('keeps its own policy first when the mail tries to inject one', () => {
    const doc = mailSrcDoc('</head><meta http-equiv="Content-Security-Policy" content="img-src *"><base href="https://evil/">', false);
    const first = doc.indexOf('Content-Security-Policy');
    expect(doc.slice(first, first + 120)).toContain(CSP_BLOCKED);
    expect(first).toBeLessThan(doc.indexOf('<body>'));
    expect(doc.indexOf('img-src *')).toBeGreaterThan(doc.indexOf('<body>'));
    expect(doc.indexOf('https://evil/')).toBeGreaterThan(doc.indexOf('<body>'));
  });

  it('finds protocol-relative images and nh3-escaped quoted url()', () => {
    expect(hasRemoteContent('<img src="//cdn.x.com/a.png">')).toBe(true);
    expect(hasRemoteContent('<div style="background:url(&quot;https://cdn.x.com/c.png&quot;)">')).toBe(true);
    expect(hasRemoteContent('<div style="background:url(&#39;https://cdn.x.com/c.png&#39;)">')).toBe(true);
    expect(hasRemoteContent('<div style="background:url(&quot;http://cdn.x.com/c.png&quot;)">')).toBe(false);
  });

  it('finds remote https images in img, background and CSS url()', () => {
    expect(hasRemoteContent('<img src="https://cdn.x.com/a.png">')).toBe(true);
    expect(hasRemoteContent('<td background="https://cdn.x.com/b.png">')).toBe(true);
    expect(hasRemoteContent('<div style="background:url(\'https://cdn.x.com/c.png\')">')).toBe(true);
    expect(hasRemoteContent('<img src="cid:logo@x">')).toBe(false);
    expect(hasRemoteContent('<img src="http://cdn.x.com/a.png">')).toBe(false);
    expect(hasRemoteContent('<p>No images</p>')).toBe(false);
  });
});
