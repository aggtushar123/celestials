import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { useAppDispatch } from '../../hooks';
import { createCustomer } from '../../features/customers/customersSlice';
import { LIFECYCLE_LABELS, CURRENCY_OPTIONS } from '../../features/customers/formatters';
import { parseCsv } from './csvParser';
import { ApiError } from '../../lib/apiClient';
import { BUTTON, FOCUS, FORM_ALERT, MetaParts, NUM, PRIMARY, QUIET, Select, SettingsFrame, SettingsRow, SettingsSection, TABLE, TD, TH, TYPE, ScrollTable } from '../../components/ui';
import { settingsTitle } from './workspaceSettingsNav';
import type { CustomerWritePayload } from '../../features/customers/customersSlice';
import type { LifecycleCategory } from '../../components/organizations/tableData';
import type { CurrencyCode } from '../../features/auth/authSlice';

// Backs Settings > Data > Imports (/settings/entity-uploads): CSV
// bulk-create for Organizations. No new
// backend endpoint: each mapped row becomes one real POST /customers/
// via the same createCustomer thunk the standalone "Add Organization"
// modal already uses (see OrganizationFormModal.tsx). This is the
// same create path, just driven by a spreadsheet instead of a form,
// one row at a time so a bad row's failure doesn't lose the good ones.
//
// v1 is Organizations only (the tab's own most obvious target, and
// what OrganizationFormModal's own field set already maps cleanly to).
// Accounts/Contacts import is a natural, structurally identical
// follow-up, not built here.
type FieldKey =
  | 'name'
  | 'domain'
  | 'address'
  | 'lifecycle_stage'
  | 'currency'
  | 'joined_date'
  | 'renewal_date'
  | 'skip';

