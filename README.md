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

## Scripts

- `npm run dev` - start client and server
- `npm run build` - typecheck and production build
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate` - apply migrations
- `npm run test` - run Vitest

## Current status

- Game list, auth, save storage, account storage, and realtime event transport are present.
- The mock game can exercise the portal SDK in both iframe and window launch modes.
- `realtime.subscribe` is implemented as a basic event subscription bridge.
- Automated tests are not yet present in this checkout.

## Remaining work

- Add tests for the portal API and SDK bridge.
- Tighten realtime behavior if the game-side contract changes.
- Expand the game registry and seed data as more games are added.
- Keep the README and ADR aligned with any future contract changes.
