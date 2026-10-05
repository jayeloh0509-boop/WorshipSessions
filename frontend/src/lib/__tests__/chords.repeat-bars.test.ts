import { prepareSong, renderChordPro } from '../chords';

const intro = '{key: E}\nIntro\n| E - - - | - - - - | C#m7 - - - | - - - - |\n| F#m7 - - - | - - - - | A - - - | - - - - | x2';

describe('bar notation with trailing repeat markers', () => {
  it('renders both You Are The One intro lines without losing sharp chords or timing', () => {
    const root = document.createElement('div');
    root.innerHTML = renderChordPro(intro);
    const chords = [...root.querySelectorAll('.chord')].map(e => e.textContent).filter(Boolean);
    expect(chords).toEqual(['E', 'C#m7', 'F#m7', 'A']);
    expect(root.textContent?.match(/\|/g)).toHaveLength(10);
    expect(root.textContent?.match(/-/g)).toHaveLength(28);
    expect(root.textContent).toContain('x2');
  });

  it.each(['x2', 'X2', '×2', 'x 2', '2x'])('preserves repeat marker %s and transposes the complete line', marker => {
    const source = `{key: E}\nIntro\n| F#m7 - - - | A - - - | ${marker}`;
    const song = prepareSong(source, 2)!;
    const chords: string[] = [];
    song.mapChordLyricsPairs(pair => { if (pair.chords) chords.push(pair.chords); return pair; });
    expect(chords).toEqual(['G#m7', 'B']);
    const root = document.createElement('div');
    root.innerHTML = renderChordPro(source);
    expect(root.textContent).toContain(marker);
  });
});
