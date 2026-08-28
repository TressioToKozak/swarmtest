# Swarmfall

Swarmfall is a browser survival game with single-player and authoritative WebSocket multiplayer modes. Progress can be stored locally and synchronized to an account.

## Requirements and setup

- Node.js 20.19 or newer
- npm

```bash
npm ci
npm start
```

Open `http://localhost:8080`. Run checks with:

```bash
npm test
npm run syntax:check
npm run lint
npm run format:check
npm run format
```

## Controls and modes

Move with **W/A/S/D**, aim with the mouse, and use **Q/E/R** for abilities. Single-player includes map progression, upgrades, items, augments, and bosses. Multiplayer lets up to four players create or join a lobby and runs an authoritative server simulation.

## Accounts and progress

The browser keeps local single-player state. When signed in, client-owned settings and saves are synchronized, while protected achievements, currencies, character purchases, map completion, and multiplayer settlements are applied through validated, revision-safe server operations. Pending single-player operations remain in a local outbox until acknowledged.

The account store defaults to `data/accounts.json`; override it with `ACCOUNT_FILE`. It is an atomically replaced JSON file intended primarily for a single server instance, not a multi-writer cluster.

## Environment variables

- `PORT` — HTTP/WebSocket port (default `8080`).
- `ACCOUNT_FILE` — account JSON path.
- `TRUST_PROXY` — trust forwarded client IP/protocol headers when set to a true value.
- `WS_ALLOWED_ORIGINS` — comma-separated production browser Origin allowlist.
- `MP_DEBUG` — enable multiplayer diagnostic logging.

Behind a reverse proxy, enable `TRUST_PROXY` only when the application is reachable exclusively through that trusted proxy, forward the original protocol and client address, and configure `WS_ALLOWED_ORIGINS` explicitly.
