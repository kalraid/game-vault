# GameVault Portal

GameVault Portal is the web host for browser games. It provides the portal-side contract for:

- authentication
- save data
- account-wide data
- realtime game events

This repository follows the `game-vault` direction and uses a browser-game portal model rather than local game-only storage.

## What is in this repo

- `client/` - React UI for the portal shell
- `server/` - Express API and auth/session handling
- `shared/` - SDK message types shared by client and game code
- `public/mock-game.html` - local mock game used to exercise the portal contract
- `prisma/` - Prisma schema and migrations
- `GAME_MODULE.md` - contract guide for the external game module repository
- `games.example.json` - sample registry override for extra game modules

## Current stack

- Vite + React for the frontend
- Express for API and static serving
- Auth.js for development login wiring
- Prisma for persistence
- SQLite for local development

## Core SDK contract

Games talk to the portal with `postMessage`:

```ts
{
  type: "gamevault:sdk-request",
  requestId: string,
  gameId: string,
  method:
    | "auth.getToken"
    | "save.load"
    | "save.store"
    | "account.get"
    | "account.set"
    | "realtime.subscribe"
    | "realtime.emit",
  payload?: unknown
}
```

The portal responds with:

```ts
{
  type: "gamevault:sdk-response",
  requestId: string,
  ok: boolean,
  result?: unknown,
  error?: string
}
```

## Development

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Default local ports:

- portal UI: `http://localhost:5173`
- mock game: `http://localhost:5500`

`npm run dev` now performs a local DB bootstrap first (`prisma generate` + `prisma db push`) so the portal starts cleanly on a fresh checkout.

## Docker

The deployment path is Docker-based. The container image builds the React client and Express server together, then starts the portal on port `3001`.

Local compose flow:

```bash
docker compose up --build
```

This exposes:

- portal UI and API: `http://localhost:3001`
- mock game: `http://localhost:3001/mock-game.html?gameId=lords-daughter`

SQLite data is stored in the named Docker volume `portal-data`.

## Game registry

The built-in registry starts with the mock `lords-daughter` entry. To add more modules without changing code, provide `GAMES_JSON` as a JSON array in `.env` using the same shape as [games.example.json](./games.example.json).

## Scripts

- `npm run dev` - start client and server
- `npm run build` - typecheck and production build
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate` - apply migrations
- `npm run test` - run Vitest

## Current status

- Game list, auth, save storage, account storage, and realtime event transport are present.
- The mock game can exercise the portal SDK in both iframe and window launch modes and shows live state for the contract calls.
- `realtime.subscribe` is implemented as a basic event subscription bridge.
- Automated tests are not yet present in this checkout.
- The external game-module contract is documented in [GAME_MODULE.md](./GAME_MODULE.md).

See [TODO.md](./TODO.md) for the current implementation backlog and order.

## Remaining work

- Add tests for the portal API and SDK bridge.
- Tighten realtime behavior if the game-side contract changes.
- Expand the game registry and seed data as more games are added.
- Add new registry entries through `GAMES_JSON` when a new external module is ready.
- Keep the README and ADR aligned with any future contract changes.
