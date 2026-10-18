import { AGENTS } from '../../features/agents/agentsText';
import { SettingsNote } from '../ui';

/** One line above the agents while AI is off: a real consequence, so the
 *  warning icon, with the words in ink (amber text fails contrast). */
export function AiOffNotice() {
  return <SettingsNote icon="warning">{AGENTS.AI_OFF}</SettingsNote>;
}
