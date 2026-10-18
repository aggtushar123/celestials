import { TYPE_LABEL } from '../../features/surveys/questions';
import type { SurveyType } from '../../features/surveys/surveyTypes';
import { Badge } from '../ui';

/** A survey type is a word, not a status: a neutral badge. */
export function TypeChip({ type }: { type: SurveyType }) {
  return <Badge>{TYPE_LABEL[type]}</Badge>;
}
