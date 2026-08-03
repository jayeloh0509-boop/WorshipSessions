import { jsPDF, type jsPDFOptions } from 'jspdf';
import fontUrl from '../assets/NotoSansTC.ttf?url';
import { EMBEDDED_FONT } from './constants';

// What the jsPDF built-in Latin face can draw: whitespace, ASCII, Latin-1,
// common punctuation, euro. \s matters — song content is full of newlines.
const BUILTIN = /[\s -~ -ÿ‐-‧€]/;

// What Noto Sans TC adds: CJK punctuation, kana, strokes, enclosed forms,
// ideographs, compatibility and fullwidth. Hangul is NOT covered — keep this
// in step with the font file or unsupportedChars starts lying.
const EMBEDDED =
  /[　-〿぀-ヿ㇀-㇯㈀-㋿㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]/;

export function needsEmbeddedFont(text: string): boolean {
  return [...text].some((ch) => !BUILTIN.test(ch));
}

export function unsupportedChars(text: string): string[] {
  return [...new Set([...text].filter((ch) => !BUILTIN.test(ch) && !EMBEDDED.test(ch)))];
}

let cached: Promise<string> | null = null;

async function fetchFont(): Promise<string> {
  const res = await fetch(fontUrl);
  if (!res.ok) throw new Error(`font fetch failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let bin = '';
  // chunked — spreading 11MB in one call blows the argument limit
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

export async function loadPdfFont(text: string): Promise<string | null> {
  if (!needsEmbeddedFont(text)) return null;
  // don't cache a rejection — one flaky fetch would break exports until reload
  cached ??= fetchFont().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

export function makePdfConstructor(fontBase64: string | null) {
  if (!fontBase64) return jsPDF;
  // re-bound: TS does not carry the null-narrowing into the class body
  const data = fontBase64;
  return class extends jsPDF {
    // jsPDFOptions, imported directly. ConstructorParameters<typeof jsPDF>[0]
    // looks right but resolves to the orientation overload, not the options one.
    constructor(options?: jsPDFOptions) {
      super(options);
      this.addFileToVFS('notosanstc.ttf', data);
      this.addFont('notosanstc.ttf', EMBEDDED_FONT, 'normal');
      this.addFont('notosanstc.ttf', EMBEDDED_FONT, 'bold');
    }
  };
}
