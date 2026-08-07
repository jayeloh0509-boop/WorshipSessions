import { useMemo, useState } from 'react';
import { ALL_KEYS, ALL_KEYS_MINOR } from '../lib/keys';
import {
  capoForShape,
  capoOptions,
  capoPracticality,
  OPEN_SHAPES_MAJOR,
  OPEN_SHAPES_MINOR,
  type CapoOption,
} from '../lib/tools';
import { parseKeyName, preferredAccidentalForKey, transposeChart, type Accidental } from '../lib/theory';
import { ToolShell, CopyButton, RelatedTools } from '../components/ToolShell';
import { stashToolPayload, useToolHandoff } from '../lib/toolState';

interface CapoCalculatorViewProps {
  navigate: (view: string) => void;
}

type Mode = 'explore' | 'shape';
type AccPref = 'auto' | Accidental;

const EXAMPLE_CHART = 'Bb  F/A  Gm7  Eb\nBb  Eb  F  Bb';

export function CapoCalculatorView({ navigate }: CapoCalculatorViewProps) {
  const handoff = useToolHandoff();
  const handoffKey = handoff?.key ? parseKeyName(handoff.key) : null;

  const [mode, setMode] = useState<Mode>('explore');
  const [tonality, setTonality] = useState<'major' | 'minor'>(handoffKey?.minor ? 'minor' : 'major');
  const [target, setTarget] = useState(handoffKey?.name ?? 'G');
  const [shape, setShape] = useState(handoffKey?.minor ? 'Em' : 'G');
  const [accPref, setAccPref] = useState<AccPref>('auto');
  const [preview, setPreview] = useState(handoff?.text ?? '');
  const [selected, setSelected] = useState(0);

  const targetKeys = tonality === 'minor' ? ALL_KEYS_MINOR : ALL_KEYS;
  const shapes = tonality === 'minor' ? OPEN_SHAPES_MINOR : OPEN_SHAPES_MAJOR;

  const options = useMemo<CapoOption[]>(() => {
    if (mode === 'shape') {
      const opt = capoForShape(target, shape);
      const rest = capoOptions(target).filter((o) => o.shape !== opt?.shape);
      return opt ? [opt, ...rest] : rest;
    }
    return capoOptions(target);
  }, [mode, target, shape]);

  const selectedOption = options[Math.min(selected, Math.max(options.length - 1, 0))];

  const previewOutput = useMemo(() => {
    if (!selectedOption || !preview.trim()) return '';
    const shapeKey = parseKeyName(selectedOption.shape);
    const acc: Accidental =
      accPref === 'auto' ? (shapeKey ? preferredAccidentalForKey(shapeKey) : 'sharp') : accPref;
    return transposeChart(preview, -selectedOption.capo, acc);
  }, [preview, selectedOption, accPref]);

  const switchTonality = (t: 'major' | 'minor') => {
    setTonality(t);
    setTarget(t === 'minor' ? 'Em' : 'G');
    setShape(t === 'minor' ? 'Em' : 'G');
    setSelected(0);
  };

  const sendTo = (view: string) => {
    stashToolPayload({ text: preview, key: target });
    navigate(view);
  };

  return (
    <ToolShell
      navigate={navigate}
      title="Capo Chart Pro"
      subtitle="Match a capo fret to easy open shapes: explore every practical option for a sounding key, or start from the shapes you want to play."
    >
      <div className="tool-card">
        <div className="tool-seg" role="group" aria-label="Calculator mode">
          <button
            className={`tool-seg-btn${mode === 'explore' ? ' active' : ''}`}
            aria-pressed={mode === 'explore'}
            onClick={() => {
              setMode('explore');
              setSelected(0);
            }}
          >
            Explore options
          </button>
          <button
            className={`tool-seg-btn${mode === 'shape' ? ' active' : ''}`}
            aria-pressed={mode === 'shape'}
            onClick={() => {
              setMode('shape');
              setSelected(0);
            }}
          >
            Pick my shapes
          </button>
        </div>

        <div className="tool-fields">
          <div className="field">
            <label htmlFor="capo-mode">Mode</label>
            <select
              id="capo-mode"
              value={tonality}
              onChange={(e) => switchTonality(e.target.value as 'major' | 'minor')}
            >
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="capo-target">Sounding key</label>
            <select
              id="capo-target"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setSelected(0);
              }}
            >
              {targetKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          {mode === 'shape' && (
            <div className="field">
              <label htmlFor="capo-shape">Play shapes of</label>
              <select
                id="capo-shape"
                value={shape}
                onChange={(e) => {
                  setShape(e.target.value);
                  setSelected(0);
                }}
              >
                {shapes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="capo-acc">Accidentals</label>
            <select id="capo-acc" value={accPref} onChange={(e) => setAccPref(e.target.value as AccPref)}>
              <option value="auto">Automatic</option>
              <option value="sharp">Sharps (#)</option>
              <option value="flat">Flats (b)</option>
            </select>
          </div>
        </div>

        <div className="tool-result">
          <span className="tool-chip-label">Fretboard &middot; capo positions for {target}</span>
          <div className="capo-strip" role="group" aria-label={`Capo positions for ${target}`}>
            {Array.from({ length: 13 }, (_, fret) => {
              const opt = options.find((o) => o.capo === fret);
              const isSelected = selectedOption?.capo === fret;
              return (
                <div key={fret} className={`capo-fret${opt ? ' has-option' : ''}${isSelected ? ' selected' : ''}`}>
                  {opt ? (
                    <button
                      className="capo-fret-marker"
                      aria-pressed={isSelected}
                      aria-label={`Capo ${fret === 0 ? 'off' : fret}: play ${opt.shape} shapes`}
                      onClick={() => setSelected(options.indexOf(opt))}
                    >
                      {opt.shape}
                    </button>
                  ) : (
                    <span className="capo-fret-empty" aria-hidden="true" />
                  )}
                  <span className="capo-fret-num">{fret}</span>
                </div>
              );
            })}
          </div>
          <p className="tool-note">
            Fret 12 repeats the no-capo fingering an octave up, so options stop at fret 11.
          </p>

          {options.map((o, i) => {
            const prac = capoPracticality(o.capo);
            const isSelected = o === selectedOption;
            return (
              <button
                key={`${o.shape}-${o.capo}`}
                className={`capo-option${isSelected ? ' selected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => setSelected(i)}
              >
                <span className="capo-pos">{o.capo === 0 ? 'No capo' : `Capo ${o.capo}`}</span>
                <span className="capo-shape">
                  play <strong>{o.shape}</strong> shapes &rarr; sounds like {o.soundingKey}
                </span>
                <span className={`capo-tier capo-tier-${prac.tier}`}>{prac.label}</span>
                <span className="capo-rationale">{prac.note}</span>
              </button>
            );
          })}
        </div>

        <div className="tool-result">
          <span className="tool-chip-label">Chord preview (optional)</span>
          <p className="tool-desc">
            Paste the chart in the sounding key ({target}) to see the shapes you actually play with
            the selected capo. Suffixes and slash chords are kept.
          </p>
          <textarea
            className="tool-textarea"
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            placeholder={'e.g.  Bb  F/A  Gm7  Eb'}
            aria-label="Chart preview input"
          />
          <div className="tool-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setPreview(EXAMPLE_CHART)}>
              Try an example
            </button>
            {preview && (
              <button className="btn btn-ghost btn-sm" onClick={() => setPreview('')}>
                Clear
              </button>
            )}
          </div>
          {previewOutput && selectedOption && (
            <>
              <span className="tool-chip-label">
                You play ({selectedOption.capo === 0 ? 'no capo' : `capo ${selectedOption.capo}`},{' '}
                {selectedOption.shape} shapes)
              </span>
              <pre className="tool-output" aria-label="Player-facing chords">{previewOutput}</pre>
              <div className="tool-actions">
                <CopyButton getText={() => previewOutput} label="Copy shapes chart" />
              </div>
            </>
          )}
        </div>

        <RelatedTools
          links={[
            { label: 'Transpose instead', onClick: () => sendTo('tools-transpose') },
            { label: 'Check the key first', onClick: () => sendTo('tools-key-finder') },
          ]}
        />
      </div>
    </ToolShell>
  );
}
