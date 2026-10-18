import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanEditable, escapeHtml, runCommand, safeHref } from './mailEditor';

// Unit tier: what the editor may hand the server (contract §11) and the one
// call into the browser's editing commands (Decision 1).

afterEach(() => {
  Reflect.deleteProperty(document, 'execCommand');
});

describe('cleanEditable', () => {
  it('keeps the editor tags, the signature marker and safe links only', () => {
    const html =
      '<p style="color:red">Hi <span class="x"><strong>Ann</strong></span></p><ul><li>One</li></ul><a href="https://doughco.com" onclick="x()">site</a><a href="javascript:alert(1)">bad</a><div data-revenact-signature class="sig">Dana</div><img src="data:image/png;base64,AA"><script>alert(1)</script>';
    expect(cleanEditable(html)).toBe('<p>Hi <strong>Ann</strong></p><ul><li>One</li></ul><a href="https://doughco.com">site</a><a>bad</a><div data-revenact-signature="">Dana</div>');
  });

  it('turns unknown elements into their text and drops comments', () => {
    expect(cleanEditable('<h1>Title</h1><!-- note --><font>plain</font>')).toBe('Titleplain');
  });

  it('drops svg and math whole, whatever they hold', () => {
    expect(cleanEditable('<p>a<svg><style>x{}</style><a href="https://doughco.com">y</a></svg><math><mi>z</mi></math>b</p>')).toBe('<p>ab</p>');
  });

  it('drops an href a browser would read as a script once tabs and newlines are gone', () => {
    // The browser strips tab and newline from a URL before reading its
    // scheme, so this one runs as javascript: while it parses as https.
    const html = '<a href="java&#9;script:alert(1)%2F%2F@doughco.com">x</a><a href="java&#10;script:alert(1)">y</a>';
    expect(cleanEditable(html)).toBe('<a>x</a><a>y</a>');
  });
});

describe('safeHref', () => {
  it('allows web and email addresses, adding https:// when there is no scheme', () => {
    expect(safeHref('doughco.com/pricing')).toBe('https://doughco.com/pricing');
    expect(safeHref(' https://doughco.com ')).toBe('https://doughco.com/');
    expect(safeHref('mailto:ann@pizzahut.com')).toBe('mailto:ann@pizzahut.com');
  });

  it('refuses anything else', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('localhost')).toBeNull();
    expect(safeHref('')).toBeNull();
    expect(safeHref('java\tscript:alert(1)%2F%2F@doughco.com')).toBeNull();
    expect(safeHref('\u0001javascript:alert(1)')).toBeNull();
  });
});

describe('runCommand and escapeHtml', () => {
  it('calls the browser command, and reports false where there is none', () => {
    expect(runCommand('bold')).toBe(false);
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    expect(runCommand('createLink', 'https://doughco.com/')).toBe(true);
    expect(exec).toHaveBeenCalledWith('createLink', false, 'https://doughco.com/');
  });

  it('escapes text for a link written into the editor', () => {
    expect(escapeHtml('a<b>&"c"')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });
});
