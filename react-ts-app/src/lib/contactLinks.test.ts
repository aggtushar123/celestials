import { describe, expect, it } from 'vitest';
import { mailtoHref, telHref } from './contactLinks';

describe('contact links', () => {
  it('encodes only the part before the @, and refuses an address that could carry its own query', () => {
    expect(mailtoHref('dana@emea.northwind.example')).toBe('mailto:dana@emea.northwind.example');
    expect(mailtoHref('a b@x.example')).toBe('mailto:a%20b@x.example');
    expect(mailtoHref('a?cc=b@x.example')).toBeNull();
    expect(mailtoHref('')).toBeNull();
  });

  it('keeps only digits and the plus in a tel: link', () => {
    expect(telHref('+44 20 7946 0000')).toBe('tel:+442079460000');
    expect(telHref('n/a')).toBeNull();
  });
});
