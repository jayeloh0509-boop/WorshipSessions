import { useState } from 'react';
import { ALL_KEYS, ALL_KEYS_MINOR } from '../lib/keys';
import {
  diatonicTriads,
  parseKeyName,
  renderProgression,
  scaleNotes,
  WORSHIP_PROGRESSIONS_MAJOR,
  WORSHIP_PROGRESSIONS_MINOR,
} from '../lib/theory';
import { ToolShell, CopyButton, RelatedTools } from '../components/ToolShell';
import { stashToolPayload, useToolHandoff } from '../lib/toolState';

interface DiatonicChordsViewProps {
  navigate: (view: string) => void;
}

const QUALITY_LABEL = { major: 'Major', minor: 'Minor', dim: 'Diminished' } as const;

export function DiatonicChordsView({ navigate }: DiatonicChordsViewProps) {
  const handoff = useToolHandoff();
  const handoffKey = handoff?.key ? parseKeyName(handoff.key) : null;

  const [tonality, setTonality] = useState<'major' | 'minor'>(handoffKey?.minor ? 'minor' : 'major');
  const [keyName, setKeyName] = useState(handoffKey?.name ?? 'G');

  const keys = tonality === 'minor' ? ALL_KEYS_MINOR : ALL_KEYS;
  const key = parseKeyName(keyName);
  const triads = key ? diatonicTriads(key) : [];
  const progressions = tonality === 'minor' ? WORSHIP_PROGRESSIONS_MINOR : WORSHIP_PROGRESSIONS_MAJOR;

  const switchTonality = (t: 'major' | 'minor') => {
    setTonality(t);
    setKeyName(t === 'minor' ? 'Em' : 'G');
  };

  const sendTo = (view: string, payload: { text?: string; key?: string }) => {
    stashToolPayload(payload);
    navigate(view);
  };

  return (
    <ToolShell
      navigate={navigate}
      title="Diatonic Chord Finder"
      subtitle="Every chord that lives naturally in a key, with its notes, Roman numeral and Nashville number — plus common progressions rendered in that key."
    >
      <div className="tool-card">
        <div className="tool-fields">
          <div className="field">
            <label htmlFor="dia-mode">Mode</label>
            <select
              id="dia-mode"
              value={tonality}
              onChange={(e) => switchTonality(e.target.value as 'major' | 'minor')}
            >
              <option value="major">Major</option>
              <option value="minor">Minor (natural)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dia-key">Key</label>
            <select id="dia-key" value={keyName} onChange={(e) => setKeyName(e.target.value)}>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>

        {key && (
          <>
            <div className="tool-chip-section">
              <span className="tool-chip-label">Scale notes{key.minor ? ' (natural minor)' : ''}</span>
              <div className="tool-chips">
                {scaleNotes(key).map((n, i) => (
                  <span key={`${n}${i}`} className="tool-chip">
                    {n}
                  </span>
                ))}
              </div>
            </div>

            <div className="diatonic-grid">
              {triads.map((t) => (
                <div key={t.roman} className="diatonic-card">
                  <div className="diatonic-card-head">
                    <span className="diatonic-symbol">{t.symbol}</span>
                    <span className="diatonic-roman">{t.roman}</span>
                  </div>
                  <div className="diatonic-meta">
                    <span className="diatonic-quality">{QUALITY_LABEL[t.quality]}</span>
                    <span className="diatonic-nash">Nashville {t.nashville}</span>
                  </div>
                  <div className="tool-chips">
                    {t.notes.map((n, i) => (
                      <span key={`${n}${i}`} className="tool-chip">
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {key.minor && (
              <p className="tool-note">
                Worship songs in minor keys usually swap the v chord for a major V (harmonic minor) when they want a
                stronger pull back to {key.name}.
              </p>
            )}

            <div className="tool-result">
              <span className="tool-chip-label">Common progressions in {key.name}</span>
              {progressions.map((p) => {
                const chords = renderProgression(p.tokens, key);
                const text = chords.join('  ');
                return (
                  <div key={p.label} className="prog-row">
                    <span className="prog-label">{p.label}</span>
                    <div className="tool-chips">
                      {chords.map((c, i) => (
                        <span key={`${c}${i}`} className="tool-chip">
                          {c}
                        </span>
                      ))}
                    </div>
                    <CopyButton getText={() => text} label="Copy" className="btn btn-ghost btn-sm prog-copy" />
                  </div>
                );
              })}
            </div>

            <RelatedTools
              links={[
                {
                  label: 'Find the relative key',
                  onClick: () => sendTo('tools-relative', { key: key.name }),
                },
                {
                  label: 'Convert to Nashville',
                  onClick: () => sendTo('tools-nashville', { key: key.name }),
                },
                {
                  label: 'Find a capo position',
                  onClick: () => sendTo('tools-capo', { key: key.name }),
                },
              ]}
            />
          </>
        )}
      </div>
    </ToolShell>
  );
}
