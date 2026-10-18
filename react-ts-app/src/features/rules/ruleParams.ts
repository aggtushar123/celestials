// The Scenarios pages' URL state: which tab (/scenarios?tab=) and which
// night is open on a rule (/scenarios/rules/:id?run=, the rule_fired link).
export type ScenariosTab = 'rules' | 'canvas';

/** Rules unless `?tab=canvas` (plan Decision 2). */
export function scenariosTab(search: URLSearchParams): ScenariosTab {
  return search.get('tab') === 'canvas' ? 'canvas' : 'rules';
}

export function openRun(search: URLSearchParams): number | null {
  const value = search.get('run');
  return value && /^\d+$/.test(value) ? Number(value) : null;
}
