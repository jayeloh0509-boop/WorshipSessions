import { IMPORT_MAX_BATCH, IMPORT_MAX_BATCH_BYTES } from './constants';

const HAS_TITLE = /\{title:/i;

function basename(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

function filenameMetadata(filename: string): { title: string; artist: string } {
  const name = basename(filename).trim();
  const separator = name.lastIndexOf(' - ');
  if (separator < 1) return { title: name, artist: '' };
  return {
    title: name.slice(0, separator).trim(),
    artist: name.slice(separator + 3).trim(),
  };
}

function firstChordKey(text: string): string {
  const match = text.match(/\[\|?\s*([A-G](?:b|#)?(?:m)?)(?=[0-9/\s|\]])/);
  return match?.[1] || '';
}

function snapEmbeddedChordsToWordStarts(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let result = line;
      const embeddedChord = /([\p{L}\p{N}'’]+)(\[[A-G][^\]\r\n]*\])(?=[\p{L}\p{N}'’])/u;
      while (embeddedChord.test(result)) result = result.replace(embeddedChord, '$2$1');
      return result.replace(/([\p{L}\p{N}'’]+)(\[[A-G][^\]\r\n]*\])(?=[?!,.;:])/gu, '$2$1');
    })
    .join('\n');
}

export function textChartToChordPro(filename: string, text: string): string {
  const normalized = snapEmbeddedChordsToWordStarts(
    text
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .trim(),
  );
  if (HAS_TITLE.test(normalized)) return normalized;

  const { title, artist } = filenameMetadata(filename);
  const key = firstChordKey(normalized);
  const directives = [
    `{title: ${title || 'Untitled'}}`,
    ...(artist ? [`{artist: ${artist}}`] : []),
    ...(key ? [`{key: ${key}}`] : []),
    '{x_language: en}',
  ];
  return `${directives.join('\n')}\n\n${normalized}`;
}

export function fileToSong(filename: string, text: string): { content: string } {
  if (HAS_TITLE.test(text)) return { content: text };
  return { content: `{title: ${basename(filename)}}\n${text}` };
}

export function chunkSongs(songs: { content: string }[]): { content: string }[][] {
  const batches: { content: string }[][] = [];
  let current: { content: string }[] = [];
  let bytes = 0;
  for (const song of songs) {
    const size = new Blob([song.content]).size;
    if (current.length > 0 && (current.length >= IMPORT_MAX_BATCH || bytes + size > IMPORT_MAX_BATCH_BYTES)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(song);
    bytes += size;
  }
  if (current.length) batches.push(current);
  return batches;
}
