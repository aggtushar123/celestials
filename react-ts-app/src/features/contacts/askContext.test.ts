import { describe, expect, it } from 'vitest';
import { contactsContextOf, contactsIdOf, contactsLabel, contactsPath, whyQuestion, type ContactsNames } from './askContext';

const NAMES: ContactsNames = {
  person: { id: 41, name: 'Lukas Vermeer', place: 'Kraft Heinz › Kraft Heinz EMEA' },
  organisation: { id: 6, name: 'Kraft Heinz' },
  account: { id: 31, name: 'Kraft Heinz EMEA' },
};

describe('contactsIdOf', () => {
  it('reads a plain positive id from /contacts/:id and nothing else', () => {
    expect(contactsIdOf('/contacts/41')).toBe(41);
    for (const path of ['/contacts', '/contacts/', '/contacts/0', '/contacts/041', '/contacts/abc', '/contacts/41/x']) {
      expect(contactsIdOf(path)).toBeNull();
    }
  });
});

describe('contactsContextOf', () => {
  it('is the person view on /contacts/:id, whatever the filters', () => {
    expect(contactsContextOf('/contacts/41', '?sentiment=negative')).toEqual({
      surface: 'contacts',
      view: 'person',
      contact: 41,
      focus: null,
    });
  });

  it("is the list view with only the page's set filters on /contacts", () => {
    expect(contactsContextOf('/contacts', '?q=luk&customer=6&account=31&sentiment=neutral&role=champion')).toEqual({
      surface: 'contacts',
      view: 'list',
      filters: { q: 'luk', customer: '6', account: '31', sentiment: 'neutral', role: 'champion' },
    });
    expect(contactsContextOf('/contacts', '')).toEqual({ surface: 'contacts', view: 'list', filters: {} });
    // An account means nothing without its organisation, as on the page.
    expect(contactsContextOf('/contacts', '?account=31')).toEqual({ surface: 'contacts', view: 'list', filters: {} });
  });

  it('is null on a Contacts path that is neither (a bad id)', () => {
    expect(contactsContextOf('/contacts/abc', '')).toBeNull();
  });
});

describe('contactsLabel', () => {
  it("prefers the server's stored label", () => {
    expect(
      contactsLabel({ surface: 'contacts', view: 'person', contact: 41, focus: null, label: 'Lukas Vermeer · Kraft Heinz' }, NAMES),
    ).toBe('Lukas Vermeer · Kraft Heinz');
  });

  it('names a person from what the page reported, else "This person", and adds the sentiment focus', () => {
    expect(contactsLabel({ surface: 'contacts', view: 'person', contact: 41, focus: null }, NAMES)).toBe(
      'Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA',
    );
    expect(contactsLabel({ surface: 'contacts', view: 'person', contact: 42, focus: null }, NAMES)).toBe('This person');
    expect(contactsLabel({ surface: 'contacts', view: 'person', contact: 41, focus: 'sentiment' }, NAMES)).toBe(
      'Lukas Vermeer · Kraft Heinz › Kraft Heinz EMEA · Sentiment',
    );
  });

  it('names a person with no organisation "No organisation", matching the server', () => {
    const noOrg: ContactsNames = { ...NAMES, person: { id: 41, name: 'Sam Pizza', place: '' } };
    expect(contactsLabel({ surface: 'contacts', view: 'person', contact: 41, focus: null }, noOrg)).toBe('Sam Pizza · No organisation');
  });

  it('names the list and each filter', () => {
    expect(contactsLabel({ surface: 'contacts', view: 'list', filters: {} }, null)).toBe('Contacts');
    expect(
      contactsLabel(
        { surface: 'contacts', view: 'list', filters: { q: 'luk', customer: '6', account: '31', sentiment: 'negative', role: 'decision_maker' } },
        NAMES,
      ),
    ).toBe('Contacts · Kraft Heinz › Kraft Heinz EMEA · Negative · Decision Maker · "luk"');
    expect(contactsLabel({ surface: 'contacts', view: 'list', filters: { customer: '9', account: '5' } }, NAMES)).toBe(
      'Contacts · Organisation › Account',
    );
  });
});

describe('contactsPath', () => {
  it('reopens the person, or the list with its filters in the URL order', () => {
    expect(contactsPath({ surface: 'contacts', view: 'person', contact: 41, label: 'x' })).toBe('/contacts/41');
    expect(contactsPath({ surface: 'contacts', view: 'list', filters: {}, label: 'Contacts' })).toBe('/contacts');
    expect(
      contactsPath({ surface: 'contacts', view: 'list', filters: { role: 'champion', sentiment: 'negative', q: 'a b' }, label: 'x' }),
    ).toBe('/contacts?q=a+b&sentiment=negative&role=champion');
  });
});

describe('whyQuestion', () => {
  it("asks about the first name's sentiment", () => {
    expect(whyQuestion('Lukas Vermeer', 'neutral')).toBe("Why is Lukas's sentiment neutral?");
    expect(whyQuestion('  Mira ', 'positive')).toBe("Why is Mira's sentiment positive?");
  });
});
