import { describe, expect, it } from 'vitest';
import { sentence } from './sentence';

describe('sentence', () => {
  it('adds a full stop to plain text', () => {
    expect(sentence('Done: Call Oracle')).toBe('Done: Call Oracle.');
  });
  it('adds nothing after a question mark, an exclamation mark, a full stop or an ellipsis', () => {
    expect(sentence('Applied: Offer a discount?')).toBe('Applied: Offer a discount?');
    expect(sentence('Approved: Go!')).toBe('Approved: Go!');
    expect(sentence('Answered: Ends here.')).toBe('Answered: Ends here.');
    expect(sentence('Added: Wait…')).toBe('Added: Wait…');
  });
  it('looks past a closing quote or bracket', () => {
    expect(sentence('Done: Ask “why?”')).toBe('Done: Ask “why?”');
    expect(sentence('Done: Ask (why?)')).toBe('Done: Ask (why?)');
    expect(sentence('Done: Ask “why”')).toBe('Done: Ask “why”.');
  });
  it('ignores trailing spaces when it decides', () => {
    expect(sentence('Done: Really? ')).toBe('Done: Really?');
  });
});
