import { useContext } from 'react';
import { DrillContext, type DrillState } from './context';

export function useDrill(): DrillState {
  const state = useContext(DrillContext);
  if (!state) throw new Error('useDrill must be used inside DrillProvider');
  return state;
}
