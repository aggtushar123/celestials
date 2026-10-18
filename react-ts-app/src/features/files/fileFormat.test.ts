import { describe, expect, it } from 'vitest';
import { canDeleteFile, formatSize } from './fileFormat';

describe('file formatting', () => {
  it('never offers delete on a filed email attachment, not even to an admin (D2 contract §6)', () => {
    expect(canDeleteFile({ uploaded_by: null, source: 'email' }, 1, true)).toBe(false);
  });

  it('sizes in B, KB and MB', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(245760)).toBe('240 KB');
    expect(formatSize(3145728)).toBe('3.0 MB');
  });

  it('lets the uploader or an admin delete, nobody else', () => {
    const file = { uploaded_by: { id: 2, name: 'Carl CSM' } };
    expect(canDeleteFile(file, 2, false)).toBe(true);
    expect(canDeleteFile(file, 1, true)).toBe(true);
    expect(canDeleteFile(file, 1, false)).toBe(false);
    expect(canDeleteFile({ uploaded_by: null }, null, false)).toBe(false);
  });
});
