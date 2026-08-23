import { useCallback, useLayoutEffect, useState } from 'react';
import {
  clearSongReadingPreferences,
  getSongReadingPreferences,
  saveSongReadingPreferences,
  sanitizeSongReadingPreferences,
  type SongReadingPreferences,
} from '../lib/storage';

type ReadingDefaults = Required<Pick<SongReadingPreferences, 'fontSize' | 'twoCol' | 'chartTone'>>;

function withDefaults(stored: SongReadingPreferences, defaults: ReadingDefaults): Required<SongReadingPreferences> {
  return {
    transpose: stored.transpose ?? 0,
    nashville: stored.nashville ?? false,
    fontSize: stored.fontSize ?? defaults.fontSize,
    twoCol: stored.twoCol ?? defaults.twoCol,
    chartTone: stored.chartTone ?? defaults.chartTone,
    autoFit: stored.autoFit ?? false,
  };
}

export function useSongReadingPreferences(songId: number | string | null, defaults: ReadingDefaults) {
  const { fontSize: defaultFontSize, twoCol: defaultTwoCol, chartTone: defaultChartTone } = defaults;
  const currentDefaults = useCallback(
    (): ReadingDefaults => ({
      fontSize: defaultFontSize,
      twoCol: defaultTwoCol,
      chartTone: defaultChartTone,
    }),
    [defaultFontSize, defaultTwoCol, defaultChartTone],
  );
  const [preferences, setPreferences] = useState<Required<SongReadingPreferences>>(() =>
    withDefaults(songId == null ? {} : getSongReadingPreferences(songId), defaults),
  );

  useLayoutEffect(() => {
    setPreferences(withDefaults(songId == null ? {} : getSongReadingPreferences(songId), currentDefaults()));
  }, [songId, currentDefaults]);

  const update = useCallback(
    (patch: Partial<SongReadingPreferences>) => {
      setPreferences((previous) => {
        const normalizedPatch = patch.nashville === true ? { ...patch, transpose: 0 } : patch;
        const sanitized = sanitizeSongReadingPreferences({ ...previous, ...normalizedPatch });
        if (songId != null) saveSongReadingPreferences(songId, sanitized);
        return withDefaults(sanitized, currentDefaults());
      });
    },
    [songId, currentDefaults],
  );

  const reset = useCallback(() => {
    if (songId != null) clearSongReadingPreferences(songId);
    setPreferences(withDefaults({}, currentDefaults()));
  }, [songId, currentDefaults]);

  return { preferences, update, reset };
}
