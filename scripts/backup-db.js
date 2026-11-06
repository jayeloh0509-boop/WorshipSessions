#!/usr/bin/env node
'use strict';

const { backupDatabase, parseArguments, reportFailure } = require('../lib/databaseBackup');

async function main() {
  const args = parseArguments(process.argv.slice(2), ['source', 'destination']);
  if (!args) {
    console.log('Usage: node scripts/backup-db.js --source <existing.sqlite> --destination <new.sqlite>');
    return;
  }
  console.log(JSON.stringify(await backupDatabase(args)));
}

main().catch(reportFailure);
