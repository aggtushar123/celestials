import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { CONTACT_ROLES, SENTIMENTS, withFilter, type ContactsParams } from '../../features/contacts/contactsParams';
import { apiFetch } from '../../lib/apiClient';
import { PRIMARY, SearchInput, Select, Toolbar } from '../ui';

type Option = { id: number; name: string };

type Loaded<T> = { for: string; value: T };

/** The name of an organisation a deep link chose that is not on the first
 *  page of options, read by id (GET /customers/<id>/); null when it cannot
 *  be read, undefined while it is being read or not needed. */
function useOrganisationName(customer: string, needed: boolean): string | null | undefined {
  const [loaded, setLoaded] = useState<Loaded<string | null>>({ for: '', value: null });
  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    apiFetch<Option>(`/customers/${customer}/`)
      .then((row) => {
        if (!cancelled) setLoaded({ for: customer, value: row?.name ?? null });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ for: customer, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [customer, needed]);
  return needed && loaded.for === customer ? loaded.value : undefined;
}

/** The accounts of the chosen organisation, read when it changes (null
 *  until then). A failed read leaves only "All accounts". */
function useAccounts(customer: string): Option[] | null {
  const [loaded, setLoaded] = useState<{ for: string; rows: Option[] }>({ for: '', rows: [] });
  useEffect(() => {
    if (!customer) return;
    let cancelled = false;
    apiFetch<Option[]>(`/customers/${customer}/accounts/`)
      .then((rows) => {
        if (!cancelled) setLoaded({ for: customer, rows: Array.isArray(rows) ? rows : [] });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ for: customer, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [customer]);
  if (!customer) return [];
  return loaded.for === customer ? loaded.rows : null;
}

/** The Contacts page's toolbar (spec 2026-09-28 §3): search with the count, the organisation, account, sentiment and role filters, and
 *  Save as segment and "Add person". Every control writes the URL through `onChange`; the search
 *  waits 300 ms after the last key. */
export function ContactsToolbar({
  params,
  count,
  organisations,
  organisationName,
  onChange,
  onAdd,
  onSaveAsSegment,
}: {
  params: ContactsParams;
  /** "16 people": announced politely as it changes. */
  count: string;
  /** The first page of /customers/ (fetchCustomers). */
  organisations: Option[];
  /** The chosen organisation's name when it is not on that page, from the
   *  list's rows; otherwise the toolbar reads it by id. */
  organisationName: string | null;
  /** `replace` for typing, so every key is not a history entry. */
  onChange: (next: ContactsParams, replace?: boolean) => void;
  onAdd: () => void;
  /** Save as segment (segments spec §3), before Add. */
  onSaveAsSegment?: () => void;
}) {
  const [text, setText] = useState(params.q);
  const [lastQ, setLastQ] = useState(params.q);
  // The URL moved (Clear filters, Back): the box follows it.
  if (params.q !== lastQ) {
    setLastQ(params.q);
    setText(params.q);
  }
  useEffect(() => {
    if (text === params.q) return;
    const timer = setTimeout(() => onChange(withFilter(params, 'q', text), true), 300);
    return () => clearTimeout(timer);
  }, [text, params, onChange]);

  const accountRows = useAccounts(params.customer);
  const accounts = accountRows ?? [];
  const customerId = Number(params.customer);
  const accountId = Number(params.account);
  // A deep link can name an organisation past the first page of options,
  // or one that is gone; its option is named by reading it, never "Organisation 12".
  const orgMissing = !!params.customer && !organisations.some((o) => o.id === customerId);
  const fetchedName = useOrganisationName(params.customer, orgMissing && !organisationName);
  const orgLabel = organisationName ?? fetchedName ?? (fetchedName === null ? 'Organisation not found' : 'Loading…');
  const accountLabel = accountRows === null ? 'Loading…' : 'Account not found';
  const set = <K extends keyof ContactsParams>(key: K, value: ContactsParams[K]) => onChange(withFilter(params, key, value));

  const orgOptions = [
    { value: '', label: 'All organisations' },
    ...organisations.map((o) => ({ value: String(o.id), label: o.name })),
    ...(orgMissing ? [{ value: params.customer, label: orgLabel }] : []),
  ];
  const accountOptions = [
    { value: '', label: 'All accounts' },
    ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
    ...(params.account && !accounts.some((a) => a.id === accountId) ? [{ value: params.account, label: accountLabel }] : []),
  ];
  const sentimentOptions = [{ value: '', label: 'Any sentiment' }, ...SENTIMENTS.map((s) => ({ value: s.value as string, label: s.label }))];
  const roleOptions = [{ value: '', label: 'Any role' }, ...CONTACT_ROLES.map((r) => ({ value: r.value as string, label: r.label }))];

  return (
    <Toolbar
      search={<SearchInput label="Search people" placeholder="Search people" value={text} onChange={setText} />}
      count={count}
      filters={
        <>
          <Select label="Organisation" labelPosition="hidden" value={params.customer} options={orgOptions} onChange={(value) => set('customer', value)} />
          <Select label="Account" labelPosition="hidden" value={params.account} options={accountOptions} disabled={!params.customer} onChange={(value) => set('account', value)} />
          <Select label="Sentiment" labelPosition="hidden" value={params.sentiment as string} options={sentimentOptions} onChange={(value) => set('sentiment', value as ContactsParams['sentiment'])} />
          <Select label="Role" labelPosition="hidden" value={params.role as string} options={roleOptions} onChange={(value) => set('role', value as ContactsParams['role'])} />
        </>
      }
      actions={{
        secondary: onSaveAsSegment ? [{ key: 'segment', label: 'Save as segment', onSelect: onSaveAsSegment }] : [],
        primary: (
          <button type="button" onClick={onAdd} className={PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add person
          </button>
        ),
      }}
    />
  );
}
