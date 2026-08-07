import { useState } from 'react';
import { ALL_KEYS, ALL_KEYS_MINOR } from '../lib/keys';
import {
  chartToNashville,
  diatonicTriads,
  nashvilleChartToChords,
  parseKeyName,
  preferredAccidentalForKey,
  type Accidental,
} from '../lib/theory';
import { ToolShell, CopyButton, RelatedTools } from '../components/ToolShell';
import { stashToolPayload, useToolHandoff } from '../lib/toolState';

interface NashvilleViewProps {
  navigate: (view: string) => void;
}

type Direction = 'toNumbers' | 'toChords';
type AccPref = 'auto' | Accidental;

const EXAMPLE_CHORDS = `G        D/F#     Em7      C
Amazing grace how sweet the sound`;
const EXAMPLE_NUMBERS = '1  5/7  6m7  4';

export function NashvilleView({ navigate }: NashvilleViewProps) {
  const handoff = useToolHandoff();
  const handoffKey = handoff?.key ? parseKeyName(handoff.key) : null;

  const [tonality, setTonality] = useState<'major' | 'minor'>(handoffKey?.minor ? 'minor' : 'major');
  const [keyName, setKeyName] = useState(handoffKey?.name ?? 'G');
  const [direction, setDirection] = useState<Direction>('toNumbers');
  const [input, setInput] = useState(handoff?.text ?? '');
  const [accPref, setAccPref] = useState<AccPref>('auto');

  const keys = tonality === 'minor' ? ALL_KEYS_MINOR : ALL_KEYS;
  const key = parseKeyName(keyName);
  const triads = key ? diatonicTriads(key) : [];

  const output = (() => {
    if (!key || !input.trim()) return '';
    if (direction === 'toNumbers') return chartToNashville(input, key);
    const acc: Accidental = accPref === 'auto' ? preferredAccidentalForKey(key) : accPref;
    return nashvilleChartToChords(input, key, acc);
  })();

  const unchanged = !!output && output === input;

  const switchTonality = (t: 'major' | 'minor') => {
    setTonality(t);
    setKeyName(t === 'minor' ? 'Em' : 'G');
  };

  const sendTo = (view: string) => {
    stashToolPayload({ text: direction === 'toChords' ? output || input : input, key: keyName });
    navigate(view);
  };

  return (
    <ToolShell
      navigate={navigate}
      title="Nashville Number Converter"
      subtitle="Turn a chord chart into Nashville numbers for your chosen key — or numbers back into chords. Lyrics and formatting are preserved."
    >
      <div className="tool-card">
        <div className="tool-seg" role="group" aria-label="Conversion direction">
          <button
            className={`tool-seg-btn${direction === 'toNumbers' ? ' active' : ''}`}
            aria-pressed={direction === 'toNumbers'}
            onClick={() => setDirection('toNumbers')}
          >
            Chords &#8594; numbers
          </button>
          <button
            className={`tool-seg-btn${direction === 'toChords' ? ' active' : ''}`}
            aria-pressed={direction === 'toChords'}
            onClick={() => setDirection('toChords')}
          >
            Numbers &#8594; chords
          </button>
        </div>

        <div className="tool-fields">
          <div className="field">
            <label htmlFor="nash-mode">Mode</label>
            <select
              id="nash-mode"
              value={tonality}
              onChange={(e) => switchTonality(e.target.value as 'major' | 'minor')}
            >
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="nash-key">Key</label>
            <select id="nash-key" value={keyName} onChange={(e) => setKeyName(e.target.value)}>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          {direction === 'toChords' && (
            <div className="field">
              <label htmlFor="nash-acc">Accidentals</label>
              <select
                id="nash-acc"
                value={accPref}
                onChange={(e) => setAccPref(e.target.value as AccPref)}
              >
                <option value="auto">Automatic</option>
                <option value="sharp">Sharps (#)</option>
                <option value="flat">Flats (b)</option>
              </select>
            </div>
          )}
        </div>

        <textarea
          className="tool-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            direction === 'toNumbers'
              ? 'Paste a chord chart\ne.g.  G  D/F#  Em7  C'
              : 'Paste Nashville numbers\ne.g.  1  5/7  6m7  4'
          }
          aria-label={direction === 'toNumbers' ? 'Chord chart input' : 'Nashville numbers input'}
        />
        <div className="tool-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setInput(direction === 'toNumbers' ? EXAMPLE_CHORDS : EXAMPLE_NUMBERS)}
          >
            Try an example
          </button>
          {input && (
            <button className="btn btn-ghost btn-sm" onClick={() => setInput('')}>
              Reset
            </button>
          )}
        </div>

        {output && !unchanged && (
          <div className="tool-result">
            <span className="tool-chip-label">
              {direction === 'toNumbers' ? `Numbers in ${keyName}` : `Chords in ${keyName}`}
            </span>
            <pre className="tool-output" aria-label="Converted chart">{output}</pre>
            <div className="tool-actions">
              <CopyButton getText={() => output} />
            </div>
          </div>
        )}
        {unchanged && (
          <div className="tool-result">
            <p className="tool-empty">
              Nothing to convert — no {direction === 'toNumbers' ? 'chord symbols' : 'number tokens'}{' '}
              were recognized in the text. Chord lines need mostly chords (lyric lines are left
              alone on purpose).
            </p>
          </div>
        )}

        {key && (
          <div className="tool-result">
            <span className="tool-chip-label">Degree legend &middot; {keyName}</span>
            <div className="tool-degree-table">
              {triads.map((t) => (
                <div key={t.roman} className="tool-degree-cell">
                  <span className="tool-degree-nash">{t.nashville}</span>
                  <span className="tool-degree-chord">{t.symbol}</span>
                  <span className="tool-degree-roman">{t.roman}</span>
                </div>
              ))}
            </div>
            <p className="tool-note">
              Numbers count from the major scale of the tonic, so minor keys read b3, b6 and b7 for
              their diatonic chords. Extensions and slash chords ride along (Em7 in G &#8594; 6m7,
              D/F# &#8594; 5/7).
            </p>
          </div>
        )}

        <RelatedTools
          links={[
            { label: 'Find the key first', onClick: () => sendTo('tools-key-finder') },
            { label: 'Transpose this chart', onClick: () => sendTo('tools-transpose') },
            { label: 'See all diatonic chords', onClick: () => sendTo('tools-diatonic') },
          ]}
        />
      </div>
    </ToolShell>
  );
}
