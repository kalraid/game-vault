# ADR-0001: GameVault Portal Scope & SDK Contract

**Status**: Accepted

## Context

GameVault hosts browser games built and maintained in separate repositories. It needs to define, once, what the portal itself owns versus what it leaves to a game module, and how the two talk to each other.

## Decision

**Scope.** GameVault is a game-agnostic portal, not built around any single game. It owns auth, save data, account-wide data, realtime event relay, the game registry, and launching a game module (embedded or in a new window). It owns none of a game's logic, assets, or rendering — those live entirely in the game module's own repository.

**SDK contract.** A game module talks to the portal exclusively via `postMessage`:

```ts
// game module -> portal
{ type: "gamevault:sdk-request", requestId, gameId, method, payload? }
// portal -> game module
{ type: "gamevault:sdk-response", requestId, ok, result?, error? }
// portal -> game module, unsolicited
{ type: "gamevault:realtime-event", event, payload }
```

`method` is one of `auth.getToken`, `save.load`, `save.store`, `account.get`, `account.set`, `realtime.subscribe`, `realtime.emit`. This is the entire surface a game module may rely on — no direct DB access, no local file save access, and no assumption that the iframe and new-window launch modes share an origin.

**Launch mode: iframe + new window, both untrusted-origin-capable.** A game module can be embedded in an iframe or opened as a new window/tab; both use the same postMessage contract so a game module doesn't need to special-case its launch mode beyond checking `window.opener || window.parent`.

The current iframe uses `sandbox="allow-scripts allow-forms allow-popups allow-same-origin"`. Combining `allow-scripts` with `allow-same-origin` is a known browser-flagged pattern that lets embedded content escape the sandbox (confirmed via a console warning during testing) — so **this is not a real isolation boundary today**. We accept this consciously: game modules are currently treated as trusted code, not adversarial input, because the SDK contract itself (not sandbox isolation) is what limits what a game module can do — it never gets DB access or another user's data, only its own `gameId`-scoped save/realtime surface (account data is intentionally broader — see below). If a game module ever needs to be treated as untrusted (e.g. third-party-authored), the iframe would need to be served from a separate origin with `allow-same-origin` dropped.

**Realtime transport: socket.io, per-account rooms.** The portal connects one socket.io client per browser session (authenticated with the portal's user id), joins a room named for that user id server-side, and fans realtime events out to that room. This is deliberately account-wide, not per-tab: if the same account has the portal open in two tabs/windows, an event emitted from one is delivered to both — that's cross-session sync, not a leak. A game module's `realtime.subscribe` is additive and event-name scoped; `realtime.emit` is persisted (`RealtimeEvent` table) and then relayed only within the emitting user's own account — never broadcast to other users.

**Persistence tiers — save data is per-game, account data is cross-game.** Prisma models split saved state into two tiers with different scopes and independent lifecycles: `GameSave` (per `userId` + `gameId` + `slot`, a `schema_version`-tagged JSON blob — one game's save data is invisible to other games) and `AccountData` (per `userId` + `key` only — **no `gameId` column at all**, also `schema_version`-tagged). Account data is intentionally shared across every game module on the same account; this is the mechanism for cross-game unlocks (e.g. an achievement in one game unlocking content in another, per the portal's founding brief). Game modules are expected to namespace their own account keys by convention to avoid colliding with another game's keys — the portal does not enforce namespacing.

## Consciously temporary (not final decisions)

- **Auth**: Auth.js Credentials provider is wired server-side (`server/auth.ts`) but has no client UI reaching it, and the `/api/*` gate (`requireUser`) doesn't check that session at all — it resolves every request to one hardcoded `dev@example.com` user via an `x-dev-user` header the client never sends. In effect there is currently a single shared account, not per-browser dev logins. A real design (guest-by-default identity, login as an additive promotion rather than a hard requirement) is decided in [ADR-0002](./0002-guest-sessions-and-login-promotion.md), not yet implemented.
- **Persistence engine**: SQLite via Prisma, including in the Docker deployment path (`docker-compose.yml`'s `portal-data` volume). This assumes a single-instance deployment; a move to a networked DB (e.g. Postgres) if GameVault needs to scale out is unresolved.

## Open questions

- Realtime transport is forced to `transports: ["websocket"]` (no long-polling fallback) in `client/ui/App.tsx`. Whether this is deliberate (e.g. avoiding sticky-session requirements) or incidental has not been confirmed — revisit before relying on it either way.
- Whether/when to harden the iframe launch mode with real origin isolation once game modules are no longer uniformly trusted.
- **New-window launch mode has no direct API path.** A game module never calls `/api` itself — every SDK call is `postMessage`'d to `window.opener || window.parent`, so the portal always does the actual fetch on the game module's behalf. In new-window mode this means the game is only as alive as the portal tab that opened it: if the player closes the original portal tab, `window.opener` becomes `null` and every subsequent SDK call (including saves) silently fails. This is accepted as a known gap for now, tracked as a backlog item — a fix would need new-window-launched games to hit `/api` directly (their own auth/session handling) instead of proxying through the opener.
