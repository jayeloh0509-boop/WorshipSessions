import { useState, useCallback } from 'react';
import { getStoredChartTone, setStoredChartTone } from '../lib/storage';

export function useChartTone() {
  const [tone, setTone] = useState<'paper' | 'dark'>(() => getStoredChartTone());

  const toggleTone = useCallback(() => {
    setTone((prev) => {
      const next = prev === 'paper' ? 'dark' : 'paper';
      setStoredChartTone(next);
      return next;
    });
  }, []);

  return { tone, toggleTone };
}
