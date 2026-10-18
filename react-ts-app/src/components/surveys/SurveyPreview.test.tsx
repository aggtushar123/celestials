import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SurveyPreview } from './SurveyPreview';

describe('SurveyPreview (spec §2.2)', () => {
  it('shows the email: subject, intro, the question with the workspace name, the link and its 14 days', () => {
    render(<SurveyPreview type="nps" subject="A quick question" intro="Two minutes." workspace="Acme Inc" />);
    const email = screen.getByRole('region', { name: 'The email' });
    expect(email).toHaveTextContent('Subject: A quick question');
    expect(email).toHaveTextContent('Two minutes.');
    expect(email).toHaveTextContent('How likely are you to recommend Acme Inc to a friend or colleague?');
    expect(email).toHaveTextContent('Answer here, it takes a few seconds:');
    expect(email).toHaveTextContent('The link works for 14 days and takes one answer.');
  });

  it('shows the form as the customer sees it, its scale a picture rather than a control', () => {
    render(<SurveyPreview type="ces" subject="Hi" intro="" workspace="Acme Inc" />);
    const form = screen.getByRole('region', { name: 'The form' });
    expect(within(form).getByText('How easy is it to get what you need from Acme Inc?')).toBeInTheDocument();
    expect(within(form).getByText('Scores 1 to 7, from Very difficult to Very easy')).toBeInTheDocument();
    expect(within(form).queryByRole('radio')).toBeNull();
    expect(form).toHaveTextContent('Anything to add? (optional)');
  });

  it('says when there is no subject yet, and leaves a blank intro out', () => {
    render(<SurveyPreview type="csat" subject="  " intro="   " workspace="Acme Inc" />);
    const email = screen.getByRole('region', { name: 'The email' });
    expect(email).toHaveTextContent('Subject: No subject yet');
    expect(email.querySelector('[data-part="intro"]')).toBeNull();
  });

  it('shows the intro as plain text, never as markup', () => {
    const { container } = render(<SurveyPreview type="nps" subject="Hi" intro="<b>Hello</b>" workspace="Acme Inc" />);
    expect(screen.getByText('<b>Hello</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });
});
