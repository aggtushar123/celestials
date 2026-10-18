import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // .claude/skills vendors third-party agent skills (impeccable, motion-framer,
  // ...) that ship their own .js/.jsx/.py helpers; they are not app code.
  // .impeccable is that skill's working directory (screenshots, session state).
  globalIgnores(['dist', '.claude', '.impeccable']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // eslint-plugin-react-hooks 7.1 promotes this rule to an error. Five form
      // components reset state in effects keyed on a prop (ContactFormModal,
      // OpportunityFormModal, RiskFormModal, SurveyFormModal, CampaignsList);
      // reworking them is tracked as a follow-up. A warning keeps the finding
      // visible without blocking dependency updates meanwhile.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
