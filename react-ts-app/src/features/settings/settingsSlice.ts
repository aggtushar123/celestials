import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface PersonalizationRule {
  id: string;
  text: string;
  isEnabled: boolean;
  category: 'style' | 'priority' | 'context' | 'general';
  createdAt: string;
}

export interface CustomSkill {
  id: string;
  name: string;
  summary: string;
  trigger: string;
  status: 'active' | 'draft' | 'paused';
  instructions: string;
  actionCount: number;
  lastRun?: string;
}

export interface EmailSignature {
  id: string;
  accountEmail: string;
  title: string;
  body: string;
  isDefault: boolean;
}

interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  timezone: string;
  rules: PersonalizationRule[];
  customSkills: CustomSkill[];
  autoBccList: string[];
  signatures: EmailSignature[];
  billing: {
    planName: string;
    isTrial: boolean;
    trialDaysRemaining: number;
    pricePerMonth: number;
    trialEndDate: string;
    paymentMethodMask: string;
  };
}

const INITIAL_RULES: PersonalizationRule[] = [
  {
    id: 'rule-1',
    text: 'Keep email summaries and executive briefings to 3 bullet points or less.',
    isEnabled: true,
    category: 'style',
    createdAt: '2026-09-10T10:00:00Z',
  },
  {
    id: 'rule-2',
    text: 'Flag any enterprise contract renewal occurring within 45 days with urgent priority.',
    isEnabled: true,
    category: 'priority',
    createdAt: '2026-09-12T14:30:00Z',
  },
  {
    id: 'rule-3',
    text: 'Always recommend scheduling follow-up cadences in the customer local timezone.',
    isEnabled: true,
    category: 'context',
    createdAt: '2026-09-15T09:15:00Z',
  },
];

const INITIAL_SKILLS: CustomSkill[] = [
  {
    id: 'skill-1',
    name: 'Weekly Portfolio Health Digest',
    summary: 'Synthesizes account health changes, usage drops, and new support tickets into a Monday morning brief.',
    trigger: 'Every Monday at 8:00 AM',
    status: 'active',
    instructions: 'Examine accounts with MRR > $2k. Highlight any accounts whose health score slipped more than 10 points this week.',
    actionCount: 24,
    lastRun: 'Sep 15, 2026',
  },
  {
    id: 'skill-2',
    name: 'Meeting Notes & CRM Sync',
    summary: 'Transcribes recorded customer calls, extracts action items, and syncs key insights to the account timeline.',
    trigger: 'On call recording upload',
    status: 'active',
    instructions: 'Summarize key objections, competitor mentions, and next action items with assignees.',
    actionCount: 142,
    lastRun: 'Today, 11:20 AM',
  },
  {
    id: 'skill-3',
    name: 'Churn Risk Escalation Alert',
    summary: 'Monitors inbound communication sentiment and alerts the account manager immediately when churn risk is detected.',
    trigger: 'On inbound email or ticket',
    status: 'active',
    instructions: 'Trigger notification if negative sentiment threshold > 0.75 or customer mentions cancelling.',
    actionCount: 9,
    lastRun: 'Sep 18, 2026',
  },
];

const initialState: SettingsState = {
  theme: 'system',
  timezone: 'Automatic - Asia/Calcutta',
  rules: INITIAL_RULES,
  customSkills: INITIAL_SKILLS,
  autoBccList: ['crm-ingest@hubspot.com'],
  signatures: [
    {
      id: 'sig-1',
      accountEmail: '',
      title: 'Default Professional',
      body: 'Best regards,\n[Your name]\nRevenact | Customer Success & Revenue Intelligence',
      isDefault: true,
    },
  ],
  billing: {
    planName: 'Revenact Pro Trial',
    isTrial: true,
    trialDaysRemaining: 7,
    pricePerMonth: 59,
    trialEndDate: '26 Sept 2026',
    paymentMethodMask: '•••• 4242 (Expires 08/28)',
  },
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<'light' | 'dark' | 'system'>) {
      state.theme = action.payload;
    },
    setTimezone(state, action: PayloadAction<string>) {
      state.timezone = action.payload;
    },
    addRule(state, action: PayloadAction<Omit<PersonalizationRule, 'id' | 'createdAt'>>) {
      const newRule: PersonalizationRule = {
        id: `rule-${Date.now()}`,
        text: action.payload.text,
        isEnabled: action.payload.isEnabled ?? true,
        category: action.payload.category ?? 'general',
        createdAt: new Date().toISOString(),
      };
      state.rules.unshift(newRule);
    },
    toggleRule(state, action: PayloadAction<string>) {
      const rule = state.rules.find((r) => r.id === action.payload);
      if (rule) {
        rule.isEnabled = !rule.isEnabled;
      }
    },
    deleteRule(state, action: PayloadAction<string>) {
      state.rules = state.rules.filter((r) => r.id !== action.payload);
    },
    updateRule(state, action: PayloadAction<{ id: string; text: string; category?: PersonalizationRule['category'] }>) {
      const rule = state.rules.find((r) => r.id === action.payload.id);
      if (rule) {
        rule.text = action.payload.text;
        if (action.payload.category) rule.category = action.payload.category;
      }
    },
    addCustomSkill(state, action: PayloadAction<Omit<CustomSkill, 'id' | 'actionCount'>>) {
      const newSkill: CustomSkill = {
        id: `skill-${Date.now()}`,
        name: action.payload.name,
        summary: action.payload.summary,
        trigger: action.payload.trigger,
        status: action.payload.status ?? 'active',
        instructions: action.payload.instructions,
        actionCount: 0,
      };
      state.customSkills.unshift(newSkill);
    },
    toggleCustomSkill(state, action: PayloadAction<string>) {
      const skill = state.customSkills.find((s) => s.id === action.payload);
      if (skill) {
        skill.status = skill.status === 'active' ? 'paused' : 'active';
      }
    },
    deleteCustomSkill(state, action: PayloadAction<string>) {
      state.customSkills = state.customSkills.filter((s) => s.id !== action.payload);
    },
    addAutoBcc(state, action: PayloadAction<string>) {
      if (!state.autoBccList.includes(action.payload)) {
        state.autoBccList.push(action.payload);
      }
    },
    removeAutoBcc(state, action: PayloadAction<string>) {
      state.autoBccList = state.autoBccList.filter((email) => email !== action.payload);
    },
    saveSignature(state, action: PayloadAction<EmailSignature>) {
      const idx = state.signatures.findIndex((s) => s.id === action.payload.id);
      if (idx >= 0) {
        state.signatures[idx] = action.payload;
      } else {
        state.signatures.push(action.payload);
      }
    },
    deleteSignature(state, action: PayloadAction<string>) {
      state.signatures = state.signatures.filter((s) => s.id !== action.payload);
    },
  },
});

export const {
  setTheme,
  setTimezone,
  addRule,
  toggleRule,
  deleteRule,
  updateRule,
  addCustomSkill,
  toggleCustomSkill,
  deleteCustomSkill,
  addAutoBcc,
  removeAutoBcc,
  saveSignature,
  deleteSignature,
} = settingsSlice.actions;

export default settingsSlice.reducer;
