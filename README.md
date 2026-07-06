# GameVault Portal

GameVault Portal is the web host for browser games described by `0034-godot-to-web-pivot.md`.
It provides the portal-side SDK contract for auth, saves, account-wide data, and realtime events.

## Stack

- Vite + React for the portal frontend
- Express for API and static serving
- Auth.js endpoint wiring with a development credentials provider
- Prisma for persistence
- SQLite for local development, PostgreSQL-compatible `DATABASE_URL` for production

## Development

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Open `http://localhost:5175`.

The portal seeds one mock game automatically. The mock game exercises:

- `auth.getToken()`
- `save.load(slot)`
- `save.store(slot, data)`
- `account.get()`
- `account.set(key, value)`
- `realtime.emit(event, payload)`

## SDK Message Contract

Embedded games send requests to the portal with `postMessage`:

```ts
{
  type: "gamevault:sdk-request",
  requestId: string,
  gameId: string,
  method: "auth.getToken" | "save.load" | "save.store" | "account.get" | "account.set" | "realtime.subscribe" | "realtime.emit",
  payload?: unknown
}
```

The portal replies:

```ts
{
  type: "gamevault:sdk-response",
  requestId: string,
  ok: boolean,
  result?: unknown,
  error?: string
}
```

## Notes

- iframe sandbox is the default launch path.
- The window launch path uses the same message contract through `window.opener`.
- Godot local save migration is intentionally out of scope for this repo.
