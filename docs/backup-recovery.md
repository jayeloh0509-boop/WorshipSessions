# SQLite backup and isolated recovery drill

These local-only tools never start the application, load `.env`, resolve a default
DB path, run app migrations, or replace an existing database. Every path is explicit.
No `--force`, automatic restore, retention/deletion, scheduler or service changes
are provided. Nothing here authorizes a production restore.

## Backup

Create the destination parent directory yourself in a trusted location with enough
free disk space. Use a new filename on every run:

```sh
node scripts/backup-db.js --source "C:/path/to/source.sqlite" --destination "C:/backups/session-unique.sqlite"
```

The source must already be a regular file. The destination and its `-wal`, `-shm`
and `-journal` paths must all be absent. Existing files, directories, hardlinks,
symlinks (including dangling ones), symlink/junction ancestors, source aliases and
source-sidecar overlaps are refused. Do not pass a sidecar as the source.

The helper opens the source with `readonly: true`, `fileMustExist: true`, and
`query_only = ON`; it uses **SQLite's online backup API**, not a raw file copy.
Committed WAL-only data is included. Concurrent writers can continue; the result
is a consistent committed snapshot, not necessarily the state at command start.
Uncommitted transactions are not included. There is no source checkpoint, migration,
journal-mode change, application write, or secret/chart-content logging.

The complete database is copied, including users, password hashes, keys/settings,
private songs, relationships, preparation fields, triggers, indexes and search
structures. Treat backups as sensitive, unencrypted application data. Summaries
contain paths, bytes and table row counts only; never share a backup publicly.

A private temporary directory is created **in the destination parent**. Only the
snapshot is normalized to DELETE journal mode. A separately reopened connection
runs `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, and table counts. The
file is flushed and atomically published using an exclusive hardlink: an existing
target can never be replaced. Filesystems without hardlink support fail closed
(no unsafe rename/copy fallback). Failure before publication leaves no successful
looking destination. Temporary files owned by the operation are cleaned up; a
post-publication cleanup failure is reported as `stagingCleanupWarning: true`.

## Isolated recovery verification (not a live restore)

Create a separate scratch directory **outside the backup directory tree** and
choose a database filename that does not exist:

```sh
node scripts/verify-db-backup.js --backup "C:/backups/session-unique.sqlite" --scratch "C:/recovery-drill/new.sqlite"
```

This copies the backup through the same read-only SQLite backup pipeline into a
fresh scratch database, reopens/checks it, and leaves that scratch artifact for
inspection. It never points the app at it, changes `DB_PATH`, starts a server,
modifies the backup, replaces a live database, or deletes an existing target.
Run the application against recovered data only through a separately reviewed,
explicitly authorized maintenance procedure; that is outside these tools.

Success is one JSON object on stdout with `ok: true`, `operation`, paths, `bytes`,
`integrity: "ok"`, `foreignKeyViolations: 0`, and `tableCounts`. Recovery also includes
`backup` and `scratch`. Exit status is 0. Errors emit redacted JSON on stderr with
`ok: false` and `code`; exit 2 means usage/invalid arguments, exit 1 means a safety,
filesystem or SQLite failure. `--help` prints usage and exits 0. Unknown/duplicate
flags and missing arguments are rejected. Paths are not included in error messages.

## Limits and operating assumptions

- Use trusted, local directories. Portable Node path checks cannot defeat a hostile
  process swapping parent directories, junctions or source files mid-operation.
  Final target publication is exclusive, but sidecar checks are not a lock against
  other processes creating sidecars. Do not let another process open a target
  until this command succeeds. Windows path alias checks are best effort (case,
  real parents); exotic short-name/reparse/network aliases are not fully provable.
- Read-only SQLite connections cannot mutate source tables. SQLite may still need
  existing WAL/SHM access or create/update shared-memory sidecars depending on
  SQLite/filesystem permissions and active connections. No `immutable=1` shortcut
  is used because it could ignore active WAL writes. A read-only media WAL source
  without usable sidecars may fail; do not remove sidecars to work around this.
- File data is flushed before publication, but directory fsync/power-loss durability
  and off-machine replication are not promised. Keep independently stored copies.
- Sustained write load can delay online backup completion. No timeout/cancellation
  policy is supplied. Schedule a quieter window if needed.
- Integrity/FK checks establish SQLite structure and declared relationships, not
  semantic correctness, application compatibility, external assets, FTS index
  semantic equivalence, key validity, or ability to log in. Perform application
  smoke checks only in an independently isolated environment. Unknown custom
  SQLite extensions/collations may cause verification to fail closed.
- Unix staging directories/files use 0700/0600. On Windows these mode bits are not
  an ACL policy: protect backup and scratch parents with appropriate Windows ACLs.
- This does not clean up older backups or scratch drills. Remove only artifacts
  you have identified and separately chosen to delete.

## Regression tests (synthetic data only)

```sh
node --test test/backupRestore.test.js
npx eslint lib/databaseBackup.js test/backupRestore.test.js
npx eslint --no-ignore scripts/backup-db.js scripts/verify-db-backup.js
```

Tests use `TMPDIR` (Hermes scratch when configured), otherwise Node's configured
temporary directory. Current-schema fixtures initialize `lib/db.js` **only in a
child process with an explicit absolute synthetic `DB_PATH`**, never against
`data/worshipsessions.db`. Fixture secrets and chart bodies are synthetic and are
not logged. All test cleanup is limited to each test's own temporary directory.
