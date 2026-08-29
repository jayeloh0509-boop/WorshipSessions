import { useEffect, useRef, useState } from 'react';
import { clampTempo, diagramShape } from '../lib/musician-tools';

interface MusicianToolsProps {
  chords: string[];
  bpm?: number | null;
  simplified: boolean;
  onSimplifiedChange: (value: boolean) => void;
}

function ChordDiagram({ chord }: { chord: string }) {
  const shape = diagramShape(chord);
  return (
    <div className="ug-chord-card">
      <strong>{chord}</strong>
      {shape ? (
        <div className="ug-fretboard" aria-label={`${chord} guitar chord diagram`}>
          {shape.frets.map((fret, string) => (
            <span key={string} className="ug-string">
              <i className={fret === 'x' ? 'muted' : fret === 0 ? 'open' : ''}>{fret}</i>
            </span>
          ))}
        </div>
      ) : (
        <span className="ug-shape-unavailable">Shape unavailable</span>
      )}
    </div>
  );
}

export function MusicianTools({ chords, bpm, simplified, onSimplifiedChange }: MusicianToolsProps) {
  const [open, setOpen] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [tempo, setTempo] = useState(clampTempo(bpm || 80));
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => setTempo(clampTempo(bpm || 80)), [bpm]);

  const stopMetronome = async () => {
    setMetronome(false);
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio && audio.state !== 'closed') await audio.close().catch(() => {});
  };

  const toggleMetronome = async () => {
    if (metronome) {
      await stopMetronome();
      return;
    }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    const audio = audioRef.current || new AudioCtor();
    audioRef.current = audio;
    if (audio.state === 'suspended') await audio.resume().catch(() => {});
    setMetronome(true);
  };

  useEffect(() => {
    if (!metronome) return;
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.state !== 'running') return;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.05);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.06);
    };
    tick();
    const timer = window.setInterval(tick, 60_000 / tempo);
    return () => window.clearInterval(timer);
  }, [metronome, tempo]);

  useEffect(() => () => void audioRef.current?.close(), []);

  return (
    <section className="ug-musician-tools" aria-label="Musician tools">
      <div className="ug-quick-tools">
        <button type="button" aria-pressed={simplified} onClick={() => onSimplifiedChange(!simplified)}>
          <span>◇</span> Simplify
        </button>
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span>▦</span> Chords
        </button>
        <button type="button" aria-pressed={metronome} onClick={() => void toggleMetronome()}>
          <span>♩</span> Metronome
        </button>
      </div>
      {metronome && (
        <div className="ug-metronome" aria-label="Metronome controls">
          <button type="button" onClick={() => setTempo((value) => clampTempo(value - 1))} aria-label="Decrease tempo">
            −
          </button>
          <strong>{tempo} BPM</strong>
          <button type="button" onClick={() => setTempo((value) => clampTempo(value + 1))} aria-label="Increase tempo">
            +
          </button>
          <span className="ug-metronome-pulse" aria-hidden="true" />
        </div>
      )}
      {open && (
        <div className="ug-chord-library" aria-label="Chords in this song">
          {chords.length ? (
            chords.map((chord) => <ChordDiagram key={chord} chord={chord} />)
          ) : (
            <span>No chords found</span>
          )}
        </div>
      )}
    </section>
  );
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
