import { useState, useCallback, useMemo } from 'react';
import { renderChordPro, getSongKey, songHasKey } from '../lib/chords';
import { getTransposeForKeyTarget } from '../lib/keys';

export function useChordRenderer(content: string) {
  const [transpose, setTranspose] = useState(0);
  const [nashville, setNashville] = useState(false);

  const renderedHtml = useMemo(() => renderChordPro(content, transpose, nashville), [content, transpose, nashville]);

  const currentKey = useMemo(() => getSongKey(content, transpose), [content, transpose]);

  const hasKey = useMemo(() => songHasKey(content, transpose), [content, transpose]);

  const doTranspose = useCallback((delta: number) => {
    setTranspose((prev) => prev + delta);
  }, []);

  const resetTranspose = useCallback(() => {
    setTranspose(0);
  }, []);

  const toggleNashville = useCallback((checked: boolean) => {
    setNashville(checked);
    if (checked) setTranspose(0);
  }, []);

  const pickKey = useCallback(
    (targetKey: string) => {
      const nextTranspose = getTransposeForKeyTarget(transpose, currentKey, targetKey);
      setTranspose(nextTranspose);
      return nextTranspose;
    },
    [currentKey, transpose],
  );

  return {
    transpose,
    setTranspose,
    nashville,
    setNashville,
    renderedHtml,
    currentKey,
    hasKey,
    doTranspose,
    resetTranspose,
    toggleNashville,
    pickKey,
  };
}
