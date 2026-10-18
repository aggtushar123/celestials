import { useMemo, useState } from 'react';
import { Layout, Sparkles, CheckCircle, MessageSquare, Search, Plus, Filter, Download, Mail, Phone, MoreHorizontal } from 'lucide-react';
import { useAppDispatch } from '../../hooks';
import {
  fetchContactsForCustomer,
  fetchContactsForAccount,
  deleteContact,
} from '../../features/customers/customersSlice';
import { initials, capitalize, formatRelativeTime } from '../../features/customers/formatters';
import type { Contact } from '../../features/customers/customersSlice';
import { ContactFormModal } from '../contacts/ContactFormModal';
import { ContactRowActionsPopover } from '../contacts/ContactRowActionsPopover';
import { ConfirmDialog } from '../organizations/ConfirmDialog';

export interface ContactsTabProps {
  contacts: Contact[];
  isLoading: boolean;
  error: string | null;
  /** The parent Customer id — used for "Add Contact" (POST
   * .../contacts/, or .../accounts/<accountId>/contacts/ when
   * `accountId` is set below) and to refetch this list afterward. For
   * the Organization Details page's own Contacts tab it's that
   * organization's own id; for the standalone Account page's, it's the
   * account's *parent* customer (an Account only carries a `customer`
   * id, same reasoning as mapToAccountRow.ts's own `orgId` param).
   * Undefined only for the Account page's own mock-data fallback (a
   * direct URL visit/refresh with no real id to act against — same
   * convention as ActivityFeed's own `customerId` prop) — "Add
   * Contact" is disabled then rather than posting against a made-up
   * id that might collide with an unrelated real Customer. */
  customerId?: number;
  /** Set only when mounted on the standalone Account page — "Add
   * Contact" then creates an account-level Contact scoped to this
   * specific account instead of an organization-level one. Omitted on
   * the Organization Details page's own Contacts tab. */
  accountId?: number;
  /** Inside a page that already sets the column (the organization page):
   *  no scroll area, side padding or max width of its own, so the stats
   *  strip and the table span the page's edges. Off by default, so every
   *  other route renders as before. */
  embedded?: boolean;
}

