import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MailAttachments } from './MailAttachments';
import { MAIL_DETAIL, stubMail } from '../../features/mail/testMail';
import { ATTACHMENT_UNAVAILABLE } from '../../features/mail/mailText';

// The chips with the network stubbed (D2 contract §6, Decision 9).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const [PDF, , ZIP] = MAIL_DETAIL.attachments;

describe('MailAttachments', () => {
  it('lists the files but not the inline parts, each a button with its type and size', () => {
    render(<MailAttachments attachments={MAIL_DETAIL.attachments} />);
    const list = screen.getByRole('list', { name: 'Attachments' });
    expect(within(list).getByRole('button', { name: /Renewal quote\.pdf/ })).toHaveTextContent('PDF · 178 KB');
    expect(within(list).getByRole('button', { name: /Pricing\.zip/ })).toBeInTheDocument();
    expect(within(list).queryByText('logo.png')).toBeNull();
  });

  it('opens a PDF in the viewer, downloads from it, and closes back to its chip', async () => {
    stubMail();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<MailAttachments attachments={[PDF]} />);
    const chip = screen.getByRole('button', { name: /Renewal quote\.pdf/ });
    await userEvent.click(chip);
    const viewer = await screen.findByRole('dialog', { name: 'Renewal quote.pdf' });
    expect(viewer.querySelector('object')).toHaveAttribute('data', 'blob:preview');
    expect(within(viewer).getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.click(within(viewer).getByRole('button', { name: 'Download' }));
    expect(click).toHaveBeenCalledOnce();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:preview');
    expect(chip).toHaveFocus();
  });

  it("says why a file won't open, in the server's words", async () => {
    const { state } = stubMail();
    state.attachmentRefusals[33] = { status: 413, body: { code: 'ATTACHMENT_TOO_LARGE', detail: 'This file is too large to open here. Open it in Gmail.' } };
    render(<MailAttachments attachments={[ZIP]} />);
    await userEvent.click(screen.getByRole('button', { name: /Pricing\.zip/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This file is too large to open here. Open it in Gmail.');
  });

  it('shows a file it cannot fetch as a plain chip with the reason', () => {
    render(<MailAttachments attachments={[{ ...PDF, available: false, download_url: null }]} />);
    expect(screen.queryByRole('button', { name: /Renewal quote\.pdf/ })).toBeNull();
    expect(screen.getByTitle(ATTACHMENT_UNAVAILABLE)).toHaveTextContent('Renewal quote.pdf');
  });
});
