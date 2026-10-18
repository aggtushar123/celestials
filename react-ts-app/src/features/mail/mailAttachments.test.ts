import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetInlineImages, openAttachment, resolveInlineImages } from './mailAttachments';
import authReducer, { loggedOut } from '../auth/authSlice';
import { MAIL_DETAIL, stubMail } from './testMail';
import { calls } from '../agents/testAgents';

// Unit tier with the network stubbed: opening a mail attachment and
// inlining cid: images (D2 contract §6, Decisions 9 and 10).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  forgetInlineImages();
});

const [PDF, LOGO] = MAIL_DETAIL.attachments;

describe('openAttachment', () => {
  it('previews a PDF from a blob fetched with the session, typed as a PDF', async () => {
    const { spy } = stubMail();
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    expect(await openAttachment(PDF)).toEqual({ url: 'blob:preview', type: 'application/pdf' });
    expect(calls(spy, 'GET', '/mail/attachments/')).toEqual(['/mail/attachments/31/download/']);
    expect((created.mock.calls[0][0] as Blob).type).toBe('application/pdf');
  });

  it('saves anything else, asking for the download disposition', async () => {
    const { spy } = stubMail();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await openAttachment({ ...PDF, preview: false, filename: 'Renewal quote.pdf' })).toBeNull();
    expect(calls(spy, 'GET', '/mail/attachments/')).toEqual(['/mail/attachments/31/download/?download=1']);
    expect(click).toHaveBeenCalledOnce();
  });

  it('never previews a type outside the list, whatever the attachment says', async () => {
    const { state } = stubMail();
    state.messages[0].attachments[0] = { ...PDF, mime_type: 'image/svg+xml' };
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await openAttachment(PDF)).toBeNull();
  });

  it("refuses in the server's words", async () => {
    const { state } = stubMail();
    state.attachmentRefusals[31] = { status: 413, body: { code: 'ATTACHMENT_TOO_LARGE', detail: 'This file is too large to open here. Open it in Gmail.' } };
    await expect(openAttachment(PDF)).rejects.toThrow('This file is too large to open here. Open it in Gmail.');
  });
});

describe('resolveInlineImages', () => {
  it('writes a cid: image as a data: URL, fetching each part once', async () => {
    const { spy } = stubMail();
    const html = '<p>Hi</p><img src="cid:logo@pizzahut" alt="Logo">';
    expect(await resolveInlineImages(html, [LOGO])).toMatch(/<img src="data:image\/png;base64,[^"]+" alt="Logo">/);
    await resolveInlineImages(html, [LOGO]);
    expect(calls(spy, 'GET', '/mail/attachments/32/')).toHaveLength(1);
  });

  it('fetches a part once when two resolves run at the same time (Decision 10)', async () => {
    const { spy } = stubMail();
    const html = '<img src="cid:logo@pizzahut" alt="Logo">';
    const [first, second] = await Promise.all([resolveInlineImages(html, [LOGO]), resolveInlineImages(html, [LOGO])]);
    expect(first).toContain('data:image/png;base64,');
    expect(second).toBe(first);
    expect(calls(spy, 'GET', '/mail/attachments/32/')).toHaveLength(1);
  });

  it('fetches a part again after a failed fetch', async () => {
    const { spy, state } = stubMail();
    const html = '<img src="cid:logo@pizzahut" alt="Logo">';
    state.attachmentRefusals[32] = { status: 503, body: { code: 'GMAIL_BUSY', detail: 'Gmail is busy.' } };
    expect(await resolveInlineImages(html, [LOGO])).toBe(html);
    delete state.attachmentRefusals[32];
    expect(await resolveInlineImages(html, [LOGO])).toContain('data:image/png;base64,');
    expect(calls(spy, 'GET', '/mail/attachments/32/')).toHaveLength(2);
  });

  it('leaves the HTML alone for parts it does not use, for non-images and for large parts', async () => {
    const { spy } = stubMail();
    const html = '<img src="cid:logo@pizzahut">';
    expect(await resolveInlineImages('<p>No images</p>', [LOGO])).toBe('<p>No images</p>');
    expect(await resolveInlineImages(html, [{ ...LOGO, mime_type: 'image/svg+xml' }])).toBe(html);
    expect(await resolveInlineImages(html, [{ ...LOGO, size: 6 * 1024 * 1024 }])).toBe(html);
    expect(calls(spy, 'GET', '/mail/attachments/')).toEqual([]);
  });
});

describe('sign-out', () => {
  it('forgets inlined images, so the next person fetches their own', async () => {
    const { spy } = stubMail();
    const html = '<img src="cid:logo@pizzahut" alt="Logo">';
    await resolveInlineImages(html, [LOGO]);
    authReducer(undefined, loggedOut());
    await resolveInlineImages(html, [LOGO]);
    expect(calls(spy, 'GET', '/mail/attachments/32/')).toHaveLength(2);
  });
});
