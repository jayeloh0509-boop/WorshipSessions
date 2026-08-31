import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Single-column is the default reading layout on every screen.
 * Users can explicitly switch to two columns with the layout control.
 */
function getLayoutDefault(): boolean {
  return false;
}

export function useTwoCol() {
  const [twoCol, setTwoCol] = useState(getLayoutDefault);
  const userHasToggled = useRef(false);

  useEffect(() => {
    const handleResize = () => {
      if (!userHasToggled.current) {
        setTwoCol(getLayoutDefault());
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleTwoCol = useCallback(() => {
    userHasToggled.current = true;
    setTwoCol((prev) => !prev);
  }, []);

  const setTwoColTo = useCallback((val: boolean) => {
    userHasToggled.current = true;
    setTwoCol(val);
  }, []);

  return { twoCol, toggleTwoCol, setTwoColTo };
}