// Shared between the Organization Details page's own Contacts tab and
// the standalone Account page's Contacts tab — same card/table shape
// either way (only the fetch that populates `contacts` differs: every
// organization-level Contact for one Customer vs. every account-level
// Contact for one Account — see fetchContactsForCustomer/
// fetchContactsForAccount in customersSlice.ts), so this one component
// renders both rather than each page keeping its own copy.
export function ContactsTab({ contacts, isLoading, error, customerId, accountId, embedded = false }: ContactsTabProps) {
  const dispatch = useAppDispatch();
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [activeRowPopup, setActiveRowPopup] = useState<{ contact: Contact; style: React.CSSProperties } | null>(null);

  // Client-side filter, not a server round-trip — this list is already
  // fully loaded (the nested Customer/Account-scoped endpoints turn
  // pagination off, see CustomerContactListView's own docstring),
  // unlike the Contacts page's (/contacts) server-side `?search=`.
  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.role_display.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  const stats = {
    total: contacts.length,
    decisionMakers: contacts.filter(c =>
      c.role === 'executive_sponsor' || c.role === 'decision_maker' || c.role === 'economic_buyer'
    ).length,
    active: contacts.filter(c => c.status === 'active').length,
    positiveSentiment: contacts.filter(c => c.sentiment === 'positive').length,
  };

  // Add is the one mutation that needs an explicit refetch — Edit/
  // Delete already patch `contacts` directly via updateContact/
  // deleteContact's own extraReducers (same "caller refetches only for
  // create" reasoning as the Contacts page's (/contacts) own
  // ContactFormModal usage).
  const refetch = () => {
    if (customerId === undefined) return;
    if (accountId !== undefined) {
      dispatch(fetchContactsForAccount({ customerId, accountId }));
    } else {
      dispatch(fetchContactsForCustomer(customerId));
    }
  };

  const handleRowActionClick = (e: React.MouseEvent, contact: Contact) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const yOffset = rect.bottom > window.innerHeight - 150 ? rect.top - 100 : rect.bottom + 4;
    setActiveRowPopup({ contact, style: { top: yOffset, right: window.innerWidth - rect.right } });
  };

  // Only the Organization Details page's own Contacts tab (accountId
  // undefined) rolls up more than one scope — its own organisation-
  // level contacts *and* every account's individual ones (see
  // CustomerContactListView's own docstring on the backend) — so only
  // it needs a column to tell them apart. The standalone Account
  // page's Contacts tab is always exactly one account's own, nothing
  // to distinguish.
  const showAccountColumn = accountId === undefined;
  const columnCount = showAccountColumn ? 8 : 7;

  const widthClass = embedded ? 'w-full' : 'max-w-7xl w-full mx-auto';

  return (
    <div className={embedded ? 'flex flex-col gap-6' : 'flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar p-6 pt-2'}>
      {/* Contacts Summary Banner */}
      <div className={`${widthClass} grid grid-cols-1 md:grid-cols-4 gap-4 bg-surface p-4 rounded-2xl border border-line-subtle shadow-sm shrink-0`}>
        <ContactStatCard title="Total Contacts" value={stats.total.toString()} subtext="Across all departments" icon={<Layout className="w-4 h-4 text-accent" />} />
        <ContactStatCard title="Decision Makers" value={stats.decisionMakers.toString()} subtext="High influence" icon={<Sparkles className="w-4 h-4 text-accent" />} />
        <ContactStatCard title="Active Users" value={stats.active.toString()} subtext="Logged in last 30d" icon={<CheckCircle className="w-4 h-4 text-success" />} />
        <ContactStatCard title="Avg Sentiment" value={`${stats.total > 0 ? Math.round((stats.positiveSentiment / stats.total) * 100) : 0}%`} subtext="Positive feedback" icon={<MessageSquare className="w-4 h-4 text-info" />} />
      </div>

      {/* Action Bar & Table */}
      <div className={`${widthClass} bg-surface rounded-2xl border border-line-subtle shadow-sm flex flex-col overflow-hidden`}>
        <div className="p-4 border-b border-line-subtle bg-surface flex items-center justify-between gap-4">
           <div className="relative flex-1 max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts by name, role or email..."
                className="w-full pl-10 pr-4 py-2 bg-subtle/30 border border-line rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-accent/10 placeholder:text-ink-faint"
              />
           </div>
           <div className="flex items-center gap-3">
              <button
                onClick={() => setIsAddingContact(true)}
                disabled={customerId === undefined}
                title={customerId === undefined ? 'Reload this page from a real Accounts tab link to add a contact.' : undefined}
                className="flex items-center gap-2 px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-[13px] font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
              >
                 <Plus className="w-4 h-4" />
                 Add Contact
              </button>
              <button className="p-2 border border-line rounded-lg text-ink-faint hover:bg-subtle transition-colors">
                 <Filter className="w-4 h-4" />
              </button>
              <button className="p-2 border border-line rounded-lg text-ink-faint hover:bg-subtle transition-colors">
                 <Download className="w-4 h-4" />
              </button>
           </div>
        </div>

        {/* Contacts Table */}
        <div className="overflow-x-auto min-h-[400px]">
           <table className="w-full border-collapse">
              <thead>
                 <tr className="bg-surface border-b border-line-subtle">
                    <th className="p-4 w-10"><input type="checkbox" className="rounded border-line-strong text-accent" /></th>
                    <th className="p-4 text-left text-[11px] font-bold text-ink-faint uppercase tracking-wider">Contact</th>
                    <th className="p-4 text-left text-[11px] font-bold text-ink-faint uppercase tracking-wider">Role</th>
                    {showAccountColumn && (
                      <th className="p-4 text-left text-[11px] font-bold text-ink-faint uppercase tracking-wider">Account</th>
                    )}
                    <th className="p-4 text-left text-[11px] font-bold text-ink-faint uppercase tracking-wider">Status</th>
                    <th className="p-4 text-left text-[11px] font-bold text-ink-faint uppercase tracking-wider">Sentiment</th>
                    <th className="p-4 text-left text-[11px] font-bold text-ink-faint uppercase tracking-wider">Last Contacted</th>
                    <th className="p-4 text-center w-10"></th>
                 </tr>
              </thead>
              <tbody>
                 {filteredContacts.map((contact) => (
                   <tr key={contact.id} className="hover:bg-subtle border-b border-line-subtle transition-all group">
                     <td className="p-4"><input type="checkbox" className="rounded" onClick={(e) => e.stopPropagation()} /></td>
                     <td className="p-4">
                        <div className="flex items-center gap-3">
                           <div className="w-9 h-9 rounded-full bg-accent-dim border border-accent/30 flex items-center justify-center text-[12px] font-bold text-accent shadow-xs">
                              {initials(contact.name)}
                           </div>
                           <div className="flex flex-col">
                              <span className="text-[13.5px] font-bold text-ink group-hover:text-accent transition-colors">{contact.name}</span>
                              <span className="text-[11px] font-medium text-ink-faint lowercase">{contact.email}</span>
                           </div>
                        </div>
                     </td>
                     <td className="p-4">
                        <span className="px-2.5 py-1 rounded-md bg-subtle border border-line-subtle text-[11.5px] font-bold text-ink-muted uppercase tracking-tight">
                           {contact.role_display}
                        </span>
                     </td>
                     {showAccountColumn && (
                       <td className="p-4">
                          <span className={`text-[13px] font-medium ${contact.account_name ? 'text-ink-muted' : 'text-ink-faint italic'}`}>
                             {contact.account_name ?? 'Organization'}
                          </span>
                       </td>
                     )}
                     <td className="p-4">
                        <div className="flex items-center gap-2">
                           <div className={`w-2 h-2 rounded-full ${contact.status === 'active' ? 'bg-success' : 'bg-line-strong'}`} />
                           <span className={`text-[13px] font-medium ${contact.status === 'active' ? 'text-ink-muted' : 'text-ink-faint'}`}>{capitalize(contact.status)}</span>
                        </div>
                     </td>
                     <td className="p-4">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-bold ${
                          contact.sentiment === 'positive' ? 'bg-success-dim border-success/30 text-success' :
                          contact.sentiment === 'negative' ? 'bg-danger-dim border-danger/30 text-danger' :
                          'bg-warning-dim border-warning/30 text-warning'
                        }`}>
                           <div className={`w-1.5 h-1.5 rounded-full ${
                             contact.sentiment === 'positive' ? 'bg-success' :
                             contact.sentiment === 'negative' ? 'bg-danger' :
                             'bg-warning'
                           }`} />
                           {capitalize(contact.sentiment)}
                        </div>
                     </td>
                     <td className="p-4">
                        <div className="flex flex-col">
                           <span className="text-[13px] font-bold text-ink-muted">{formatRelativeTime(contact.last_contacted_at)}</span>
                           <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Mail className="w-3 h-3 text-accent hover:text-accent cursor-pointer" />
                              <Phone className="w-3 h-3 text-accent hover:text-accent cursor-pointer" />
                           </div>
                        </div>
                     </td>
                     <td className="p-4">
                        <button
                          type="button"
                          aria-label={`Actions for ${contact.name}`}
                          className="p-1 cursor-pointer hover:bg-line rounded-md transition-colors inline-block text-ink-faint opacity-0 group-hover:opacity-100 hover:text-ink-muted"
                          onClick={(e) => handleRowActionClick(e, contact)}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                     </td>
                   </tr>
                 ))}
                 {!isLoading && !error && filteredContacts.length === 0 && (
                   <tr>
                     <td colSpan={columnCount} className="p-20 text-center text-ink-faint font-medium">
                       {contacts.length === 0 ? 'No contacts found.' : 'No contacts match your search.'}
                     </td>
                   </tr>
                 )}
                 {isLoading && (
                   <tr>
                     <td colSpan={columnCount} className="p-20 text-center text-ink-faint font-medium">Loading contacts…</td>
                   </tr>
                 )}
                 {error && (
                   <tr>
                     <td colSpan={columnCount} className="p-20 text-center text-danger font-medium">{error}</td>
                   </tr>
                 )}
              </tbody>
           </table>
        </div>
      </div>

      {isAddingContact && (
        <ContactFormModal
          customerId={customerId}
          accountId={accountId}
          onClose={() => setIsAddingContact(false)}
          onSaved={refetch}
        />
      )}

      {editingContact && (
        <ContactFormModal
          contact={editingContact}
          onClose={() => setEditingContact(null)}
          // Nothing to re-read: updateContact's reducer patches `contacts`
          // (see ContactFormModal's own prop doc).
          onSaved={() => {}}
        />
      )}

      {deletingContact && (
        <ConfirmDialog
          title={`Delete ${deletingContact.name}?`}
          message="This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await dispatch(deleteContact(deletingContact.id)).unwrap();
          }}
          onClose={() => setDeletingContact(null)}
        />
      )}

      {activeRowPopup && (
        <ContactRowActionsPopover
          onClose={() => setActiveRowPopup(null)}
          style={activeRowPopup.style}
          onEdit={() => {
            setEditingContact(activeRowPopup.contact);
            setActiveRowPopup(null);
          }}
          onDelete={() => {
            setDeletingContact(activeRowPopup.contact);
            setActiveRowPopup(null);
          }}
        />
      )}
    </div>
  );
}

function ContactStatCard({ title, value, subtext, icon }: { title: string; value: string; subtext: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <div className="p-3 bg-subtle rounded-xl border border-line-subtle">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[11px] font-bold text-ink-faint uppercase tracking-widest leading-none mb-1">{title}</span>
        <span className="text-[20px] font-bold text-ink leading-tight">{value}</span>
        <span className="text-[11px] font-medium text-ink-faint pt-0.5">{subtext}</span>
      </div>
    </div>
  );
}
