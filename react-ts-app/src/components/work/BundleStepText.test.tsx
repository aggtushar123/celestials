import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BundleStepText } from './BundleStepText';
import { B_BLOCKED, B_COMMENT, B_OUTSIDE } from '../../features/agents/testBundleFixtures';

describe('BundleStepText (round 2 D2 Decision 6)', () => {
  it('shows a Slack message read only', () => {
    render(<BundleStepText step={B_BLOCKED.steps[0]} />);
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('We are looking into it.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows a Jira comment read only', () => {
    render(<BundleStepText step={B_COMMENT.steps[0]} />);
    expect(screen.getByText('Comment')).toBeInTheDocument();
    expect(screen.getByText('Customer confirms it fails on Chrome too.')).toBeInTheDocument();
  });

  it('shows an email reply with its recipient, subject and body', () => {
    render(<BundleStepText step={B_OUTSIDE.steps[0]} />);
    expect(screen.getByText('To')).toBeInTheDocument();
    expect(screen.getByText('ann@pizzahut.com')).toBeInTheDocument();
    expect(screen.getByText('Re: Login loop')).toBeInTheDocument();
    expect(screen.getByText('Reply')).toBeInTheDocument();
    expect(screen.getByText("We're on it: the fix ships Friday.")).toBeInTheDocument();
  });
});
