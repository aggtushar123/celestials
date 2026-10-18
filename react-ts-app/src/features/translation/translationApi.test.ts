import { describe, it, expect, vi, beforeEach } from 'vitest';

// Unit tier: each wrapper hits the path and body the contract names.
vi.mock('../../lib/apiClient', () => ({ apiFetch: vi.fn(async () => ({})) }));

import { apiFetch } from '../../lib/apiClient';
import { languageName, translateRecord, translateText } from './translationApi';

const mocked = vi.mocked(apiFetch);

describe('translationApi', () => {
  beforeEach(() => mocked.mockClear());

  it('translates a record and a draft', async () => {
    await translateRecord('email', 412, 'en');
    expect(mocked).toHaveBeenLastCalledWith('/translations/', { method: 'POST', body: { kind: 'email', id: 412, to: 'en' } });
    await translateText('Hello there', 'fr');
    expect(mocked).toHaveBeenLastCalledWith('/translations/', { method: 'POST', body: { text: 'Hello there', to: 'fr' } });
  });

  it('names a language, including a regional one, and falls back to the code', () => {
    expect(languageName('fr')).toBe('French');
    expect(languageName('pt-BR')).toBe('Portuguese');
    expect(languageName('xx')).toBe('xx');
    expect(languageName('')).toBe('');
  });
});
