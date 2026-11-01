// Run after the opt-in frontend import-fidelity test has generated its HTML.
// Local fixtures only: no sign-in, API requests, provider calls or library saves.
const { chromium } = require('playwright');
const { readFileSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

async function main() {
  const dir = process.argv[2] || process.env.WS_FIDELITY_OUTPUT;
  if (!dir) throw new Error('Pass the evidence directory or set WS_FIDELITY_OUTPUT');
  const root = resolve(dir);
  const names = ['always-on-time-worship-together', 'fall-like-rain-worship-together'];
  const results = [];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const fixture of names) {
      for (const [width, height] of [
        [320, 740],
        [390, 844],
        [1440, 950],
      ]) {
        const page = await browser.newPage({ viewport: { width, height } });
        try {
          await page.goto(pathToFileURL(join(root, `${fixture}-screen.html`)).href);
          const result = await page.evaluate(() => {
            const measures = [...document.querySelectorAll('.instrumental-measure')];
            return {
              viewport: innerWidth,
              pageWidth: document.documentElement.scrollWidth,
              maxRowOverflow: Math.max(
                0,
                ...[...document.querySelectorAll('.row')].map((row) => row.scrollWidth - row.clientWidth),
              ),
              chordCount: [...document.querySelectorAll('.chord')].filter((node) => node.textContent.trim()).length,
              measureCount: measures.length,
              splitMeasures: measures.filter((measure) => {
                const ys = [...measure.querySelectorAll('.column')].map((column) => column.getBoundingClientRect().top);
                return Math.max(...ys) - Math.min(...ys) > 1;
              }).length,
            };
          });
          const content = readFileSync(join(root, `${fixture}-extracted.cho`), 'utf8');
          assert.equal(result.chordCount, [...content.matchAll(/\[([A-G][^\]]*)\]/g)].length);
          assert.ok(result.pageWidth <= width, `${fixture} page overflow at ${width}`);
          assert.equal(result.maxRowOverflow, 0, `${fixture} row overflow at ${width}`);
          assert.ok(result.measureCount > 0, 'No instrumental measures were rendered');
          assert.equal(result.splitMeasures, 0, `${fixture} split a measure at ${width}`);
          await page.screenshot({ path: join(root, `${fixture}-screen-${width}.png`), fullPage: true });
          // An unusually wide measure may reflow internally; it must not force
          // horizontal scrolling or clip beats. This probes the bounded fallback.
          const fallback = await page.evaluate(() => {
            const measure = document.querySelector('.instrumental-measure');
            const children = [...measure.children];
            for (let index = 0; index < 20; index++)
              for (const child of children) measure.appendChild(child.cloneNode(true));
            return {
              page: document.documentElement.scrollWidth,
              row: measure.parentElement.scrollWidth - measure.parentElement.clientWidth,
            };
          });
          assert.ok(fallback.page <= width && fallback.row === 0, 'Oversized-measure fallback overflowed');
          results.push({ fixture, width, height, ...result, oversizedMeasureFallback: 'passed' });
          // Persist each completed case, not only the final batch.
          writeFileSync(join(root, 'layout-verification.json'), JSON.stringify(results, null, 2));
        } finally {
          await page.close();
        }
      }
    }
    assert.equal(results.length, 6);
    console.log(JSON.stringify({ passed: results.length, results }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
