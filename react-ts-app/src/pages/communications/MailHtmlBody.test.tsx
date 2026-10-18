import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MailHtmlBody } from './MailHtmlBody';
import { CSP_BLOCKED, CSP_IMAGES } from './mailHtml';
import { MAIL_DETAIL, stubMail } from '../../features/mail/testMail';
import { forgetInlineImages } from '../../features/mail/mailAttachments';
import { IMAGES_HIDDEN } from '../../features/mail/mailText';

describe('MailHtmlBody (Decisions 2 and 3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    forgetInlineImages();
  });

  it('writes cid: images as data: URLs inside the frame (Decision 10)', async () => {
    stubMail();
    render(<MailHtmlBody html={'<p>Hi</p><img src="cid:logo@pizzahut" alt="Logo">'} title="Logo mail" attachments={MAIL_DETAIL.attachments} />);
    await waitFor(() => expect(screen.getByTitle('Message: Logo mail').getAttribute('srcdoc')).toContain('data:image/png;base64,'));
    expect(screen.getByTitle('Message: Logo mail').getAttribute('srcdoc')).not.toContain('cid:logo@pizzahut');
  });

  it('renders the mail in a frame that can run nothing and reach nothing', () => {
    render(<MailHtmlBody html={MAIL_DETAIL.html_body} title="Renewal quote" />);
    const frame = screen.getByTitle('Message: Renewal quote');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).toBe('allow-popups allow-popups-to-escape-sandbox');
    expect(frame.getAttribute('sandbox')).not.toMatch(/allow-scripts|allow-same-origin/);
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(frame.getAttribute('srcdoc')).toContain(CSP_BLOCKED);
  });

  it('lets remote images in after Show images, and says nothing more', async () => {
    render(<MailHtmlBody html={MAIL_DETAIL.html_body} title="Renewal quote" />);
    expect(screen.getByText(IMAGES_HIDDEN)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show images' }));
    expect(screen.getByTitle('Message: Renewal quote').getAttribute('srcdoc')).toContain(CSP_IMAGES);
    expect(screen.queryByRole('button', { name: 'Show images' })).toBeNull();
  });

  it('offers no Show images when the mail has none', () => {
    render(<MailHtmlBody html="<p>Plain words</p>" title="Note" />);
    expect(screen.getByTitle('Message: Note').tagName).toBe('IFRAME');
    expect(screen.queryByRole('button', { name: 'Show images' })).toBeNull();
    expect(screen.queryByText(IMAGES_HIDDEN)).toBeNull();
  });
});
