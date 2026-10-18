import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Building2, Layers } from 'lucide-react';
import { useAppSelector } from '../../hooks';
import { formatCompactMoney, formatDate } from '../../features/customers/formatters';
import { ApiError } from '../../lib/apiClient';
import { NextUpCard } from '../../components/work/NextUpCard';
import { fetchCockpitSummary } from './cockpitApi';
import { RENEWAL_WINDOW_OPTIONS } from './cockpitTypes';
import type { CockpitHealthBreakdown, CockpitSummary, RenewalWindowDays } from './cockpitTypes';

// Real numbers throughout (revenact-backend's CockpitSummaryView, see
// docs/API_CONTRACTS.md -> customers). Next up reads My work's feed (work in
// one place delivery 2). Colors use the app's own theme tokens, not one-off
// hex values.

function HealthRing({ health }: { health: CockpitHealthBreakdown }) {
  const total = health.good + health.average + health.poor;
  const label = total === 0 ? 'No health data' : `${health.good} good, ${health.average} average, ${health.poor} poor`;
  if (total === 0) {
    return <div className="w-8 h-8 rounded-full border-[5px] border-line-subtle" role="img" aria-label={label} />;
  }
  const goodDeg = (health.good / total) * 360;
  const averageDeg = (health.average / total) * 360;
  const gradient = `conic-gradient(var(--success) 0deg ${goodDeg}deg, var(--warning) ${goodDeg}deg ${goodDeg + averageDeg}deg, var(--danger) ${goodDeg + averageDeg}deg 360deg)`;
  return (
    <div className="w-8 h-8 rounded-full" style={{ background: gradient }} role="img" aria-label={label}>
      <div className="w-full h-full rounded-full border-[5px] border-transparent" style={{ background: 'var(--bg-surface)', backgroundClip: 'padding-box' }} />
    </div>
  );
}

/** One number with its eyebrow. Numbers in DM Mono with tabular figures. */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="font-mono-brand text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">{label}</div>
      <div className="font-mono-brand text-[22px] text-ink leading-none mt-1.5">{value}</div>
    </div>
  );
}

function ParentIcon({ type, className = 'w-3.5 h-3.5' }: { type: 'customer' | 'account'; className?: string }) {
  return type === 'customer' ? (
    <Building2 className={`${className} text-ink-muted`} aria-label="Organisation" />
  ) : (
    <Layers className={`${className} text-ink-muted`} aria-label="Account" />
  );
}

