import { useState } from 'react';
import { ALL_KEYS, ALL_KEYS_MINOR } from '../lib/keys';
import { parseKeyName, relativeKey, scaleNotes } from '../lib/theory';
import { ToolShell, RelatedTools } from '../components/ToolShell';
import { stashToolPayload, useToolHandoff } from '../lib/toolState';

interface RelativeKeyViewProps {
  navigate: (view: string) => void;
}

function displayName(name: string): string {
  return name.endsWith('m') ? `${name.slice(0, -1)} minor` : `${name} major`;
}

export function RelativeKeyView({ navigate }: RelativeKeyViewProps) {
  const handoff = useToolHandoff();
  const handoffKey = handoff?.key ? parseKeyName(handoff.key) : null;

  const [tonality, setTonality] = useState<'major' | 'minor'>(handoffKey?.minor ? 'minor' : 'major');
  const [keyName, setKeyName] = useState(handoffKey?.name ?? 'G');

  const keys = tonality === 'minor' ? ALL_KEYS_MINOR : ALL_KEYS;
  const key = parseKeyName(keyName);
  const rel = key ? relativeKey(key) : null;
  const notes = key ? scaleNotes(key) : [];

  const switchTonality = (t: 'major' | 'minor') => {
    setTonality(t);
    setKeyName(t === 'minor' ? 'Em' : 'G');
  };

  const sendTo = (view: string, k: string) => {
    stashToolPayload({ key: k });
    navigate(view);
  };

  const majorName = key ? (key.minor ? rel!.name : key.name) : '';
  const minorName = key ? (key.minor ? key.name : rel!.name) : '';

  return (
    <ToolShell
      navigate={navigate}
      title="Relative Key Finder"
      subtitle="Every key shares its notes and chords with one relative — find it, see what they share, and plan smooth transitions."
    >
      <div className="tool-card">
        <div className="tool-fields">
          <div className="field">
            <label htmlFor="rel-mode">Mode</label>
            <select
              id="rel-mode"
              value={tonality}
              onChange={(e) => switchTonality(e.target.value as 'major' | 'minor')}
            >
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="rel-key">Key</label>
            <select id="rel-key" value={keyName} onChange={(e) => setKeyName(e.target.value)}>
              {keys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>

        {key && rel && (
          <div className="tool-result">
            <div className="tool-result-head">
              <span className="tool-result-key">
                {displayName(key.name)} &#8596; {displayName(rel.name)}
              </span>
            </div>
            <p className="tool-alt">
              {displayName(key.name)} and {displayName(rel.name)} share the same key signature —
              seven notes, seven chords. Only the note that feels like &ldquo;home&rdquo; changes.
            </p>

            <div className="tool-chip-section">
              <span className="tool-chip-label">Shared scale notes</span>
              <div className="tool-chips">
                {notes.map((n, i) => (
                  <span key={`${n}${i}`} className="tool-chip">
                    {n}
                  </span>
                ))}
              </div>
            </div>

            <div className="tool-chip-section">
              <span className="tool-chip-label">Tonic relationship</span>
              <p className="tool-alt">
                {minorName.replace(/m$/, '')} is the 6th degree (vi) of {majorName} major — three
                semitones below its tonic. Play the same chords and land on{' '}
                {minorName.replace(/m$/, '')}m instead of {majorName} to shift the center.
              </p>
            </div>

            <div className="tool-chip-section">
              <span className="tool-chip-label">Using it in a set</span>
              <p className="tool-alt">
                Because the chords are identical, you can drift between {majorName} major and{' '}
                {minorName} without a hard modulation: end a brighter song on the vi chord (
                {minorName}) to set up a reflective one, or resolve a minor progression to{' '}
                {majorName} to lift the room. The band plays the same shapes throughout.
              </p>
            </div>

            <RelatedTools
              links={[
                {
                  label: `Diatonic chords of ${key.name}`,
                  onClick: () => sendTo('tools-diatonic', key.name),
                },
                { label: 'Find a capo position', onClick: () => sendTo('tools-capo', key.name) },
                { label: 'Transpose a chart', onClick: () => sendTo('tools-transpose', key.name) },
              ]}
            />
          </div>
        )}
      </div>
    </ToolShell>
  );
}
