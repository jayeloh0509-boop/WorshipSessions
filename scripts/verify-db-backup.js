#!/usr/bin/env node
'use strict';

const { verifyBackup, parseArguments, reportFailure } = require('../lib/databaseBackup');

async function main() {
  const args = parseArguments(process.argv.slice(2), ['backup', 'scratch']);
  if (!args) {
    console.log('Usage: node scripts/verify-db-backup.js --backup <existing.sqlite> --scratch <new-isolated.sqlite>');
    return;
  }
  console.log(JSON.stringify(await verifyBackup(args)));
}

main().catch(reportFailure);
