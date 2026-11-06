const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

// Dependency-floor and resolution regressions, not a comprehensive exploit suite.
// No server, database, dotenv, network, or application entry point is loaded.
const root = path.resolve(__dirname, '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const appRequire = createRequire(path.join(root, 'package.json'));
const floors = {
  'body-parser': '2.4.0',
  'proxy-addr': '2.0.8',
  qs: '6.17.1',
  'iconv-lite': '0.7.3',
};

function assertStableAtLeast(version, minimum, label) {
  // Deliberately reject prereleases rather than treating an rc as a patched release.
  assert.match(version, /^\d+\.\d+\.\d+$/, `${label}: expected a stable version`);
  const actual = version.split('.').map(Number);
  const floor = minimum.split('.').map(Number);
  const difference = actual.map((part, index) => part - floor[index]).find((part) => part !== 0);
  assert.ok(difference === undefined || difference > 0, `${label}: ${version} must be >= ${minimum}`);
}

function lockedCopies(name) {
  const suffix = `node_modules/${name}`;
  const copies = Object.entries(lock.packages).filter(
    ([location]) => location === suffix || location.endsWith(`/${suffix}`)
  );
  assert.ok(copies.length > 0, `${name}: missing from lockfile`);
  return copies;
}

function installedMetadata(location) {
  return JSON.parse(fs.readFileSync(path.join(root, location, 'package.json'), 'utf8'));
}

function assertResolvedCopy(caller, name, minimum, label) {
  const manifestPath = caller.resolve(`${name}/package.json`);
  const metadata = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const location = path.relative(root, path.dirname(manifestPath)).split(path.sep).join('/');
  assert.equal(metadata.name, name, `${label}: package identity`);
  assertStableAtLeast(metadata.version, minimum, label);
  assert.ok(lock.packages[location], `${label}: resolved copy must exist in lockfile (${location})`);
  assert.equal(metadata.version, lock.packages[location].version, `${label}: installed/locked mismatch`);
  // Exercise actual CommonJS loading as well as metadata resolution.
  caller(name);
  return createRequire(manifestPath);
}

for (const [name, minimum] of Object.entries(floors)) {
  test(`${name}: every locked copy meets the patched stable floor`, () => {
    for (const [location, metadata] of lockedCopies(name)) {
      assertStableAtLeast(metadata.version, minimum, location);
    }
  });

  test(`${name}: every locked installation agrees with the lock and meets the floor`, () => {
    for (const [location, locked] of lockedCopies(name)) {
      const installed = installedMetadata(location);
      assert.equal(installed.name, name, `${location}: package identity`);
      assert.equal(installed.version, locked.version, `${location}: installed/locked mismatch`);
      assertStableAtLeast(installed.version, minimum, location);
    }
  });

  test(`${name}: application middleware resolves and loads patched locked copies`, () => {
    const expressRequire = createRequire(appRequire.resolve('express/package.json'));
    if (name === 'iconv-lite') {
      const bodyRequire = createRequire(expressRequire.resolve('body-parser/package.json'));
      const rawRequire = createRequire(bodyRequire.resolve('raw-body/package.json'));
      assertResolvedCopy(bodyRequire, name, minimum, 'body-parser -> iconv-lite');
      assertResolvedCopy(rawRequire, name, minimum, 'body-parser -> raw-body -> iconv-lite');
    } else {
      assertResolvedCopy(expressRequire, name, minimum, `express -> ${name}`);
      if (name === 'qs') {
        const bodyRequire = createRequire(expressRequire.resolve('body-parser/package.json'));
        assertResolvedCopy(bodyRequire, name, minimum, 'express -> body-parser -> qs');
      }
    }
  });
}

const frontendLock = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package-lock.json'), 'utf8'));
for (const [name, minimum] of Object.entries({ dompurify: '3.4.17', fflate: '0.8.3' })) {
  test(`${name}: browser runtime lock avoids the disclosed vulnerable versions`, () => {
    const suffix = `node_modules/${name}`;
    const copies = Object.entries(frontendLock.packages).filter(
      ([location]) => location === suffix || location.endsWith(`/${suffix}`)
    );
    assert.ok(copies.length > 0, `${name}: browser runtime dependency missing`);
    for (const [location, metadata] of copies) assertStableAtLeast(metadata.version, minimum, location);
  });
}

test('Express remains a locked stable 5.x middleware runtime', () => {
  const metadata = appRequire('express/package.json');
  assert.match(metadata.version, /^5\.\d+\.\d+$/);
  const expressRequire = assertResolvedCopy(appRequire, 'express', '5.2.1', 'application -> express');
  const express = expressRequire('express');
  assert.equal(typeof express, 'function');
  assert.equal(typeof express.json(), 'function');
  assert.equal(typeof express.urlencoded({ extended: true }), 'function');
});
