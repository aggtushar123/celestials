import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CHAMPIONS, listRow, RENEWAL_RISK } from '../../features/segments/testSegments';
import { SegmentOptions } from './SegmentOptions';
import { segmentSelectOptions } from './segmentSelectOptions';

const pick = (props: Parameters<typeof SegmentOptions>[0]) =>
  render(
    <select aria-label="Segment" defaultValue="">
      <SegmentOptions {...props} />
    </select>,
  );

describe('SegmentOptions (shared by Surveys and rules)', () => {
  it('groups my segments by kind under a prompt', () => {
    pick({ rows: [listRow(RENEWAL_RISK), listRow(CHAMPIONS)], fallback: null });
    const select = screen.getByRole('combobox', { name: 'Segment' });
    expect(select.querySelector('option')).toHaveTextContent('Choose a segment…');
    expect(select.querySelector('optgroup[label="Organisations"]')).toHaveTextContent('Renewal risk');
    expect(select.querySelector('optgroup[label="Contacts"]')).toHaveTextContent('Champions');
    expect(select.querySelector('optgroup[label="Accounts"]')).toBeNull();
  });

  it('says it is loading, and keeps a saved segment that is not among mine', () => {
    pick({ rows: null, fallback: { id: 40, name: 'Old list', kind: 'customer' } });
    const options = [...screen.getByRole('combobox', { name: 'Segment' }).querySelectorAll('option')].map((option) => option.textContent);
    expect(options).toEqual(['Loading your segments…', 'Old list']);
  });
});

describe('segmentSelectOptions', () => {
  it('returns the placeholder, the fallback, then one group per kind with rows', () => {
    expect(segmentSelectOptions([listRow(RENEWAL_RISK), listRow(CHAMPIONS)], { id: 40, name: 'Old list', kind: 'customer' })).toEqual([
      { value: '', label: 'Choose a segment…' },
      { value: '40', label: 'Old list' },
      { label: 'Organisations', options: [{ value: String(RENEWAL_RISK.id), label: RENEWAL_RISK.name }] },
      { label: 'Contacts', options: [{ value: String(CHAMPIONS.id), label: CHAMPIONS.name }] },
    ]);
    expect(segmentSelectOptions(null, null)).toEqual([{ value: '', label: 'Loading your segments…' }]);
  });
});