export function CockpitView() {
  const navigate = useNavigate();
  const currency = useAppSelector((state) => state.auth.user?.organisation.currency ?? 'USD');

  const [summary, setSummary] = useState<CockpitSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [renewalWindow, setRenewalWindow] = useState<RenewalWindowDays>(30);
  const [isWindowMenuOpen, setIsWindowMenuOpen] = useState(false);
  const windowMenuRef = useRef<HTMLDivElement>(null);

  // The itemized drill-down list (every renewing Customer/Account) used to
  // sit inline under the org/account counts, which made this whole card
  // taller than My Portfolio Summary next to it — collapsed behind this
  // toggle instead, so the card's default height matches Portfolio's; the
  // full list is still one click away as a popover, same interaction
  // pattern as the window-size dropdown above it.
  const [isRenewalsListOpen, setIsRenewalsListOpen] = useState(false);
  const renewalsListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (windowMenuRef.current && !windowMenuRef.current.contains(e.target as Node)) {
        setIsWindowMenuOpen(false);
      }
      if (renewalsListRef.current && !renewalsListRef.current.contains(e.target as Node)) {
        setIsRenewalsListOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Called on mount and again whenever the Renewals window dropdown
  // actually changes — a real, working selector backed by
  // CockpitSummaryView's own real `?days=` param, not a static label.
  // Triggered from the dropdown's own click handler (not a `useEffect`
  // keyed on `renewalWindow`) so setIsLoading isn't called synchronously
  // inside an effect body.
  async function loadSummary(days: RenewalWindowDays) {
    setIsLoading(true);
    try {
      setSummary(await fetchCockpitSummary(days));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load your Cockpit.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSummary(30);
  }, []);

  function goToRenewalItem(item: { id: number; type: 'customer' | 'account' }) {
    setIsRenewalsListOpen(false);
    navigate(item.type === 'customer' ? `/organizations/${item.id}` : `/accounts/${item.id}`);
  }

  if (isLoading && !summary) {
    return (
      <div className="w-full max-w-[1100px] mx-auto px-6 pt-6 space-y-4" aria-busy="true" aria-label="Loading your Cockpit">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-[132px] rounded-xl bg-surface/60 border border-line-subtle" />
          <div className="h-[132px] rounded-xl bg-surface/60 border border-line-subtle" />
        </div>
        <div className="h-[280px] rounded-xl bg-surface/60 border border-line-subtle" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="w-full h-full flex items-center justify-center text-[13px] text-danger" role="alert">
        {error ?? 'Could not load your Cockpit.'}
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-[1100px] mx-auto px-6 pt-4 pb-16 flex flex-col gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* My book */}
          <section className="lg:col-span-2 bg-surface border border-line rounded-xl p-5" aria-labelledby="book-heading">
            <h2 id="book-heading" className="text-[13px] font-semibold text-ink">My book</h2>
            <div className="mt-5 grid grid-cols-2 gap-8">
              {(
                [
                  ['customer', 'Organizations', summary.customers],
                  ['account', 'Accounts', summary.accounts],
                ] as const
              ).map(([type, label, book]) => (
                <div key={type}>
                  <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-muted">
                    <ParentIcon type={type} />
                    {label}
                  </div>
                  <div className="mt-3 flex items-end gap-8">
                    <Stat label="Count" value={book.count} />
                    <Stat label="Portfolio value" value={formatCompactMoney(book.value, currency)} />
                    <div>
                      <div className="font-mono-brand text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Health</div>
                      <div className="mt-1.5"><HealthRing health={book.health} /></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Renewals */}
          <section className="bg-surface border border-line rounded-xl p-5 relative" aria-labelledby="renewals-heading">
            <div className="flex items-start justify-between gap-2">
              <h2 id="renewals-heading" className="text-[13px] font-semibold text-ink">Renewals</h2>
              <div ref={windowMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsWindowMenuOpen((open) => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={isWindowMenuOpen}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] text-ink-muted hover:text-ink hover:border-line-strong transition-colors duration-[var(--dur-fast)]"
                >
                  Next {renewalWindow} Days <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                {isWindowMenuOpen && (
                  <div role="listbox" className="absolute right-0 top-[calc(100%+4px)] w-36 bg-elevated border border-line rounded-lg shadow-md overflow-hidden z-10">
                    {RENEWAL_WINDOW_OPTIONS.map((days) => (
                      <button
                        key={days}
                        type="button"
                        role="option"
                        aria-selected={days === renewalWindow}
                        onClick={() => {
                          setRenewalWindow(days);
                          setIsWindowMenuOpen(false);
                          loadSummary(days);
                        }}
                        className={`w-full text-left px-3 py-2 text-[12px] transition-colors duration-[var(--dur-fast)] ${days === renewalWindow ? 'bg-accent-dim text-ink' : 'text-ink-muted hover:bg-subtle hover:text-ink'}`}
                      >
                        Next {days} Days
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-6">
              {(
                [
                  ['customer', 'Organizations', summary.renewals.customers],
                  ['account', 'Accounts', summary.renewals.accounts],
                ] as const
              ).map(([type, label, book]) => (
                <div key={type}>
                  <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-muted">
                    <ParentIcon type={type} />
                    {label}
                  </div>
                  <div className="mt-3 flex items-end gap-6">
                    <Stat label="Count" value={book.count} />
                    <Stat label="Value" value={formatCompactMoney(book.value, currency)} />
                  </div>
                </div>
              ))}
            </div>

            {summary.renewals.items.length > 0 && (
              <div className="mt-4" ref={renewalsListRef}>
                <button
                  type="button"
                  onClick={() => setIsRenewalsListOpen((open) => !open)}
                  aria-expanded={isRenewalsListOpen}
                  className="inline-flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink transition-colors duration-[var(--dur-fast)]"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-[var(--dur-fast)] ${isRenewalsListOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  View {summary.renewals.items.length} renewing {summary.renewals.items.length === 1 ? 'item' : 'items'}
                </button>
                {isRenewalsListOpen && (
                  <ul className="absolute left-5 right-5 top-full mt-2 bg-elevated border border-line rounded-lg shadow-md z-20 max-h-[260px] overflow-y-auto custom-scrollbar p-1.5 divide-y divide-line-subtle">
                    {summary.renewals.items.map((item) => (
                      <li key={`${item.type}-${item.id}`}>
                        <button
                          type="button"
                          onClick={() => goToRenewalItem(item)}
                          className="w-full flex items-center gap-2.5 py-2 px-2 rounded-md hover:bg-subtle transition-colors duration-[var(--dur-fast)] text-left"
                        >
                          <ParentIcon type={item.type} className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-[12.5px] font-medium text-ink truncate flex-1">{item.name}</span>
                          <span className="font-mono-brand text-[11.5px] text-ink-muted shrink-0">{formatCompactMoney(item.value, currency)}</span>
                          <span className="font-mono-brand text-[11px] text-ink-faint shrink-0 w-[68px] text-right">{formatDate(item.renewal_date)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>

        <NextUpCard />
      </div>
    </div>
  );
}
