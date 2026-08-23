import { useMemo, useState } from 'react';
import { ALL_KEYS, ALL_KEYS_MINOR } from '../lib/keys';
import { detectKey } from '../lib/tools';
import {
  parseKeyName,
  pcToName,
  preferredAccidentalForKey,
  semitonesBetween,
  transposeChart,
  keyInfo,
  type Accidental,
} from '../lib/theory';
import { ToolShell, CopyButton, RelatedTools } from '../components/ToolShell';
import { stashToolPayload, useToolHandoff } from '../lib/toolState';

interface TransposeViewProps {
  navigate: (view: string) => void;
}

type ShiftMode = 'key' | 'steps';
type AccPref = 'auto' | Accidental;

const EXAMPLE_INPUT = `{key: G}
G        D/F#     Em7      C
Amazing grace how sweet the sound`;

function KeyOptions() {
  return (
    <>
      <optgroup label="Major">
        {ALL_KEYS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </optgroup>
      <optgroup label="Minor">
        {ALL_KEYS_MINOR.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </optgroup>
    </>
  );
}

export function TransposeView({ navigate }: TransposeViewProps) {
  const handoff = useToolHandoff();
  const [input, setInput] = useState(handoff?.text ?? '');
  const [source, setSource] = useState(handoff?.key ?? '');
  const [mode, setMode] = useState<ShiftMode>('key');
  const [target, setTarget] = useState('');
  const [steps, setSteps] = useState(0);
  const [accPref, setAccPref] = useState<AccPref>('auto');

  const detectSource = () => {
    const best = detectKey(input).candidates[0];
    if (best) {
      setSource(best.key);
      if (!target) setTarget(best.key);
    }
  };

  const delta = useMemo(() => {
    if (mode === 'steps') return steps;
    if (!source || !target) return null;
    return semitonesBetween(source, target);
  }, [mode, steps, source, target]);

  const output = useMemo(() => {
    if (!input.trim() || delta === null) return '';
    let acc: Accidental = 'sharp';
    if (accPref !== 'auto') {
      acc = accPref;
    } else if (mode === 'key' && target) {
      const t = parseKeyName(target);
      if (t) acc = preferredAccidentalForKey(t);
    } else if (source) {
      const s = parseKeyName(source);
      if (s) acc = preferredAccidentalForKey(keyInfo(s.tonicPc + steps, s.minor));
    }
    return transposeChart(input, delta, acc);
  }, [input, delta, accPref, mode, target, source, steps]);

  const newKeyLabel = useMemo(() => {
    if (delta === null) return '';
    if (mode === 'key') return target;
    const s = source ? parseKeyName(source) : null;
    if (!s) return '';
    return pcToName(s.tonicPc + steps) + (s.minor ? 'm' : '');
  }, [delta, mode, target, source, steps]);

  const reset = () => {
    setInput('');
    setSource('');
    setTarget('');
    setSteps(0);
    setMode('key');
    setAccPref('auto');
  };

  const sendTo = (view: string) => {
    stashToolPayload({
      text: output || input,
      key: (mode === 'key' ? target : newKeyLabel) || source,
    });
    navigate(view);
  };

  return (
    <ToolShell
      navigate={navigate}
      title="Transpose Calculator"
      subtitle="Move a progression or full chart to a new key. Lyrics, spacing and ChordPro directives stay put — only the chords change."
    >
      <div className="tool-card">
        <textarea
          className="tool-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={'Paste chords, a chart, or ChordPro\ne.g.  G  D/F#  Em7  C'}
          aria-label="Chart input"
        />
        <div className="tool-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setInput(EXAMPLE_INPUT)}>
            Try an example
          </button>
          <button className="btn btn-ghost btn-sm" onClick={detectSource} disabled={!input.trim()}>
            Detect key
          </button>
          {(input || source || target) && (
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              Reset
            </button>
          )}
        </div>

        <div className="tool-fields">
          <div className="field">
            <label htmlFor="tr-source">From key</label>
            <select id="tr-source" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Select&hellip;</option>
              <KeyOptions />
            </select>
          </div>
          <div className="field">
            <label htmlFor="tr-shift-mode">Shift by</label>
            <select id="tr-shift-mode" value={mode} onChange={(e) => setMode(e.target.value as ShiftMode)}>
              <option value="key">Target key</option>
              <option value="steps">Semitones</option>
            </select>
          </div>
          {mode === 'key' ? (
            <div className="field">
              <label htmlFor="tr-target">To key</label>
              <select id="tr-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Select&hellip;</option>
                <KeyOptions />
              </select>
            </div>
          ) : (
            <div className="field">
              <label htmlFor="tr-steps">Semitones</label>
              <div className="tool-stepper">
                <button
                  className="btn btn-ghost btn-sm"
                  aria-label="Down one semitone"
                  onClick={() => setSteps((s) => Math.max(-11, s - 1))}
                >
                  &minus;
                </button>
                <span id="tr-steps" className="tool-stepper-value" aria-live="polite">
                  {steps > 0 ? `+${steps}` : steps} st
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  aria-label="Up one semitone"
                  onClick={() => setSteps((s) => Math.min(11, s + 1))}
                >
                  +
                </button>
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="tr-acc">Accidentals</label>
            <select id="tr-acc" value={accPref} onChange={(e) => setAccPref(e.target.value as AccPref)}>
              <option value="auto">Automatic</option>
              <option value="sharp">Sharps (#)</option>
              <option value="flat">Flats (b)</option>
            </select>
          </div>
        </div>

        {mode === 'key' && input.trim() && (!source || !target) && (
          <p className="tool-note">
            Pick both keys (or use &ldquo;Detect key&rdquo;) — or switch to semitone shift if you just want to move
            everything up or down.
          </p>
        )}

        {output && (
          <div className="tool-result">
            <div className="tool-result-head">
              <span className="tool-result-key">{newKeyLabel || 'Result'}</span>
              {delta !== null && (
                <span className="tool-confidence">
                  {delta === 0 ? 'respelled' : delta > 0 ? `+${delta} semitones` : `${delta} semitones`}
                </span>
              )}
            </div>
            <pre className="tool-output" aria-label="Transposed chart">
              {output}
            </pre>
            <div className="tool-actions">
              <CopyButton getText={() => output} />
            </div>
            <RelatedTools
              links={[
                { label: 'Verify the key', onClick: () => sendTo('tools-key-finder') },
                { label: 'Convert to Nashville', onClick: () => sendTo('tools-nashville') },
                { label: 'Find a capo position', onClick: () => sendTo('tools-capo') },
              ]}
            />
          </div>
        )}
      </div>
    </ToolShell>
  );
}
