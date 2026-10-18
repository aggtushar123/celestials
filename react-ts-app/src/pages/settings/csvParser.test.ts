import { describe, it, expect } from 'vitest';
import { parseCsv } from './csvParser';

describe('parseCsv', () => {
  it('parses a simple header + rows', () => {
    expect(parseCsv('name,domain\nAcme,acme.com\nInitech,initech.com')).toEqual([
      ['name', 'domain'],
      ['Acme', 'acme.com'],
      ['Initech', 'initech.com'],
    ]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('name,address\n"Acme, Inc","123 Main St, Suite 4"')).toEqual([
      ['name', 'address'],
      ['Acme, Inc', '123 Main St, Suite 4'],
    ]);
  });

  it('handles an escaped quote ("") inside a quoted field', () => {
    expect(parseCsv('name\n"Say ""hi"""')).toEqual([['name'], ['Say "hi"']]);
  });

  it('handles a quoted field containing a newline', () => {
    expect(parseCsv('name,notes\nAcme,"Line one\nLine two"')).toEqual([
      ['name', 'notes'],
      ['Acme', 'Line one\nLine two'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('name,domain\r\nAcme,acme.com\r\n')).toEqual([
      ['name', 'domain'],
      ['Acme', 'acme.com'],
    ]);
  });

  it('strips a leading UTF-8 BOM', () => {
    expect(parseCsv('﻿name\nAcme')).toEqual([['name'], ['Acme']]);
  });

  it('does not emit a ghost row for a trailing newline', () => {
    expect(parseCsv('name\nAcme\n')).toEqual([['name'], ['Acme']]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseCsv('')).toEqual([]);
  });
});
