# WorshipSessions — Local Setup (this machine)

Native Windows Node/npm install (no Docker). Part of the Hermes/EmperorClaw machine;
EmperorClaw owns `127.0.0.1:3000`, so WorshipSessions runs on **`http://127.0.0.1:3001`**.

## Configuration

`.env` (gitignored, already created):

- `JWT_SECRET` — random 96-hex-char secret (do not print or commit)
- `PORT=3001`
- `HOST=127.0.0.1` — loopback only (`server.js` was patched to honor `HOST`)
- `DB_PATH=C:/Users/jayel/chordvault/data/chordvault.db` — persistent SQLite DB (WAL mode)

## Build & run

```powershell
cd C:\Users\jayel\chordvault
npm ci                          # root deps
cd frontend; npm ci; npm run build; cd ..   # builds SPA into public/
npm start                       # serves app on http://127.0.0.1:3001
```

Or double-click / run `start-worshipsessions.cmd`.

## First use

Use the existing local owner account. Do not expose an unclaimed first-user registration flow to the public internet. Before permanent deployment, verify owner access locally and restrict registration to invites.

## Tests

```powershell
npm test                        # backend (node --test)
cd frontend; npm test           # frontend (vitest)
```
