import React, { useEffect, useRef, useState } from 'react';
import { fontScaleValue } from '../lib/chords';

interface ChordSheetProps {
  html: string;
  twoCol?: boolean;
  fontSize?: number;
  autoFit?: boolean; // Kept for class naming if needed
  tone?: 'default' | 'paper' | 'dark';
  outputId?: string;
}

export function ChordSheet({
  html,
  twoCol,
  fontSize,
  autoFit,
  tone = 'default',
  outputId = 'chord-output',
}: ChordSheetProps) {
  // Manual/Legacy Scaling Logic
  const manualScale = fontScaleValue(fontSize || 0);

  const style: React.CSSProperties = manualScale
    ? ({ '--font-scale': String(manualScale) } as React.CSSProperties)
    : {};

  // Premium: chords briefly settle in when the rendered sheet changes (transpose, notation)
  const [settle, setSettle] = useState(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSettle(true);
    const t = setTimeout(() => setSettle(false), 360);
    return () => clearTimeout(t);
  }, [html]);

  const cls = `chord-sheet-wrap${twoCol ? ' two-col' : ''}${autoFit ? ' fitted-mode' : ''}${settle ? ' chord-settle' : ''}${tone === 'paper' ? ' chord-sheet-paper' : tone === 'dark' ? ' chord-sheet-dark' : ''}`;

  return (
    <div className={cls} style={style}>
      <div id={outputId} className="chord-output" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
