import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAppSelector } from '../../../hooks';
import type { FilterGroup, FilterOption } from '../../../components/shared/FilterSelect';
import { DashboardToolbar } from '../shared/DashboardToolbar';
import type { ToolbarFilter } from '../shared/DashboardToolbar';
import { toQuery, useDashboardFilters } from '../shared/useDashboardFilters';
import { useSubViews } from '../useSubViews';
import type { AITrendingContext } from './ai-trending/ControlsView';

const KEYS = ['scope', 'type', 'sentiment', 'area', 'category', 'subcategory', 'revenue_bracket'];

/**
 * The AI Trending Topics shell, and its filter bar.
 *
 * The filters live in the URL rather than component state, the same move
 * Health > Activity and Ticket Overview already made. "Account Name" keeps its
 * grouped organisations/accounts options, but the selection is stored under
 * one URL key, `scope`, as `customer:<id>` or `account:<id>` — the kind has
 * to travel with the id, and the two are different query params on the
 * backend, so the pair is split back apart when the query is built.
 */
export function AITrendingTopics() {
  const subViews = useSubViews();
  const options = useAppSelector((state) => state.interactions.stats?.filters);
  const { values, set } = useDashboardFilters(KEYS);

  // Filter options arrive with the stats response, so on the very first
  // render (before that response lands) `options` is undefined and there is
  // no way to know yet whether a deep-linked subcategory belongs to the
  // chosen category. Judging it invalid at that point would delete a
  // perfectly good deep link before it ever got a chance to prove itself.
  const loaded = options?.subcategories !== undefined;

  /** Subcategories are narrowed to the chosen category, because offering
   *  twenty-five values of which three can match is worse than offering three.
   *  With no category chosen they are all on offer, since picking one on its
   *  own is a legitimate way to find a topic. */
  const subcategoryOptions = (options?.subcategories ?? []).filter(
    (s) => !values.category || s.category === values.category
  );
  const subcategoryValid = subcategoryOptions.some((s) => s.value === values.subcategory);

  // A category change (or a stale link) can leave a subcategory behind that
  // no longer belongs to it. Once the options have loaded and proven it
  // stale, the URL is cleaned up too, so the chip doesn't keep pointing at a
  // value it no longer offers.
  useEffect(() => {
    if (loaded && values.subcategory && !subcategoryValid) {
      set('subcategory', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, values.category, values.subcategory, subcategoryValid]);

  let query = toQuery({
    type: values.type,
    sentiment: values.sentiment,
    area: values.area,
    category: values.category,
    // Before the options load, pass the URL's subcategory through
    // unfiltered rather than guessing it's invalid; once loaded, send it
    // only if it's confirmed to belong to the chosen category.
    subcategory: loaded ? (subcategoryValid ? values.subcategory : '') : values.subcategory,
    revenue_bracket: values.revenue_bracket,
  });

  const [scopeKind, scopeId] = values.scope.split(':');
  if (scopeKind && scopeId) {
    const params = new URLSearchParams(query);
    params.set(scopeKind, scopeId);
    query = params.toString();
  }

  const context: AITrendingContext = { query };

  /** Organisations and their accounts in one chip, grouped — the column this
   *  filters is labelled "Account Name" and shows either kind of parent. */
  const scopeOptions: (FilterOption | FilterGroup)[] = [
    { value: '', label: 'All' },
    {
      label: 'Organisations',
      options: (options?.customers ?? []).map((c) => ({ value: `customer:${c.id}`, label: c.name })),
    },
    {
      label: 'Accounts',
      options: (options?.accounts ?? []).map((a) => ({ value: `account:${a.id}`, label: a.name })),
    },
  ];

  const filters: ToolbarFilter[] = [
    { key: 'scope', label: 'Account Name', options: scopeOptions },
    {
      key: 'type',
      label: 'Activity Type',
      options: [
        { value: '', label: 'All' },
        ...(options?.types ?? []).map((o) => ({ value: o.value, label: o.name })),
      ],
    },
    {
      key: 'sentiment',
      label: 'Sentiment',
      options: [
        { value: '', label: 'All' },
        ...(options?.sentiments ?? []).map((o) => ({ value: o.value, label: o.name })),
      ],
    },
    {
      key: 'area',
      label: 'AI Area',
      options: [
        { value: '', label: 'All' },
        ...(options?.areas ?? []).map((o) => ({ value: o.value, label: o.name })),
      ],
    },
    {
      key: 'category',
      label: 'AI Category',
      options: [
        { value: '', label: 'All' },
        ...(options?.categories ?? []).map((o) => ({ value: o.value, label: o.name })),
      ],
    },
    {
      key: 'subcategory',
      label: 'AI Subcategory',
      options: [
        { value: '', label: 'All' },
        ...subcategoryOptions.map((o) => ({ value: o.value, label: o.name })),
      ],
    },
    {
      key: 'revenue_bracket',
      label: 'Revenue Bracket',
      options: [
        { value: '', label: 'All' },
        ...(options?.revenue_brackets ?? []).map((o) => ({ value: o.value, label: o.name })),
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full w-full">
      <DashboardToolbar subViews={subViews} filters={filters} />
      <div className="flex-1 w-full h-full">
        <Outlet context={context} />
      </div>
    </div>
  );
}
