interface ToolsViewProps {
  navigate: (view: string) => void;
}

interface ToolDef {
  view: string;
  title: string;
  desc: string;
  cta: string;
}

const TOOL_GROUPS: { heading: string; tools: ToolDef[] }[] = [
  {
    heading: 'Key & Transpose',
    tools: [
      {
        view: 'tools-key-finder',
        title: 'Song Key Finder',
        desc: 'Paste a chord progression or chart and get a best guess at the key, with the evidence behind it.',
        cta: 'Open Key Finder',
      },
      {
        view: 'tools-transpose',
        title: 'Transpose Calculator',
        desc: 'Move a chart to a new key or shift by semitones — lyrics and formatting stay untouched.',
        cta: 'Open Transpose',
      },
      {
        view: 'tools-capo',
        title: 'Capo Chart Pro',
        desc: 'Match a capo fret to easy open shapes for any sounding key, with a fretboard view and chord preview.',
        cta: 'Open Capo Chart',
      },
    ],
  },
  {
    heading: 'Theory & Arrangement',
    tools: [
      {
        view: 'tools-nashville',
        title: 'Nashville Number Converter',
        desc: 'Turn chord charts into Nashville numbers for any key — or numbers back into chords.',
        cta: 'Open Nashville Converter',
      },
      {
        view: 'tools-relative',
        title: 'Relative Key Finder',
        desc: 'Find the relative major or minor of any key and see what the two share.',
        cta: 'Open Relative Keys',
      },
      {
        view: 'tools-diatonic',
        title: 'Diatonic Chord Finder',
        desc: 'All seven chords that live in a key, with Roman numerals, Nashville degrees and common progressions.',
        cta: 'Open Diatonic Chords',
      },
    ],
  },
];

export function ToolsView({ navigate }: ToolsViewProps) {
  return (
    <div className="tools-page">
      <h1 className="tools-title">Tools</h1>
      <p className="tools-subtitle">Helpers for rehearsal and worship planning</p>
      {TOOL_GROUPS.map((group) => (
        <section key={group.heading} className="tool-launch-section">
          <h2 className="tool-launch-heading">{group.heading}</h2>
          <div className="tool-launch-grid">
            {group.tools.map((t) => (
              <button key={t.view} className="tool-launch-card" onClick={() => navigate(t.view)}>
                <span className="tool-launch-title">{t.title}</span>
                <span className="tool-launch-desc">{t.desc}</span>
                <span className="tool-launch-cta" aria-hidden="true">
                  {t.cta} &#8594;
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
