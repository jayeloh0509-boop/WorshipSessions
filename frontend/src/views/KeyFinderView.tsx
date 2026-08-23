import { useState } from 'react';
import { detectKey, parseChordSymbol, type KeyDetectionResult, type KeyCandidate } from '../lib/tools';
import { chordDegree, diatonicTriads, noteToPc, parseKeyName, scaleNotes } from '../lib/theory';
import { ToolShell, RelatedTools } from '../components/ToolShell';
import { stashToolPayload, useToolHandoff } from '../lib/toolState';

interface KeyFinderViewProps {
  navigate: (view: string) => void;
}

const EXAMPLE_INPUT = `G        D/F#     Em7      C
Amazing grace how sweet the sound
G        D        G
That saved a wretch like me`;

const CONFIDENCE_LABEL = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
} as const;

function candidateLabel(c: KeyCandidate): string {
  return `${c.key.replace(/m$/, '')} ${c.isMinor ? 'minor' : 'major'}`;
}

function evidenceFor(c: KeyCandidate, result: KeyDetectionResult): string {
  const distinct = new Set(result.chords.map((x) => x.symbol)).size;
  const parts: string[] = [`${c.matched.length} of ${distinct} distinct chords fit ${candidateLabel(c)}.`];
  const key = parseKeyName(c.key);
  const last = result.chords[result.chords.length - 1];
  const first = result.chords[0];
  if (key && last && noteToPc(last.root) === key.tonicPc) {
    parts.push(`The progression ends on ${last.symbol}, which usually marks home.`);
  } else if (key && first && noteToPc(first.root) === key.tonicPc) {
    parts.push(`It starts on ${first.symbol} but never resolves back, so listen for which chord feels like rest.`);
  } else {
    parts.push('It never lands on the tonic, so the key is inferred from chord usage alone.');
  }
  if (c.outside.length > 0) {
    parts.push(`${c.outside.join(', ')} fall${c.outside.length === 1 ? 's' : ''} outside the scale.`);
  }
  return parts.join(' ');
}

export function KeyFinderView({ navigate }: KeyFinderViewProps) {
  const handoff = useToolHandoff();
  const [input, setInput] = useState(handoff?.text ?? '');
  const [result, setResult] = useState<KeyDetectionResult | null>(null);
  const [workingIdx, setWorkingIdx] = useState(0);

  const analyze = (text: string) => {
    setResult(detectKey(text));
    setWorkingIdx(0);
  };

  const onInput = (text: string) => {
    setInput(text);
    setResult(null); // results describe the analyzed text, not the edited one
  };

  const candidates = result?.candidates.filter((c) => c.score > 0) ?? [];
  const working = candidates[workingIdx] ?? candidates[0];
  const workingKey = working ? parseKeyName(working.key) : null;
  const triads = workingKey ? diatonicTriads(workingKey) : [];

  const sendTo = (view: string) => {
    stashToolPayload({ text: input, ...(working ? { key: working.key } : {}) });
    navigate(view);
  };

  return (
    <ToolShell
      navigate={navigate}
      title="Song Key Finder"
      subtitle="Paste a chord progression, a chord chart, or ChordPro text, then hit Find key for a best guess with the evidence behind it."
    >
      <div className="tool-card">
        <textarea
          className="tool-textarea"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder={'e.g.  C  G  Am  F\nor paste a full chord sheet'}
          aria-label="Chord input"
        />
        <div className="tool-actions">
          <button className="btn btn-sm" onClick={() => analyze(input)} disabled={!input.trim()}>
            Find key
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setInput(EXAMPLE_INPUT);
              analyze(EXAMPLE_INPUT);
            }}
          >
            Try an example
          </button>
          {input && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setInput('');
                setResult(null);
              }}
            >
              Clear
            </button>
          )}
        </div>

        {result && result.chords.length === 0 && (
          <div className="tool-result">
            <p className="tool-empty">
              No chords recognized. Try chord symbols like <code>G</code>, <code>Em7</code> or <code>D/F#</code>,
              separated by spaces or on their own lines.
            </p>
          </div>
        )}

        {result && working && workingKey && (
          <div className="tool-result">
            <div className="tool-result-head">
              <span className="tool-result-key">{candidateLabel(working)}</span>
              {workingIdx === 0 ? (
                <span className={`tool-confidence ${result.confidence}`}>{CONFIDENCE_LABEL[result.confidence]}</span>
              ) : (
                <span className="tool-confidence">Chosen alternative</span>
              )}
            </div>
            <p className="tool-alt">{evidenceFor(working, result)}</p>

            {candidates.length > 1 && (
              <div className="tool-chip-section">
                <span className="tool-chip-label">Working key</span>
                <div className="tool-chips" role="group" aria-label="Choose working key">
                  {candidates.slice(0, 4).map((c, i) => (
                    <button
                      key={c.key}
                      className={`tool-chip tool-chip-btn${i === workingIdx ? ' selected' : ''}`}
                      aria-pressed={i === workingIdx}
                      onClick={() => setWorkingIdx(i)}
                    >
                      {candidateLabel(c)}
                      <span className="tool-chip-degree">{Math.round((c.score / candidates[0].score) * 100)}%</span>
                    </button>
                  ))}
                </div>
                {result.confidence !== 'high' && (
                  <p className="tool-alt">
                    Relative major/minor pairs share the same chords, so listen for which chord feels like home — then
                    pick it as the working key above.
                  </p>
                )}
              </div>
            )}

            <div className="tool-chip-section">
              <span className="tool-chip-label">Detected chords</span>
              <div className="tool-chips">
                {[...new Set(result.chords.map((c) => c.symbol))].map((sym) => {
                  const parsed = parseChordSymbol(sym);
                  const degree = parsed ? chordDegree(parsed, workingKey) : null;
                  const outside = working.outside.includes(sym);
                  return (
                    <span key={sym} className={`tool-chip${outside ? ' outside' : ''}`}>
                      {sym}
                      {degree && <span className="tool-chip-degree">{degree.roman}</span>}
                    </span>
                  );
                })}
              </div>
              {working.outside.length > 0 && (
                <p className="tool-alt">
                  Greyed chords fall outside {candidateLabel(working)} — likely borrowed chords, or the song modulates.
                </p>
              )}
            </div>

            <div className="tool-chip-section">
              <span className="tool-chip-label">Scale notes{workingKey.minor ? ' (natural minor)' : ''}</span>
              <div className="tool-chips">
                {scaleNotes(workingKey).map((n, i) => (
                  <span key={`${n}${i}`} className="tool-chip">
                    {n}
                  </span>
                ))}
              </div>
            </div>

            <div className="tool-chip-section">
              <span className="tool-chip-label">Diatonic chords</span>
              <div className="tool-degree-table">
                {triads.map((t) => (
                  <div key={t.roman} className="tool-degree-cell">
                    <span className="tool-degree-roman">{t.roman}</span>
                    <span className="tool-degree-chord">{t.symbol}</span>
                    <span className="tool-degree-nash">{t.nashville}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="tool-note">
              Key detection is a best guess from chord usage, not music-theory certainty — many progressions fit more
              than one key.
            </p>

            <RelatedTools
              links={[
                { label: 'Transpose this chart', onClick: () => sendTo('tools-transpose') },
                { label: 'Convert to Nashville', onClick: () => sendTo('tools-nashville') },
                { label: 'Find a capo position', onClick: () => sendTo('tools-capo') },
              ]}
            />
          </div>
        )}

        {!result && input.trim() && (
          <p className="tool-note">Press &ldquo;Find key&rdquo; to analyze what you pasted.</p>
        )}
      </div>
    </ToolShell>
  );
}
