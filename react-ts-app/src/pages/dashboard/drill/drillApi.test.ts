import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchDrill, formatDetail, UnlistableDrillError } from './drillApi';
import { formatCompactMoney } from '../../../features/customers/formatters';

// Same stubbing pattern as src/components/shared/CustomObjectsTab.test.tsx —
// only the fetch boundary is mocked, apiFetch does the rest.
function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubFetch(handler: (url: string) => ReturnType<typeof jsonResponse> | undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => Promise.resolve(handler(url) ?? jsonResponse(404, { detail: 'unhandled in test' }))),
  );
}

describe('fetchDrill', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the view\'s existing query plus the drill segment', async () => {
    let requestedUrl = '';
    stubFetch((url) => {
      requestedUrl = url;
      return jsonResponse(200, {
        drill: { segment: 'priority:high', value_label: 'tickets', count: 0, truncated: false, companies: [] },
        currency: 'USD',
      });
    });

    await fetchDrill('/tickets/summary', 'window=30d', 'priority:high', 'USD');

    expect(requestedUrl).toContain('window=30d');
    expect(requestedUrl).toContain('drill=priority%3Ahigh');
  });

  it('requests just the drill segment when there is no existing query', async () => {
    let requestedUrl = '';
    stubFetch((url) => {
      requestedUrl = url;
      return jsonResponse(200, {
        drill: { segment: 'all', value_label: 'tickets', count: 0, truncated: false, companies: [] },
        currency: 'USD',
      });
    });

    await fetchDrill('/tickets/summary', '', 'all', 'USD');

    expect(requestedUrl).toContain('/tickets/summary?drill=all');
  });

  it('throws UnlistableDrillError when the backend ignored the segment and sent no drill', async () => {
    stubFetch(() => jsonResponse(200, { kpis: { total: 3 }, currency: 'USD' }));

    await expect(fetchDrill('/tickets/stats/', '', 'nonsense', 'USD')).rejects.toBeInstanceOf(
      UnlistableDrillError,
    );
  });

  it('maps companies to DrillRows, stringifying ids and formatting the detail line', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        drill: {
          segment: 'all',
          value_label: 'tickets',
          count: 1,
          truncated: false,
          companies: [{ id: 42, name: 'Uber', owner: 'Carl CSM', arr: 12000, value: 2 }],
        },
        currency: 'USD',
      }),
    );

    const result = await fetchDrill('/tickets/summary', '', 'all', 'USD');

    expect(result).toEqual({
      rows: [{ id: '42', name: 'Uber', owner: 'Carl CSM', arr: 12000, detail: '2 tickets' }],
      count: 1,
      truncated: false,
      valueLabel: 'tickets',
    });
  });

  it('carries count and truncated straight through', async () => {
    stubFetch(() =>
      jsonResponse(200, {
        drill: { segment: 'all', value_label: 'tickets', count: 812, truncated: true, companies: [] },
        currency: 'USD',
      }),
    );

    const result = await fetchDrill('/tickets/summary', '', 'all', 'USD');

    expect(result.count).toBe(812);
    expect(result.truncated).toBe(true);
  });
});

describe('formatDetail', () => {
  it('pluralizes ticket and interaction counts', () => {
    expect(formatDetail(2, 'tickets', 'USD')).toBe('2 tickets');
    expect(formatDetail(1, 'tickets', 'USD')).toBe('1 ticket');
    expect(formatDetail(3, 'interactions', 'USD')).toBe('3 interactions');
    expect(formatDetail(1, 'interactions', 'USD')).toBe('1 interaction');
  });

  it('says "never contacted" for a null days-since-contact, else the count', () => {
    expect(formatDetail(null, 'days since contact', 'USD')).toBe('never contacted');
    expect(formatDetail(45, 'days since contact', 'USD')).toBe('45 days since contact');
  });

  it('formats money labels with the label as a suffix', () => {
    expect(formatDetail(12000, 'downside', 'USD')).toBe(`${formatCompactMoney(12000, 'USD')} downside`);
    expect(formatDetail(5000, 'expected expansion', 'USD')).toBe(
      `${formatCompactMoney(5000, 'USD')} expected expansion`,
    );
  });

  it('renders nothing for ARR, since it is already shown once', () => {
    expect(formatDetail(9999, 'ARR', 'USD')).toBe('');
  });
});
