import { needsEmbeddedFont, unsupportedChars } from '../pdf-fonts';

describe('needsEmbeddedFont', () => {
  it('is false for a plain English song, newlines and all', () => {
    expect(needsEmbeddedFont('{title: Amazing Grace}\n{key: G}\n[G]sweet the [C]sound\n')).toBe(false);
  });
  it('is false for Latin-1 accents', () => {
    expect(needsEmbeddedFont('Café Días')).toBe(false);
  });
  it('is true for Chinese', () => {
    expect(needsEmbeddedFont('奇異恩典')).toBe(true);
  });
  it('is true for mixed content', () => {
    expect(needsEmbeddedFont('奇異恩典 Amazing Grace')).toBe(true);
  });
});

describe('unsupportedChars', () => {
  // Regression guard: an earlier draft treated \n as unsupported, so every
  // English export warned and users would have learned to ignore it.
  it('finds nothing in a real English song', () => {
    expect(unsupportedChars('{title: T}\n[G]la la\n\tx\r\n')).toEqual([]);
  });
  it('finds nothing in Chinese', () => {
    expect(unsupportedChars('奇異恩典 何等甘甜')).toEqual([]);
  });
  // Noto Sans TC covers kana but NOT hangul — verified against the real font
  it('finds nothing in Japanese kana', () => {
    expect(unsupportedChars('こんにちは')).toEqual([]);
  });
  it('flags Korean', () => {
    expect(unsupportedChars('안녕하세요').length).toBeGreaterThan(0);
  });
  it('flags Thai', () => {
    expect(unsupportedChars('สวัสดี').length).toBeGreaterThan(0);
  });
  it('deduplicates', () => {
    expect(unsupportedChars('안안안')).toEqual(['안']);
  });
});
