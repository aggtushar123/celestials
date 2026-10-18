import { describe, it, expect } from 'vitest';
import settingsReducer, {
  setTheme,
  setTimezone,
  addRule,
  toggleRule,
  deleteRule,
  addCustomSkill,
  toggleCustomSkill,
  deleteCustomSkill,
  addAutoBcc,
  removeAutoBcc,
} from '../../features/settings/settingsSlice';

describe('settingsSlice', () => {
  it('initializes with default state', () => {
    const state = settingsReducer(undefined, { type: 'unknown' });
    expect(state.theme).toBe('system');
    expect(state.rules.length).toBeGreaterThan(0);
    expect(state.customSkills.length).toBeGreaterThan(0);
    expect(state.billing.isTrial).toBe(true);
  });

  it('updates theme and timezone', () => {
    let state = settingsReducer(undefined, setTheme('dark'));
    expect(state.theme).toBe('dark');

    state = settingsReducer(state, setTheme('light'));
    expect(state.theme).toBe('light');

    state = settingsReducer(state, setTheme('system'));
    expect(state.theme).toBe('system');

    state = settingsReducer(state, setTimezone('America/New_York'));
    expect(state.timezone).toBe('America/New_York');
  });

  it('adds, toggles, and deletes personalization rules', () => {
    let state = settingsReducer(
      undefined,
      addRule({
        text: 'Always summarize with bullet points',
        isEnabled: true,
        category: 'style',
      })
    );
    const addedRule = state.rules[0];
    expect(addedRule.text).toBe('Always summarize with bullet points');
    expect(addedRule.isEnabled).toBe(true);

    state = settingsReducer(state, toggleRule(addedRule.id));
    expect(state.rules.find((r) => r.id === addedRule.id)?.isEnabled).toBe(false);

    state = settingsReducer(state, deleteRule(addedRule.id));
    expect(state.rules.find((r) => r.id === addedRule.id)).toBeUndefined();
  });

  it('adds, toggles, and deletes custom skills', () => {
    let state = settingsReducer(
      undefined,
      addCustomSkill({
        name: 'Churn Alert Bot',
        summary: 'Notifies team on negative sentiment',
        trigger: 'On ticket created',
        status: 'active',
        instructions: 'Check sentiment score',
      })
    );
    const skill = state.customSkills[0];
    expect(skill.name).toBe('Churn Alert Bot');
    expect(skill.status).toBe('active');

    state = settingsReducer(state, toggleCustomSkill(skill.id));
    expect(state.customSkills.find((s) => s.id === skill.id)?.status).toBe('paused');

    state = settingsReducer(state, deleteCustomSkill(skill.id));
    expect(state.customSkills.find((s) => s.id === skill.id)).toBeUndefined();
  });

  it('adds and removes auto-BCC email addresses', () => {
    let state = settingsReducer(undefined, addAutoBcc('crm@hubspot.com'));
    expect(state.autoBccList).toContain('crm@hubspot.com');

    state = settingsReducer(state, removeAutoBcc('crm@hubspot.com'));
    expect(state.autoBccList).not.toContain('crm@hubspot.com');
  });
});
