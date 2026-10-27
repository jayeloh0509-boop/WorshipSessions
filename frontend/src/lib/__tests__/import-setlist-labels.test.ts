/**
 * Verify that every imported chart's section headings are recognised by the
 * frontend's own isSectionLabel(), so they render as headings rather than
 * as stray lyric lines.
 *
 * The heading list comes from the import records, where the converter
 * recorded exactly which lines it emitted as section labels. That is the
 * precise set to check, rather than guessing from the chart text which
 * lines were meant to be headings.
 *
 * Run with: npx vitest run src/lib/__tests__/import-setlist-labels.test.ts
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isSectionLabel } from '../chords';

// frontend/src/lib/__tests__ -> the app root is one level above frontend/
const APP = path.resolve(__dirname, '..', '..', '..', '..');
const RECORDS = path.join(process.env.LOCALAPPDATA || '', 'hermes', 'cache', 'scratch', 'wt2', 'import_records.json');

interface ImportRecord {
  slug: string;
  title: string;
  artist: string;
  content: string;
  headings: string[];
}

function loadRecords(): ImportRecord[] {
  return JSON.parse(readFileSync(RECORDS, 'utf8')) as ImportRecord[];
}

function loadRows(): { id: number; title: string; content: string }[] {
  const script = `
    const path = require('path');
    const { db } = require(path.join(${JSON.stringify(APP)}, 'lib', 'db'));
    const rows = db.prepare(
      "SELECT id, title, content FROM songs WHERE id BETWEEN 1184 AND 1331 AND status = 'active' ORDER BY id"
    ).all();
    console.log(JSON.stringify(rows));
    db.close();
  `;
  const out = execFileSync('node', ['-e', script], { cwd: APP, encoding: 'utf8' });
  return JSON.parse(out);
}

const records = loadRecords();
const rows = loadRows();

describe('imported setlist charts: section labels', () => {
  it('loaded the imported rows', () => {
    expect(rows.length).toBe(148);
    expect(records.length).toBeGreaterThan(150);
  });

  it('every heading the converter emitted is recognised by the frontend', () => {
    const bad: { title: string; label: string }[] = [];
    let headingCount = 0;

    for (const rec of records) {
      for (const label of rec.headings ?? []) {
        headingCount += 1;
        if (!isSectionLabel(label)) {
          bad.push({ title: rec.title, label });
        }
      }
    }

    expect(headingCount).toBeGreaterThan(1000);
    if (bad.length) {
      const summary = bad.slice(0, 25).map((b) => `${b.title} -> "${b.label}"`);
      throw new Error(`${bad.length} unrecognised heading(s):\n${summary.join('\n')}`);
    }
  });

  it('the stored charts carry the recorded headings', () => {
    // the chart in the database must carry the same headings the converter
    // produced, so the check above really covers what was stored
    let checked = 0;
    for (const row of rows) {
      const match = records.find((r) => r.content === row.content);
      if (!match) continue;
      for (const label of match.headings ?? []) {
        expect(row.content).toContain(label);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(700);
  });

  it('no directive appears after the content begins', () => {
    const offenders: string[] = [];
    for (const row of rows) {
      let started = false;
      for (const raw of row.content.split('\n')) {
        const s = raw.trim();
        if (!s) continue;
        if (s.startsWith('{') && s.endsWith('}')) {
          if (started) offenders.push(`id ${row.id} ${row.title} -> ${s}`);
          continue;
        }
        started = true;
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every chart has at least one chord', () => {
    const empty: string[] = [];
    for (const row of rows) {
      if (!/\[[A-G][#b]?/.test(row.content)) empty.push(`id ${row.id} ${row.title}`);
    }
    expect(empty).toEqual([]);
  });
});
