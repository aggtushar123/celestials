import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv, toCsv } from './csv';

const { createObjectURL, revokeObjectURL } = URL;

afterEach(() => {
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  vi.restoreAllMocks();
});

describe('toCsv', () => {
  it('quotes every value and doubles the quotes inside one', () => {
    expect(toCsv([['a', 'b,c'], ['say "hi"', 3]])).toBe('"a","b,c"\r\n"say ""hi""","3"');
  });

  it('keeps a line break inside one quoted cell', () => {
    expect(toCsv([['first line\nsecond line', 'next'], ['a\r\nb', 'c']])).toBe('"first line\nsecond line","next"\r\n"a\r\nb","c"');
  });

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });
});

describe('downloadCsv', () => {
  it('saves the text through an object URL it revokes afterwards', async () => {
    const captured: { blob?: Blob } = {};
    URL.createObjectURL = vi.fn((obj: Blob | MediaSource) => {
      captured.blob = obj as Blob;
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.useFakeTimers();

    try {
      downloadCsv('things.csv', '"a","b"');
      // Revoked a tick after the click, so the browser has started the download.
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.runAllTimers();
    } finally {
      vi.useRealTimers();
    }

    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('things.csv');
    expect(await captured.blob!.text()).toBe('"a","b"');
    expect(captured.blob!.type).toBe('text/csv;charset=utf-8');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
