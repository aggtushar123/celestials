import { useCallback, useState } from 'react';
import type { ColumnId } from '../tableData';
import { readPins, togglePin, writePins } from '../../../features/organizations/pinnedFields';
import { useAppSelector } from '../../../hooks';

export function usePins() {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const [pins, setPins] = useState<ColumnId[]>(() => readPins(userId));

  const toggle = useCallback(
    (id: ColumnId) => {
      const next = togglePin(pins, id);
      writePins(userId, next);
      setPins(next);
    },
    [pins, userId],
  );

  return { pins, toggle };
}
