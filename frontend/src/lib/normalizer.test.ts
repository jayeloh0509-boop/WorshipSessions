import { describe, expect, it } from 'vitest';
import { proposeNormalization } from './normalizer';

describe('conservative normalization', () => {
  it('normalizes explicit labels, preserves CRLF and repeats', () => {
    const source = '{comment: verse x2}\r\n[G]words\r\n{comment: Chorus}\r\n';
    const result = proposeNormalization(source);
    expect(result.proposed).toBe('{comment: Verse x2}\r\n[G]words\r\n{comment: Chorus}\r\n');
    expect(result.changes).toHaveLength(1);
  });
  it('leaves ambiguous lyric words and metadata unchanged', () => {
    const source = 'verse words\n{title: verse}\n[Bridge]\n';
    expect(proposeNormalization(source).proposed).toBe(source);
    expect(proposeNormalization(source).changes).toHaveLength(0);
  });
});
