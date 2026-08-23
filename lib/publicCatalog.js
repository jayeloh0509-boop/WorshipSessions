const BASE_URL = 'https://worshipchordbook.com';
const CATALOG_URL = `${BASE_URL}/hymns`;
const CACHE_MS = 15 * 60 * 1000;
const MAX_HTML = 2 * 1024 * 1024;
let catalogCache = { expires: 0, songs: [] };
const POPULAR_SLUGS = [
  'amazing-grace',
  'be-thou-my-vision',
  'blessed-assurance',
  'come-thou-fount-of-every-blessing',
  'how-great-thou-art',
  'great-is-thy-faithfulness',
  'holy-holy-holy',
  'it-is-well-with-my-soul',
];

function decodeHtml(value = '') {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#039;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function text(value = '') {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function capture(block, className) {
  const re = new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i');
  return text(block.match(re)?.[1] || '');
}

function parseCatalog(html) {
  const songs = [];
  const cardRe =
    /<a[^>]+href=["'](?:https:\/\/worshipchordbook\.com)?\/hymns\/([a-z0-9-]+)["'][^>]*class=["'][^"']*wk-card[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = cardRe.exec(html))) {
    const [, slug, block] = match;
    const title = capture(block, 'song-card-title');
    if (!title || songs.some((song) => song.slug === slug)) continue;
    const tags = [...block.matchAll(/<span[^>]+class=["'][^"']*card-tag[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
      .map((tag) => text(tag[1]))
      .filter(Boolean);
    songs.push({
      slug,
      title,
      artist: capture(block, 'song-card-author'),
      key: capture(block, 'song-card-key'),
      tags,
      source: 'WorshipChordBook',
      license: 'Public Domain',
    });
  }
  return songs;
}

function extractHeading(html) {
  const candidates = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => text(match[1])).filter(Boolean);
  return candidates.find((value) => !/worshipchordbook/i.test(value)) || candidates[0] || '';
}

function metaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = html.match(
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, 'i'),
  );
  const reversed = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  );
  return decodeHtml(direct?.[1] || reversed?.[1] || '').trim();
}

function parseChart(html, slug) {
  const chartStart = html.search(/<div[^>]+class=["'][^"']*\bchord-chart\b[^"']*["'][^>]*>/i);
  if (chartStart < 0) throw new Error('Chord chart not found at the public source');
  const openingEnd = html.indexOf('>', chartStart);
  const afterChart = html.slice(openingEnd + 1);
  const chartEnd = afterChart.search(/<div[^>]+class=["'][^"']*\barr-sub\b/i);
  const chartHtml = chartEnd >= 0 ? afterChart.slice(0, chartEnd) : afterChart;
  const title =
    extractHeading(html) ||
    slug
      .split('-')
      .map((word) => word[0]?.toUpperCase() + word.slice(1))
      .join(' ');
  const artist =
    capture(html, 'hymn-author') ||
    capture(html, 'song-author') ||
    capture(html, 'song-card-author') ||
    metaContent(html, 'music:musician');
  const key =
    capture(html, 'arr-key') ||
    capture(html, 'song-card-key') ||
    capture(html, 'key-badge') ||
    chartHtml.match(/<span[^>]+class=["'][^"']*chord-token[^"']*["'][^>]*>([A-G](?:#|b)?)/i)?.[1] ||
    '';
  const tags = [...html.matchAll(/<span[^>]+class=["'][^"']*card-tag[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => text(match[1]))
    .filter(Boolean);
  const output = [];
  const rowRe = /<(p|div)[^>]+class=["'][^"']*(section-label|chord-line|chord-blank)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let row;
  while ((row = rowRe.exec(chartHtml))) {
    const kind = row[2];
    if (kind === 'chord-blank') {
      output.push('');
      continue;
    }
    if (kind === 'section-label') {
      output.push(`{comment: ${text(row[3])}}`);
      continue;
    }
    let line = row[3]
      .replace(
        /<span[^>]+class=["'][^"']*chord-token[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
        (_, chord) => `[${text(chord)}]`,
      )
      .replace(/<span[^>]+class=["'][^"']*lyric-text[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, (_, lyric) =>
        decodeHtml(lyric.replace(/<[^>]+>/g, '')),
      );
    line = text(line.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']'));
    if (line) output.push(line);
  }
  if (!output.some((line) => /\[[A-G][#b]?/.test(line))) throw new Error('No chords found at the public source');
  const directives = [
    `{title: ${title}}`,
    artist ? `{artist: ${artist}}` : '',
    key ? `{key: ${key}}` : '',
    '{x_language: en}',
    `{x_tags: ${[...new Set(['public-domain', 'hymn', ...tags.map((tag) => tag.toLowerCase())])].join(',')}}`,
    `{x_source: ${BASE_URL}/hymns/${slug}}`,
    '{x_license: Public Domain}',
  ].filter(Boolean);
  return {
    slug,
    title,
    artist,
    key,
    tags,
    source: 'WorshipChordBook',
    license: 'Public Domain',
    content: `${directives.join('\n')}\n\n${output
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()}\n`,
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    signal: globalThis.AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'WorshipSessions/1.20 (+public-domain-import)' },
  });
  if (!response.ok) throw new Error(`Public catalog returned HTTP ${response.status}`);
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) throw new Error('Public catalog returned an unexpected response');
  const html = await response.text();
  if (html.length > MAX_HTML) throw new Error('Public catalog response is too large');
  return html;
}

function rankPopularSongs(songs) {
  const bySlug = new Map(songs.map((song) => [song.slug, song]));
  return POPULAR_SLUGS.map((slug) => bySlug.get(slug)).filter(Boolean);
}

async function loadCatalog() {
  if (Date.now() >= catalogCache.expires) {
    const songs = parseCatalog(await fetchHtml(CATALOG_URL));
    if (!songs.length) throw new Error('Public catalog format is unavailable');
    catalogCache = { songs, expires: Date.now() + CACHE_MS };
  }
  return catalogCache.songs;
}

async function searchPublicCatalog(query) {
  const songs = await loadCatalog();
  const terms = String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return [];
  return songs
    .filter((song) => {
      const haystack = `${song.title} ${song.artist} ${song.tags.join(' ')}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 30);
}

async function getPopularSongs() {
  return rankPopularSongs(await loadCatalog());
}

async function getPublicChart(slug) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) throw new Error('Invalid public song identifier');
  return parseChart(await fetchHtml(`${BASE_URL}/hymns/${slug}`), slug);
}

module.exports = { parseCatalog, parseChart, rankPopularSongs, searchPublicCatalog, getPopularSongs, getPublicChart };