const FIELD_OPTIONS: { value: FieldKey; label: string }[] = [
  { value: 'skip', label: 'Skip this column' },
  { value: 'name', label: 'Name (required)' },
  { value: 'domain', label: 'Domain' },
  { value: 'address', label: 'Address' },
  { value: 'lifecycle_stage', label: 'Lifecycle stage' },
  { value: 'currency', label: 'Currency' },
  { value: 'joined_date', label: 'Joined date (YYYY-MM-DD)' },
  { value: 'renewal_date', label: 'Renewal date (YYYY-MM-DD)' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIFECYCLE_BY_LABEL: Record<string, LifecycleCategory> = Object.fromEntries(
  Object.entries(LIFECYCLE_LABELS).map(([value, label]) => [label.toLowerCase(), value as LifecycleCategory])
);
const CURRENCY_CODES = new Set(CURRENCY_OPTIONS.map((c) => c.code));

function guessField(header: string): FieldKey {
  const h = header.trim().toLowerCase();
  if (h === 'name' || h === 'organization' || h === 'organization name') return 'name';
  if (h === 'domain') return 'domain';
  if (h === 'address') return 'address';
  if (h.includes('lifecycle') || h.includes('stage')) return 'lifecycle_stage';
  if (h.includes('currency')) return 'currency';
  if (h.includes('joined')) return 'joined_date';
  if (h.includes('renewal')) return 'renewal_date';
  return 'skip';
}

function coerceLifecycleStage(raw: string): LifecycleCategory | undefined {
  const v = raw.trim().toLowerCase();
  if (!v) return undefined;
  if (v in LIFECYCLE_LABELS) return v as LifecycleCategory;
  return LIFECYCLE_BY_LABEL[v];
}

// Accepts the raw 3-letter code case-insensitively (e.g. "usd" -> "USD")
// unlike lifecycle stage there's no display-label variant to also
// accept, currency codes are already what a spreadsheet would contain.
// Unrecognized -> undefined, same "silently skip this one field" rule as
// coerceLifecycleStage/malformed dates: the row still imports, just
// without that field set, so the backend's own org-currency default
// applies (see CustomerSerializer.create()).
function coerceCurrency(raw: string): CurrencyCode | undefined {
  const v = raw.trim().toUpperCase();
  return CURRENCY_CODES.has(v as CurrencyCode) ? (v as CurrencyCode) : undefined;
}

const RESULTS_PAGE = 20;

interface RowResult {
  row: number;
  name: string;
  status: 'ok' | 'error';
  detail: string;
}

export function EntityUploadsPage() {
  const dispatch = useAppDispatch();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<FieldKey[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Focus that has to wait for the next render, because the control that held
  // it unmounts (the file button once a file is chosen, Import, Show all).
  const mapHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  // Show all: the first row that was not on screen before.
  const firstMoreRef = useRef<HTMLTableRowElement>(null);
  const pendingFocus = useRef<(() => void) | null>(null);
  useEffect(() => {
    const run = pendingFocus.current;
    pendingFocus.current = null;
    run?.();
  });

  const nameColumnIndex = mapping.indexOf('name');
  const canImport = nameColumnIndex !== -1 && dataRows.length > 0 && !isImporting;

  function reset() {
    // A run in progress keeps posting row by row; a reset now would hide it, not stop it.
    if (isImporting) return;
    setFileName(null);
    setParseError(null);
    setHeaders([]);
    setDataRows([]);
    setMapping([]);
    setResults(null);
    setProgress(0);
    setShowAll(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Back to choosing: the file button is the way in again.
    pendingFocus.current = () => fileInputRef.current?.focus();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setResults(null);
    setFileName(file.name);

    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      setParseError('That file has no rows.');
      return;
    }
    const [header, ...rest] = rows;
    if (rest.length === 0) {
      setParseError('That file only has a header row: nothing to import.');
      return;
    }
    setHeaders(header);
    setDataRows(rest);
    setMapping(header.map(guessField));
    pendingFocus.current = () => mapHeadingRef.current?.focus();
  }

  const previewRows = useMemo(() => dataRows.slice(0, 5), [dataRows]);

  function buildPayload(row: string[]): CustomerWritePayload & { name: string } {
    const payload: CustomerWritePayload & { name: string } = { name: '' };
    mapping.forEach((field, i) => {
      const raw = (row[i] ?? '').trim();
      if (!raw || field === 'skip') return;
      if (field === 'lifecycle_stage') {
        const stage = coerceLifecycleStage(raw);
        if (stage) payload.lifecycle_stage = stage;
      } else if (field === 'currency') {
        const currency = coerceCurrency(raw);
        if (currency) payload.currency = currency;
      } else if (field === 'joined_date' || field === 'renewal_date') {
        if (DATE_RE.test(raw)) payload[field] = raw;
      } else {
        payload[field] = raw;
      }
    });
    return payload;
  }

  async function handleImport() {
    setIsImporting(true);
    setProgress(0);
    const outcomes: RowResult[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const payload = buildPayload(dataRows[i]);
      if (!payload.name) {
        outcomes.push({ row: i + 2, name: '(blank)', status: 'error', detail: 'No name in this row.' });
      } else {
        try {
          await dispatch(createCustomer(payload)).unwrap();
          outcomes.push({ row: i + 2, name: payload.name, status: 'ok', detail: 'Created.' });
        } catch (err) {
          const detail = err instanceof ApiError ? err.message : typeof err === 'string' ? err : 'Could not create.';
          outcomes.push({ row: i + 2, name: payload.name, status: 'error', detail });
        }
      }
      setProgress(i + 1);
    }

    setResults(outcomes);
    setIsImporting(false);
    pendingFocus.current = () => resultsHeadingRef.current?.focus();
  }

  const successCount = results?.filter((r) => r.status === 'ok').length ?? 0;
  const failureCount = results ? results.length - successCount : 0;

  const rowWord = (n: number) => `${n} row${n === 1 ? '' : 's'}`;
  const shownResults = results && !showAll ? results.slice(0, RESULTS_PAGE) : results;
  return (
    <SettingsFrame title={settingsTitle('/settings/entity-uploads')} intro='Bulk-create organizations from a CSV file: one real "Add organization" per row.'>
      {!fileName || parseError ? (
        <SettingsSection title="Choose a file">
          <SettingsRow label="CSV file" hint="First row: column headers. A Name column is required.">
            <label className={`${BUTTON} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-accent`}>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileChange} />
              Choose a CSV file
            </label>
          </SettingsRow>
          {parseError ? (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <p role="alert" className={`flex items-center gap-2 ${FORM_ALERT}`}>
                <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                {parseError}
              </p>
              <button type="button" onClick={reset} className={`ml-auto ${QUIET}`}>
                Try another file
              </button>
            </div>
          ) : null}
        </SettingsSection>
      ) : null}

      {fileName && !parseError && !results ? (
        <SettingsSection
          title="Map columns"
          headingRef={mapHeadingRef}
          description={<MetaParts parts={[fileName, rowWord(dataRows.length)]} />}
          action={
            <button type="button" onClick={reset} aria-disabled={isImporting || undefined} className={QUIET}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Choose a different file
            </button>
          }
          footer={
            <>
              {/* Always mounted: the run's progress is announced as it moves. */}
              <p role="status" className={`mr-auto ${TYPE.bodyMuted}`}>
                {isImporting ? `Importing ${progress} of ${dataRows.length}…` : ''}
              </p>
              {nameColumnIndex === -1 ? (
                <p id="import-needs-name" className={TYPE.bodyMuted}>
                  Map a column to "Name" to continue.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (canImport) void handleImport();
                }}
                aria-disabled={!canImport || undefined}
                aria-describedby={nameColumnIndex === -1 ? 'import-needs-name' : undefined}
                className={PRIMARY}
              >
                Import <span className={NUM}>{dataRows.length}</span> organization{dataRows.length === 1 ? '' : 's'}
              </button>
            </>
          }
        >
          <div>
            <ScrollTable>
              <table className={TABLE}>
                <thead>
                  <tr>
                    {headers.map((header, index) => (
                      <th key={index} scope="col" className={`${TH} whitespace-nowrap`}>
                        {header || `Column ${index + 1}`}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {headers.map((header, index) => (
                      <td key={index} className="px-4 pb-2">
                        <Select
                          label={`Field for ${header || `Column ${index + 1}`}`}
                          labelPosition="hidden"
                          value={mapping[index]}
                          onChange={(value) => setMapping((current) => current.map((field, at) => (at === index ? value : field)))}
                          options={FIELD_OPTIONS}
                          className="min-w-40"
                        />
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {previewRows.map((row, r) => (
                    <tr key={r}>
                      {headers.map((_, index) => (
                        <td key={index} title={row[index]} className={`${TD} max-w-[200px] truncate whitespace-nowrap text-ink-muted`}>
                          {row[index]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
            {dataRows.length > previewRows.length ? (
              <p className={`px-4 py-3 ${TYPE.meta}`}>
                <span className={NUM}>{dataRows.length - previewRows.length}</span> more {dataRows.length - previewRows.length === 1 ? 'row' : 'rows'} not shown.
              </p>
            ) : null}
          </div>
        </SettingsSection>
      ) : null}

      {results ? (
        <SettingsSection
          title="Results"
          headingRef={resultsHeadingRef}
          description={
            <MetaParts
              parts={[
                <>
                  <span className={NUM}>{successCount}</span> created
                </>,
                failureCount > 0 ? (
                  <span className="text-[13px] leading-5 text-danger-ink">
                    <span className={NUM}>{failureCount}</span> failed
                  </span>
                ) : null,
              ]}
            />
          }
          action={
            <button type="button" onClick={reset} className={QUIET}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Upload another file
            </button>
          }
          footer={
            results.length > RESULTS_PAGE && !showAll ? (
              <button
                type="button"
                onClick={() => {
                  setShowAll(true);
                  pendingFocus.current = () => firstMoreRef.current?.focus();
                }}
                className={QUIET}
              >
                Show all <span className={NUM}>{results.length}</span>
              </button>
            ) : undefined
          }
        >
          <ScrollTable>
            <table className={TABLE}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    Row
                  </th>
                  <th scope="col" className={TH}>
                    Name
                  </th>
                  <th scope="col" className={TH}>
                    Result
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {shownResults!.map((result, index) => (
                  <tr
                    key={result.row}
                    ref={index === RESULTS_PAGE ? firstMoreRef : undefined}
                    tabIndex={index === RESULTS_PAGE ? -1 : undefined}
                    className={index === RESULTS_PAGE ? FOCUS : undefined}
                  >
                    <td className={`${TD} text-ink-muted ${NUM}`}>{result.row}</td>
                    <td className={`${TD} font-semibold`}>{result.name}</td>
                    <td className={TD}>
                      <span className={`flex items-center gap-1.5 ${result.status === 'ok' ? '' : 'text-danger-ink'}`.trim()}>
                        {result.status === 'ok' ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                        )}
                        {result.detail}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </SettingsSection>
      ) : null}
    </SettingsFrame>
  );
}
