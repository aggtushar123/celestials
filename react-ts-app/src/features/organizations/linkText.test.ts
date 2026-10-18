import { describe, expect, it } from 'vitest';
import { fromSlackText, hiddenText, ticketLineText } from './linkText';

describe('the link lines (frontend Decision 6)', () => {
  it('a ticket line', () => {
    expect(ticketLineText({ id: 1, number: 'KAN-2', status: 'in-progress', assignee: 'Faiz Jamal', url: null })).toBe('KAN-2 · In progress · Faiz Jamal');
    expect(ticketLineText({ id: 1, number: 'KAN-3', status: 'open', assignee: null, url: null })).toBe('KAN-3 · Open · Unassigned');
    expect(ticketLineText({ id: 1, number: 'KAN-4', status: 'weird', assignee: null, url: null })).toBe('KAN-4 · weird · Unassigned');
  });
  it('a from-Slack line', () => {
    expect(fromSlackText({ id: 41, channel: '#all-alfiee', started_by: 'Tushar Aggarwal' })).toBe('From Slack: Tushar Aggarwal in #all-alfiee');
    expect(fromSlackText({ id: 41, channel: '', started_by: 'Tushar Aggarwal' })).toBe('From Slack: Tushar Aggarwal');
  });
  it('what the reader may not see', () => {
    expect(hiddenText(1)).toBe("Linked to 1 item you can't see");
    expect(hiddenText(2)).toBe("Linked to 2 items you can't see");
  });
});
