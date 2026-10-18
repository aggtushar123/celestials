import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SAY } from '../../features/campaigns/campaignOptions';
import { stubCampaigns } from '../../features/campaigns/testCampaigns';
import { requestsOf } from '../../features/surveys/testSurveys';
import { PreviewPane } from './PreviewPane';
import { useCampaignAudience } from './useCampaignAudience';

function Harness({ campaignId, subject = 'News for {first_name}', body = 'Hello {first_name}, we have news.' }: { campaignId: number | null; subject?: string; body?: string }) {
  const audience = useCampaignAudience(campaignId, 0);
  const [contact, setContact] = useState<number | null>(null);
  return <PreviewPane campaignId={campaignId} subject={subject} body={body} audience={audience} contact={contact} onContact={setContact} stale={false} sender="Alice" workspace="Acme Inc" />;
}
const pane = () => screen.getByRole('region', { name: 'Preview' });

describe('the preview pane (spec §2.2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws an unsaved campaign as typed, with the footer, and asks for a save to see it for someone', () => {
    const { spy } = stubCampaigns();
    render(<Harness campaignId={null} />);
    expect(pane()).toHaveTextContent('Save the draft to see it for a real person.');
    expect(pane().querySelector('[data-part="subject"]')).toHaveTextContent('News for {first_name}');
    expect(pane().querySelector('[data-part="footer"]')).toHaveTextContent('Alice, Acme Inc');
    expect(pane().querySelector('[data-part="footer"]')).toHaveTextContent('Unsubscribe from these emails: link');
    expect(requestsOf(spy, 'POST', /preview\/$/)).toHaveLength(0);
  });

  it('renders it for the first person in the audience, then for whoever is picked', async () => {
    const { spy } = stubCampaigns();
    render(<Harness campaignId={12} />);
    const picker = await within(pane()).findByRole('combobox', { name: 'Preview for' });
    expect([...picker.querySelectorAll('option')].map((option) => option.textContent)).toEqual(['Rosa Diaz', 'Tom Hale']);
    await waitFor(() => expect(pane().querySelector('[data-part="subject"]')).toHaveTextContent('News for Rosa'));
    expect(pane().querySelector('[data-part="body"]')).toHaveTextContent('Hello Rosa, we have news.');
    expect(pane().querySelector('[data-part="body"]')).toHaveTextContent('Unsubscribe from these emails:');
    await userEvent.selectOptions(picker, '62');
    await waitFor(() => expect(pane().querySelector('[data-part="subject"]')).toHaveTextContent('News for Tom'));
    expect(requestsOf(spy, 'POST', /^\/campaigns\/12\/preview\/$/).at(-1)?.body).toEqual({ contact: 62, subject: 'News for {first_name}', body: 'Hello {first_name}, we have news.' });
  });

  it('asks once, 400 ms after the last change, and shows only the latest answer', async () => {
    const { spy } = stubCampaigns();
    const view = render(<Harness campaignId={12} subject="A" />);
    await within(pane()).findByRole('combobox', { name: 'Preview for' });
    view.rerender(<Harness campaignId={12} subject="AB" />);
    view.rerender(<Harness campaignId={12} subject="ABC" />);
    await waitFor(() => expect(pane().querySelector('[data-part="subject"]')).toHaveTextContent('ABC'));
    expect(requestsOf(spy, 'POST', /^\/campaigns\/12\/preview\/$/).map((request) => (request.body as { subject: string }).subject)).toEqual(['ABC']);
  });

  it("shows the server's refusal in the pane, politely, and does not announce it again on every keystroke", async () => {
    const { spy } = stubCampaigns({ preview: () => ({ status: 400, body: { body: [SAY.MERGE] } }) });
    const view = render(<Harness campaignId={12} body="Hi {nick}" />);
    const region = await waitFor(() => {
      const found = within(pane()).getByRole('status');
      expect(found).toHaveTextContent(SAY.MERGE);
      return found;
    });
    expect(within(pane()).queryByRole('alert')).toBeNull();
    view.rerender(<Harness campaignId={12} body="Hi {nick}!" />);
    // While the next answer loads, and after it lands, the same region keeps the same words.
    expect(within(pane()).getByRole('status')).toBe(region);
    expect(region).toHaveTextContent(SAY.MERGE);
    await waitFor(() => expect(requestsOf(spy, 'POST', /^\/campaigns\/12\/preview\/$/)).toHaveLength(2));
    await waitFor(() => expect(within(pane()).getByRole('status')).toBe(region));
    expect(region).toHaveTextContent(SAY.MERGE);
  });

  it('says when nobody in the segment can be emailed', async () => {
    stubCampaigns({ people: { 9: [] } });
    render(<Harness campaignId={12} />);
    expect(await within(pane()).findByText('Nobody in this segment can be emailed right now, so there is nobody to preview it for.')).toBeInTheDocument();
  });
});
