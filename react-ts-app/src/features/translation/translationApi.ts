// Thin apiFetch wrapper over revenact-backend's services/translation —
// see docs/API_CONTRACTS.md's `translation` section.
import { apiFetch } from '../../lib/apiClient';

export type TranslatableKind = 'email' | 'ticket' | 'call' | 'mail_message';

export interface Translated {
  text: string;
  to: string;
  detected_language: string;
  /** False when it came from the cache, so nobody paid for it twice. */
  made_now: boolean;
}

/** One record's words in another language, kept for the next reader. */
export function translateRecord(kind: TranslatableKind, id: number, to: string): Promise<Translated> {
  return apiFetch<Translated>('/translations/', { method: 'POST', body: { kind, id, to } });
}

/** A draft somebody is writing. Nothing is stored: a draft is not a record. */
export function translateText(text: string, to: string): Promise<Translated> {
  return apiFetch<Translated>('/translations/', { method: 'POST', body: { text, to } });
}

/** The handful of languages the controls offer, with what to call them. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ar', label: 'Arabic' },
];

export function languageName(code: string): string {
  if (!code) return '';
  const known = LANGUAGES.find((language) => language.code === code.toLowerCase().split('-')[0]);
  return known ? known.label : code;
}
