import { describe, expect, it } from 'vitest';
import { SIGNATURE, gmailSignatureText } from './signature';

describe('signature words (round 2 D1 Decisions 4 to 6)', () => {
  it('says what the signature does and where Gmail\'s comes from', () => {
    expect(SIGNATURE.HINT).toBe('Added under every email you send from Revenact. Up to 10 lines.');
    expect(SIGNATURE.GMAIL_HINT).toBe('Change it in Gmail.');
    expect(SIGNATURE.EDITOR_HINT).toBe('Your Gmail signature goes out as it is in Gmail.');
    expect(gmailSignatureText('')).toBe('None in Gmail');
    expect(gmailSignatureText('Dana Ruiz\nDough Co')).toBe('Dana Ruiz\nDough Co');
  });
});
