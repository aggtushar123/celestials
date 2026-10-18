import { createContext } from 'react';
import type { DrillRequest } from './types';

export interface DrillState {
  current: DrillRequest | null;
  open: (request: DrillRequest, trigger?: HTMLElement | null) => void;
  close: () => void;
}

export const DrillContext = createContext<DrillState | null>(null);
