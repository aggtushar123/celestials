// Thin apiFetch wrappers over revenact-backend's /api/v1/segments/ (PR #84).
import { apiFetch } from '../../lib/apiClient';
import { fetchAccountPortfolio } from '../accounts/portfolioApi';
import { downloadAttachment } from '../files/filesSlice';
import { fetchPortfolio } from '../organizations/portfolioApi';
import { localDay } from '../organizations/storyDays';
import type {
  MemberState,
  MemberStateValue,
  PersonRef,
  PreviewRequest,
  PreviewResponse,
  Segment,
  SegmentChanges,
  SegmentListRow,
  SegmentMembersPage,
  SegmentScope,
  SegmentWrite,
} from './segmentTypes';

export const SEGMENTS_PATH = '/segments/';
const one = (id: number) => `${SEGMENTS_PATH}${id}/`;

/** The records a rule's picker names: organisations or accounts. */
export type PickerRecord = 'customer' | 'account';

/** Unpaginated, by name. `scope` and `search` are sent only when set. */
export function fetchSegments(scope: SegmentScope, search: string): Promise<SegmentListRow[]> {
  const query = new URLSearchParams();
  if (scope !== 'all') query.set('scope', scope);
  if (search) query.set('search', search);
  const text = query.toString();
  return apiFetch<SegmentListRow[]>(text ? `${SEGMENTS_PATH}?${text}` : SEGMENTS_PATH);
}

export function fetchSegment(id: number): Promise<Segment> {
  return apiFetch<Segment>(one(id));
}

export function createSegment(body: SegmentWrite): Promise<Segment> {
  return apiFetch<Segment>(SEGMENTS_PATH, { method: 'POST', body });
}

/** Owner only: another reader gets 403, a segment they can't read 404. */
export function updateSegment(id: number, body: Partial<Omit<SegmentWrite, 'kind'>>): Promise<Segment> {
  return apiFetch<Segment>(one(id), { method: 'PATCH', body });
}

export function deleteSegment(id: number): Promise<null> {
  return apiFetch<null>(one(id), { method: 'DELETE' });
}

/** Any reader: a private copy they own, rules as they read them. */
export function duplicateSegment(id: number): Promise<Segment> {
  return apiFetch<Segment>(`${one(id)}duplicate/`, { method: 'POST' });
}

/** `query` carries only sort, group, group_value, search, cursor and limit
 *  (the server drops anything else). */
export function fetchMembers<R>(id: number, query: string): Promise<SegmentMembersPage<R>> {
  return apiFetch<SegmentMembersPage<R>>(query ? `${one(id)}members/?${query}` : `${one(id)}members/`);
}

/** Every member the reader may open as CSV (audited server-side), fetched
 *  with the session's token. Named for the reader's own calendar day. */
export function exportMembers(id: number, query: string, today: Date = new Date()): Promise<void> {
  const path = query ? `${one(id)}members/export.csv?${query}` : `${one(id)}members/export.csv`;
  return downloadAttachment({ download_url: path, name: `segment-${id}-${localDay(today)}.csv` });
}

export function setMemberState(id: number, recordId: number, state: MemberStateValue): Promise<MemberState> {
  return apiFetch<MemberState>(`${one(id)}members/${recordId}/`, { method: 'PATCH', body: { state } });
}

export function fetchChanges(id: number, days: number): Promise<SegmentChanges> {
  return apiFetch<SegmentChanges>(`${one(id)}changes/?days=${days}`);
}

/** Unsaved rules, checked exactly as a save is: a 400 reads `{rules: [...]}`. */
export function previewSegment(body: PreviewRequest): Promise<PreviewResponse> {
  return apiFetch<PreviewResponse>(`${SEGMENTS_PATH}preview/`, { method: 'POST', body });
}

/** A rule picker's search: GET /customers/?search= or /accounts/?search=,
 *  first page only, scoped server-side to what the reader may open. */
export async function searchRecords(record: PickerRecord, search: string): Promise<PersonRef[]> {
  const base = record === 'customer' ? '/customers/' : '/accounts/';
  const query = search ? `?${new URLSearchParams({ search }).toString()}` : '';
  const page = await apiFetch<{ results: PersonRef[] }>(`${base}${query}`);
  return page.results.map(({ id, name }) => ({ id, name }));
}

/** Names for the ids a list's filters named (Save as segment), read from the
 *  kind's own portfolio with `ids`: only records the reader may open come
 *  back, so the rest stay unnamed ("an organisation you can't open"). */
export async function fetchRecordNames(record: PickerRecord, ids: number[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const query = new URLSearchParams({ ids: ids.join(','), limit: '100' }).toString();
  const page = record === 'customer' ? await fetchPortfolio(query) : await fetchAccountPortfolio(query);
  return Object.fromEntries(page.results.map((row) => [String(row.id), row.name]));
}
