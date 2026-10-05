import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

interface Props {
  viewportRef: RefObject<HTMLDivElement | null>;
  chartKey: string;
  onNavigate?: () => void;
}

// Read live nodes each time: ChordSheet can replace its HTML after a player
// render, so retaining elements in state creates detached scroll targets.
function getLabels(viewport: HTMLDivElement) {
  return Array.from(viewport.querySelectorAll<HTMLElement>('.label, .section-label'));
}

export function LiveSectionTracker({ viewportRef, chartKey, onNavigate }: Props) {
  const [position, setPosition] = useState({ labels: [] as string[], active: 0 });
  const updateRef = useRef(() => {});

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () => {
      const nodes = getLabels(viewport);
      const bounds = viewport.getBoundingClientRect();
      let active = 0;
      nodes.forEach((node, index) => {
        const rect = node.getBoundingClientRect();
        if (rect.top <= bounds.top + 12 && rect.left < bounds.right) active = index;
      });
      const labels = nodes.map(node => node.textContent?.trim().replace(/:$/, '') || 'Section');
      setPosition(previous => previous.active === active && previous.labels.length === labels.length &&
        previous.labels.every((label, index) => label === labels[index]) ? previous : { labels, active });
    };
    updateRef.current = update;
    viewport.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(viewport);
    update();
    return () => {
      viewport.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
      updateRef.current = () => {};
    };
  }, [chartKey, viewportRef]);

  const { labels, active } = position;
  if (!labels.length) return null;
  const nextLabel = labels[active + 1];
  const jump = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = getLabels(viewport)[active + 1];
    if (!next) return;
    onNavigate?.();
    const top = Math.max(0, viewport.scrollTop + next.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 4);
    viewport.scrollTo({ top, behavior: 'instant' });
    updateRef.current();
  };
  return (
    <div className="live-section-tracker" aria-label="Live chart section">
      <div className="live-section-position" role="status" aria-live="polite">
        <span className="live-section-current" aria-label="Current chart section">{labels[active]}</span>
        <span className="live-section-occurrence">{active + 1} / {labels.length}</span>
      </div>
      {nextLabel ? <button type="button" onClick={jump} aria-label={`Next section: ${nextLabel}`}>Next: <strong>{nextLabel}</strong> ›</button> : <span className="live-section-end">End of chart</span>}
    </div>
  );
}
